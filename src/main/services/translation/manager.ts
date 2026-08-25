import type { TranslationEvent, TranslationStartResult } from "@shared/index";
import type { TranslationProvider } from "./provider";
import { RateLimitError, createTranslationProvider } from "./provider";
import { parseWindowMs } from "./config";
import { pipelineTelemetry } from "../telemetry/pipeline-telemetry";

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

const DEBUG = process.env.PIPELINE_DEBUG === "1";
const debugT0 = Date.now();
function log(...args: unknown[]): void {
  if (DEBUG) {
    const t = ((Date.now() - debugT0) / 1000).toFixed(3).padStart(8);
    console.log(`${t}s [TRANSLATION]`, ...args);
  }
}

/** Default STT-final dedupe window when STT_FINAL_DEDUPE_WINDOW_MS is unset. */
const DEFAULT_STT_FINAL_DEDUPE_WINDOW_MS = 2000;

export { parseWindowMs } from "./config";

/**
 * Normalize a final transcript for duplicate comparison only.
 * Collapses whitespace runs, trims, and applies Unicode NFC so harmless
 * formatting differences do not produce extra translation requests.
 * The ORIGINAL text is still used for translation when accepted.
 */
export function normalizeForDedupe(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

export class TranslationManager {
  private provider: TranslationProvider | null = null;
  private emit: ((event: TranslationEvent) => void) | null = null;
  private active: boolean = false;
  private processing: boolean = false;
  private pendingTexts: string[] = [];
  private pendingCount: number = 0;

  /** Max pending translations before oldest are dropped (backpressure). */
  private static readonly MAX_PENDING = 10;

  /**
   * Identical consecutive STT finals within this window are suppressed
   * BEFORE any provider request. Sliding window: each suppressed duplicate
   * refreshes the timer, so a transcript repeated continuously (e.g. mock
   * STT re-finalizing the same sentence) produces one request until the
   * text changes or stays absent for longer than the window. 0 disables.
   */
  private readonly dedupeWindowMs: number;
  private lastFinalKey: string = "";
  private lastFinalTime: number = 0;

  constructor(dedupeWindowMs?: number) {
    if (dedupeWindowMs !== undefined) {
      this.dedupeWindowMs = dedupeWindowMs;
    } else {
      this.dedupeWindowMs = parseWindowMs(
        process.env.STT_FINAL_DEDUPE_WINDOW_MS,
        "STT_FINAL_DEDUPE_WINDOW_MS",
        DEFAULT_STT_FINAL_DEDUPE_WINDOW_MS
      );
    }
  }

  get isActive(): boolean {
    return this.active;
  }

  async start(
    emit: (event: TranslationEvent) => void
  ): Promise<TranslationStartResult> {
    if (this.active) {
      return { ok: false, message: "Translation is already running." };
    }

    const provider = await createTranslationProvider();
    if (!provider) {
      return {
        ok: false,
        message:
          "No translation provider configured. Set TRANSLATION_PROVIDER=azure, mymemory, or mock in .env.",
      };
    }

    this.provider = provider;
    this.emit = emit;
    this.active = true;
    this.processing = false;
    this.pendingTexts = [];
    this.pendingCount = 0;
    this.lastFinalKey = "";
    this.lastFinalTime = 0;

    emit({ type: "translation:started", provider: provider.name });
    return { ok: true, provider: provider.name };
  }

  onSttText(text: string, isFinal: boolean): void {
    if (isFinal) log("onSttText final:", text);
    if (!this.active) {
      log("onSttText IGNORED — not active:", text);
      return;
    }
    if (!isFinal) return;

    // Upstream dedupe: suppress identical consecutive finals before any
    // provider request. Sliding window — duplicates refresh the timer.
    if (this.dedupeWindowMs > 0) {
      const key = normalizeForDedupe(text);
      const now = Date.now();
      if (
        key === this.lastFinalKey &&
        now - this.lastFinalTime < this.dedupeWindowMs
      ) {
        log(
          `DEDUPED final (within ${this.dedupeWindowMs}ms):`,
          text
        );
        this.lastFinalTime = now;
        pipelineTelemetry.markSttDeduped();
        return;
      }
      this.lastFinalKey = key;
      this.lastFinalTime = now;
    }

    // Backpressure: if too many translations are pending, drop oldest
    if (this.pendingCount >= TranslationManager.MAX_PENDING) {
      this.pendingTexts.shift();
      this.pendingCount--;
      pipelineTelemetry.markBackpressureDropped();
    }

    this.pendingTexts.push(text);
    this.pendingCount++;
    this.processQueue();
  }

  stop(): void {
    this.provider = null;
    this.emit = null;
    this.active = false;
    this.processing = false;
    this.pendingTexts = [];
    this.pendingCount = 0;
    this.lastFinalKey = "";
    this.lastFinalTime = 0;
    pipelineTelemetry.resetPipeline();
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.pendingTexts.length === 0) return;

    this.processing = true;

    while (this.pendingTexts.length > 0 && this.active) {
      const text = this.pendingTexts.shift()!;
      this.pendingCount--;

      // Capture emit and provider references locally to avoid race with stop()
      const emit = this.emit;
      const provider = this.provider;
      if (!emit || !provider) break;

      try {
        pipelineTelemetry.beginTranslation();
        const english = await provider.translate(text);
        log("translate result:", english);
        pipelineTelemetry.endTranslationSuccess(english);
        if (this.active && this.emit === emit) {
          emit({ type: "translation:text", urdu: text, english });
        }
      } catch (err) {
        if (err instanceof RateLimitError) {
          // Provider is rate-limited. Surface a concise user-facing state;
          // the failed item is DROPPED (not queued/retried), so cooldown
          // expiry never replays stale transcripts.
          log("rate-limited:", errMessage(err));
          pipelineTelemetry.endTranslationRateLimited();
          if (this.active && this.emit === emit) {
            emit({
              type: "translation:rate-limited",
              message: "Translation temporarily rate-limited",
            });
          }
        } else {
          log("translate ERROR:", errMessage(err));
          pipelineTelemetry.endTranslationError();
          if (this.active && this.emit === emit) {
            emit({ type: "translation:error", message: errMessage(err) });
          }
        }
      }
    }

    this.processing = false;
  }
}
