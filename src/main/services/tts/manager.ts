import type { TtsEvent, TtsStartResult } from "@shared/index";
import type { TtsProvider } from "./provider";
import { createTtsProvider } from "./provider";
import type { AudioOutputManager } from "../audio-output/manager";
import { pipelineTelemetry } from "../telemetry/pipeline-telemetry";

const DEFAULT_DEDUPE_WINDOW_MS = 2000;
const MAX_TTS_QUEUE = 5;

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Parse a non-negative integer millisecond window from an env var.
 * Absent/empty → fallback. Non-numeric or negative → warn + fallback.
 * 0 is valid and disables the window.
 */
function parseWindowMs(
  raw: string | undefined,
  envName: string,
  fallback: number
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    console.warn(
      `[CONFIG] ${envName}="${raw}" is not a non-negative integer — using ${fallback}ms`
    );
    return fallback;
  }
  return parseInt(trimmed, 10);
}

const DEBUG = process.env.PIPELINE_DEBUG === "1";
const debugT0 = Date.now();
function log(...args: unknown[]): void {
  if (DEBUG) {
    const t = ((Date.now() - debugT0) / 1000).toFixed(3).padStart(8);
    console.log(`${t}s [TTS]`, ...args);
  }
}

export class TtsManager {
  private provider: TtsProvider | null = null;
  private audioOutput: AudioOutputManager | null = null;
  private emit: ((event: TtsEvent) => void) | null = null;
  private active: boolean = false;
  private speaking: boolean = false;
  private queue: string[] = [];
  /** Aborts the in-flight synthesis (interruption / stop). */
  private currentSynthesis: AbortController | null = null;
  private currentSynthesisText: string = "";

  private lastSpokenText: string = "";
  private lastSpokenTime: number = 0;
  private dedupeWindowMs: number;

  constructor(dedupeWindowMs?: number) {
    if (dedupeWindowMs !== undefined) {
      this.dedupeWindowMs = dedupeWindowMs;
    } else {
      this.dedupeWindowMs = parseWindowMs(
        process.env.TTS_DEDUPE_WINDOW_MS,
        "TTS_DEDUPE_WINDOW_MS",
        DEFAULT_DEDUPE_WINDOW_MS
      );
    }
  }

  get isActive(): boolean {
    return this.active;
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  get queueLength(): number {
    return this.queue.length;
  }

  async start(
    emit: (event: TtsEvent) => void,
    audioOutput: AudioOutputManager,
    providerOverride?: TtsProvider
  ): Promise<TtsStartResult> {
    if (this.active) {
      return { ok: false, message: "TTS is already running." };
    }

    const provider = providerOverride ?? (await createTtsProvider());
    if (!provider) {
      return {
        ok: false,
        message:
          "No TTS provider configured. Set TTS_PROVIDER=azure, say, or mock in .env.",
      };
    }

    this.provider = provider;
    this.audioOutput = audioOutput;
    this.emit = emit;
    this.active = true;

    emit({ type: "tts:started", provider: provider.name });
    return { ok: true, provider: provider.name };
  }

  onTranslationText(text: string): void {
    if (!this.active) {
      log("onTranslationText IGNORED — not active:", text);
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;

    const now = Date.now();
    if (
      trimmed === this.lastSpokenText &&
      now - this.lastSpokenTime < this.dedupeWindowMs
    ) {
      log(`DEDUPED (within ${this.dedupeWindowMs}ms):`, trimmed);
      pipelineTelemetry.markTtsSuppressed();
      return;
    }

    this.lastSpokenText = trimmed;
    this.lastSpokenTime = now;

    // Preemption: newer translated content replaces whatever is currently
    // synthesizing/playing so first audio for the latest utterance starts
    // immediately instead of waiting behind stale audio.
    this.interruptForNewUtterance();

    // Backpressure guard kept as an invariant (queue is normally emptied by
    // the interruption above).
    if (this.queue.length >= MAX_TTS_QUEUE) {
      this.queue.shift();
    }

    this.queue.push(trimmed);
    this.processQueue();
  }

  /**
   * Interrupt whatever is currently queued/speaking so a NEW utterance's
   * audio can start immediately. Cancels in-flight synthesis (aborting the
   * provider call), drops pending queue items, and stops renderer playback.
   * The caller then enqueues the new text as usual.
   */
  interruptForNewUtterance(): void {
    if (!this.active) return;
    const hadWork = this.speaking || this.queue.length > 0;
    if (!hadWork) return;
    const interruptedText = this.currentSynthesisText || "";
    // Finalize the in-flight trace (if any), then every queued item, so the
    // telemetry FIFO stays consistent after the queue is cleared.
    pipelineTelemetry.markTtsInterrupted();
    for (let i = 0; i < this.queue.length; i++) {
      pipelineTelemetry.markTtsInterrupted();
    }
    this.queue = [];
    if (this.speaking && this.currentSynthesis) {
      log("interrupt: aborting in-flight synthesis");
      this.currentSynthesis.abort(new Error("interrupted by new utterance"));
    }
    log("interrupt: clearing playback + queue");
    this.audioOutput?.cancelPlayback();
    if (this.emit) {
      this.emit({ type: "tts:interrupted", text: interruptedText });
    }
  }

  stop(): void {
    const provider = this.provider;
    this.provider = null;
    this.audioOutput = null;
    this.emit = null;
    this.active = false;
    this.speaking = false;
    this.queue = [];
    this.lastSpokenText = "";
    this.lastSpokenTime = 0;
    pipelineTelemetry.resetPipeline();
    if (provider) {
      provider.stop().catch(() => {});
    }
  }

  private async processQueue(): Promise<void> {
    if (
      this.speaking ||
      this.queue.length === 0 ||
      !this.provider ||
      !this.emit ||
      !this.audioOutput
    ) {
      return;
    }

    const text = this.queue.shift()!;
    this.speaking = true;
    const synthesis = new AbortController();
    this.currentSynthesis = synthesis;
    this.currentSynthesisText = text;
    this.emit({ type: "tts:speaking", text });

    try {
      log("synthesize:", text);
      pipelineTelemetry.beginTts();
      const audioChunk = await this.provider.synthesize(
        text,
        synthesis.signal
      );
      pipelineTelemetry.endTtsSuccess();
      log("writeAudio bytes:", audioChunk.data.byteLength);
      await this.audioOutput.writeAudio(audioChunk);
      if (this.emit) {
        this.emit({ type: "tts:spoken", text });
      }
    } catch (err) {
      if (synthesis.signal.aborted) {
        // Interruption is intentional — not a user-facing error. The
        // trace was already finalized by markTtsInterrupted().
        log("synthesize aborted:", errMessage(err));
      } else {
        pipelineTelemetry.endTtsError();
        if (this.emit) {
          this.emit({ type: "tts:error", message: errMessage(err) });
        }
      }
    } finally {
      if (this.currentSynthesis === synthesis) {
        this.currentSynthesis = null;
        this.currentSynthesisText = "";
      }
      this.speaking = false;
      this.processQueue();
    }
  }
}
