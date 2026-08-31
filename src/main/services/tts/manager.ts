/*
 * Urdu English Interpreter
 * Copyright (C) 2026 Muhammad Hasnain Saeed
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import type {
  PlaybackTelemetryEvent,
  TtsEvent,
  TtsStartResult,
} from "@shared/index";
import type { TtsProvider } from "./provider";
import { createTtsProvider } from "./provider";
import type { AudioOutputManager } from "../audio-output/manager";
import { pipelineTelemetry } from "../telemetry/pipeline-telemetry";

const DEFAULT_DEDUPE_WINDOW_MS = 2000;
const MAX_TTS_QUEUE = 5;
/** Interim audio playing longer than this is no longer reaped. */
const INTERIM_STALE_MS = 8_000;

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
  /** True while the in-flight synthesis (`currentSynthesis`) is an interim.
   *  Used to decide whether a final replacing it should preserve the shared
   *  FIFO telemetry trace instead of draining it as interrupted. */
  private speakingInterim: boolean = false;
  private queue: Array<{ text: string; interim: boolean }> = [];
  /**
   * Timestamp of an interim chunk that the renderer is (or was recently)
   * playing. A final translation must be able to replace provisional
   * audio that is still audible, so playing interims count as work for
   * preemption even though synthesis already finished.
   */
  private playingInterimAt: number | null = null;
  private onPlaybackLifecycle: ((payload: PlaybackTelemetryEvent) => void) | null =
    null;
  /** Aborts the in-flight synthesis (interruption / stop). */
  private currentSynthesis: AbortController | null = null;
  private currentSynthesisText: string = "";
  /** Correlation ids for final-path chunks (interim chunks use 0). */
  private nextPlaybackId: number = 1;

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

  /**
   * Playback lifecycle reports (from the renderer, via main) let the
   * manager know when a provisional interim chunk is actually audible
   * and when it finishes, enabling final-translation replacement of
   * stale interim audio. Interim chunks use playbackId 0.
   */
  handlePlaybackLifecycle(payload: PlaybackTelemetryEvent): void {
    if (!payload || payload.playbackId !== 0) return;
    if (payload.event === "start") {
      this.playingInterimAt = Date.now();
    } else if (payload.event === "complete") {
      this.playingInterimAt = null;
    }
  }

  onTranslationText(text: string, interim: boolean = false): void {
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
      // Interim items have no FIFO trace — never drain telemetry for them.
      if (!interim) pipelineTelemetry.markTtsSuppressed();
      return;
    }

    this.lastSpokenText = trimmed;
    this.lastSpokenTime = now;

    // Preemption: newer translated content replaces whatever is currently
    // synthesizing/playing so first audio for the latest utterance starts
    // immediately instead of waiting behind stale audio.
    this.interruptForNewUtterance(interim);

    // Backpressure guard kept as an invariant (queue is normally emptied by
    // the interruption above).
    if (this.queue.length >= MAX_TTS_QUEUE) {
      this.queue.shift();
    }

    this.queue.push({ text: trimmed, interim });
    this.processQueue();
  }

  /**
   * Interrupt whatever is currently queued/speaking so a NEW utterance's
   * audio can start immediately. Cancels in-flight synthesis (aborting the
   * provider call), drops pending queue items, and stops renderer playback.
   * The caller then enqueues the new text as usual.
   *
   * The single FIFO telemetry trace per STT-final is shared between an
   * utterance's interim and final translations. When an in-flight INTERIM
   * stream is replaced by that utterance's FINAL, the trace must be
   * preserved (not drained) so the final synthesis adopts it and is
   * telemetry-attributed; marking it `tts-interrupted` would lose the final.
   *
   * @param toInterim whether the incoming (replacing) text is itself an interim
   */
  interruptForNewUtterance(toInterim: boolean): void {
    if (!this.active) return;
    const interimAudible =
      this.playingInterimAt !== null &&
      Date.now() - this.playingInterimAt < INTERIM_STALE_MS;
    const hadWork = this.speaking || this.queue.length > 0 || interimAudible;
    if (!hadWork) return;
    const interruptedText = this.currentSynthesisText || "";
    // When an in-flight interim is promoted to this utterance's final, keep
    // its FIFO trace alive so the final can adopt and attribute it. Real
    // preemption (or interim→interim replacement) still drains as usual.
    const preserveInterimTrace =
      this.speaking && this.speakingInterim && !toInterim;
    // Only drain FIFO traces for stale synthesis/queue work (unless the
    // trace belongs to an in-flight interim that the final should adopt).
    if (!preserveInterimTrace && (this.speaking || this.queue.length > 0)) {
      pipelineTelemetry.markTtsInterrupted();
      for (const item of this.queue) {
        if (!item.interim) pipelineTelemetry.markTtsInterrupted();
      }
    }
    this.queue = [];
    if (this.speaking && this.currentSynthesis) {
      log("interrupt: aborting in-flight synthesis");
      this.currentSynthesis.abort(new Error("interrupted by new utterance"));
    }
    log("interrupt: clearing playback + queue");
    this.playingInterimAt = null;
    this.audioOutput?.cancelPlayback();
    if (this.emit) {
      this.emit({ type: "tts:interrupted", text: interruptedText });
    }
  }

  stop(): void {
    const provider = this.provider;
    const synthesis = this.currentSynthesis;
    this.provider = null;
    this.audioOutput = null;
    this.emit = null;
    this.active = false;
    this.speaking = false;
    this.speakingInterim = false;
    this.queue = [];
    this.playingInterimAt = null;
    this.lastSpokenText = "";
    this.lastSpokenTime = 0;
    this.currentSynthesis = null;
    this.currentSynthesisText = "";
    // Cancel any in-flight synthesis so a stopped session never forwards
    // stale streamed chunks or keeps consuming provider resources.
    if (synthesis) {
      synthesis.abort(new Error("TTS stopped"));
    }
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

    const item = this.queue.shift()!;
    const text = item.text;
    this.speaking = true;
    this.speakingInterim = item.interim;
    const synthesis = new AbortController();
    this.currentSynthesis = synthesis;
    this.currentSynthesisText = text;
    this.emit({ type: "tts:speaking", text });

    try {
      log(`synthesize${item.interim ? " (interim)" : ""}:`, text);
      if (!item.interim) pipelineTelemetry.beginTts();
      const playbackId = item.interim ? 0 : this.nextPlaybackId++;
      if (this.provider.synthesizeStream) {
        let first = true;
        await this.provider.synthesizeStream(text, async (audioChunk, isFinal) => {
          if (synthesis.signal.aborted) return;
          if (!item.interim && first) pipelineTelemetry.markTtsFirstChunk();
          const chunk = {
            ...audioChunk,
            playbackId,
            streamStart: first,
            streamEnd: isFinal,
          };
          first = false;
          log("writeAudio stream bytes:", chunk.data.byteLength);
          await this.audioOutput!.writeAudio(chunk);
        }, synthesis.signal);
        if (!item.interim) pipelineTelemetry.endTtsSuccess();
      } else {
        const audioChunk = await this.provider.synthesize(text, synthesis.signal);
        const chunk = { ...audioChunk, playbackId, streamStart: true, streamEnd: true };
        if (!item.interim) pipelineTelemetry.endTtsSuccess();
        log("writeAudio bytes:", chunk.data.byteLength);
        await this.audioOutput.writeAudio(chunk);
      }
      if (item.interim) this.playingInterimAt = Date.now();
      if (this.emit) {
        this.emit({ type: "tts:spoken", text });
      }
    } catch (err) {
      if (synthesis.signal.aborted) {
        // Interruption is intentional — not a user-facing error. The
        // trace was already finalized by markTtsInterrupted().
        log("synthesize aborted:", errMessage(err));
      } else {
        if (!item.interim) pipelineTelemetry.endTtsError();
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
      this.speakingInterim = false;
      this.processQueue();
    }
  }
}
