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

import type { TranslationEvent, TranslationStartResult } from '@shared/index';
import type { TranslationProvider } from './provider';
import { RateLimitError, createTranslationProvider } from './provider';
import { parseWindowMs } from './config';
import { pipelineTelemetry } from '../telemetry/pipeline-telemetry';

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

const DEBUG = process.env.PIPELINE_DEBUG === '1';
const debugT0 = Date.now();
function log(...args: unknown[]): void {
  if (DEBUG) {
    const t = ((Date.now() - debugT0) / 1000).toFixed(3).padStart(8);
    console.log(`${t}s [TRANSLATION]`, ...args);
  }
}

/** Default STT-final dedupe window when STT_FINAL_DEDUPE_WINDOW_MS is unset. */
const DEFAULT_STT_FINAL_DEDUPE_WINDOW_MS = 2000;

export { parseWindowMs } from './config';

/**
 * Normalize a final transcript for duplicate comparison only.
 * Collapses whitespace runs, trims, and applies Unicode NFC so harmless
 * formatting differences do not produce extra translation requests.
 * The ORIGINAL text is still used for translation when accepted.
 */
export function normalizeForDedupe(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
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
  private lastFinalKey: string = '';
  private lastFinalTime: number = 0;

  /* ---------------- Incremental (partial-based) translation ----------------
   * Controlled interim translation: at most ONE provider request per
   * utterance, fired only when a STT partial has been stable for
   * PARTIAL_TRANSLATION_STABLE_MS and carries at least
   * PARTIAL_TRANSLATION_MIN_WORDS words that were not already translated.
   * The final-based path remains fully authoritative; an interim result is
   * dropped when its final arrives before the request completes. */

  private readonly partialEnabled: boolean;
  private readonly partialMinWords: number;
  private readonly partialStableMs: number;
  private partialText: string = '';
  private partialChangedAt: number = 0;
  private partialTimer: ReturnType<typeof setTimeout> | null = null;
  /** One interim request per utterance (reset on the next utterance's first partial). */
  private interimUsedForUtterance: boolean = false;
  private interimInFlight: boolean = false;
  /** Set when a final arrives while an interim request is in flight. */
  private interimSuperseded: boolean = false;
  private lastInterimKey: string = '';

  constructor(dedupeWindowMs?: number) {
    if (dedupeWindowMs !== undefined) {
      this.dedupeWindowMs = dedupeWindowMs;
    } else {
      this.dedupeWindowMs = parseWindowMs(
        process.env.STT_FINAL_DEDUPE_WINDOW_MS,
        'STT_FINAL_DEDUPE_WINDOW_MS',
        DEFAULT_STT_FINAL_DEDUPE_WINDOW_MS,
      );
    }

    const enabledRaw = (process.env.PARTIAL_TRANSLATION_ENABLED ?? 'true').trim().toLowerCase();
    this.partialEnabled = enabledRaw !== 'false' && enabledRaw !== '0';

    this.partialMinWords = parseWindowMs(
      process.env.PARTIAL_TRANSLATION_MIN_WORDS,
      'PARTIAL_TRANSLATION_MIN_WORDS',
      4,
    );
    this.partialStableMs = parseWindowMs(
      process.env.PARTIAL_TRANSLATION_STABLE_MS,
      'PARTIAL_TRANSLATION_STABLE_MS',
      700,
    );
  }

  get isActive(): boolean {
    return this.active;
  }

  async start(emit: (event: TranslationEvent) => void): Promise<TranslationStartResult> {
    if (this.active) {
      return { ok: false, message: 'Translation is already running.' };
    }

    const provider = await createTranslationProvider();
    if (!provider) {
      return {
        ok: false,
        message:
          'No translation provider configured. Set TRANSLATION_PROVIDER=azure, mymemory, or mock in .env.',
      };
    }

    this.provider = provider;
    this.emit = emit;
    this.active = true;
    this.processing = false;
    this.pendingTexts = [];
    this.pendingCount = 0;
    this.lastFinalKey = '';
    this.lastFinalTime = 0;
    this.clearPartialTimer();
    this.partialText = '';
    this.partialChangedAt = 0;
    this.interimUsedForUtterance = false;
    this.interimInFlight = false;
    this.interimSuperseded = false;
    this.lastInterimKey = '';

    emit({ type: 'translation:started', provider: provider.name });
    return { ok: true, provider: provider.name };
  }

  onSttText(text: string, isFinal: boolean): void {
    if (isFinal) log('onSttText final:', text);
    if (!this.active) {
      log('onSttText IGNORED — not active:', text);
      return;
    }
    if (!isFinal) {
      this.onPartial(text);
      return;
    }

    // A final supersedes any in-flight interim request: its result will be
    // dropped when it lands, and the final path below stays authoritative.
    if (this.interimInFlight) {
      log('final arrived — superseding in-flight interim request');
      this.interimSuperseded = true;
    }
    this.clearPartialTimer();
    this.partialText = '';
    this.partialChangedAt = 0;

    // Upstream dedupe: suppress identical consecutive finals before any
    // provider request. Sliding window — duplicates refresh the timer.
    if (this.dedupeWindowMs > 0) {
      const key = normalizeForDedupe(text);
      const now = Date.now();
      if (key === this.lastFinalKey && now - this.lastFinalTime < this.dedupeWindowMs) {
        log(`DEDUPED final (within ${this.dedupeWindowMs}ms):`, text);
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

  /**
   * Track a growing STT partial. Schedules a single controlled interim
   * translation when the text has been stable for the debounce window.
   */
  private onPartial(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return; // never send silence

    // First partial of a new utterance resets per-utterance limits.
    if (!this.partialText && !this.interimInFlight) {
      this.interimUsedForUtterance = false;
      this.interimSuperseded = false;
    }

    const key = normalizeForDedupe(trimmed);
    if (key === normalizeForDedupe(this.partialText)) return;
    this.partialText = trimmed;
    this.partialChangedAt = Date.now();

    if (!this.partialEnabled || this.partialStableMs <= 0) return;
    this.clearPartialTimer();
    this.partialTimer = setTimeout(() => {
      this.partialTimer = null;
      this.maybeTranslateInterim(this.partialText);
    }, this.partialStableMs);
  }

  private clearPartialTimer(): void {
    if (this.partialTimer !== null) {
      clearTimeout(this.partialTimer);
      this.partialTimer = null;
    }
  }

  private maybeTranslateInterim(text: string): void {
    if (
      !this.active ||
      !this.partialEnabled ||
      this.interimUsedForUtterance ||
      this.interimInFlight ||
      // Pipeline busy with finals — skip to keep ordering and cost bounded.
      this.pendingCount > 0 ||
      this.processing
    ) {
      return;
    }
    const words = text.split(/\s+/).filter(Boolean).length;
    if (words < this.partialMinWords) {
      log(`interim skipped — ${words} < ${this.partialMinWords} words`);
      return;
    }
    const key = normalizeForDedupe(text);
    if (key === '' || key === this.lastInterimKey) {
      return; // unchanged / already translated
    }

    this.interimUsedForUtterance = true;
    this.interimInFlight = true;
    this.lastInterimKey = key;
    void this.translateInterim(text);
  }

  private async translateInterim(text: string): Promise<void> {
    const provider = this.provider;
    const emit = this.emit;
    try {
      log('interim translate:', text);
      const english = await provider!.translate(text);
      log('interim result:', english);
      if (this.active && this.emit === emit && !this.interimSuperseded) {
        emit?.({ type: 'translation:text', urdu: text, english, interim: true });
      } else {
        log('interim result dropped (superseded/inactive)');
      }
    } catch (err) {
      // Interim failures are silent by design: the final path reports errors
      // and retries nothing. Rate-limit cooldowns inside providers still run.
      log('interim translate failed:', errMessage(err));
    } finally {
      this.interimInFlight = false;
      this.interimSuperseded = false;
    }
  }

  stop(): void {
    this.provider = null;
    this.emit = null;
    this.active = false;
    this.processing = false;
    this.pendingTexts = [];
    this.pendingCount = 0;
    this.lastFinalKey = '';
    this.lastFinalTime = 0;
    this.clearPartialTimer();
    this.partialText = '';
    this.partialChangedAt = 0;
    this.interimUsedForUtterance = false;
    this.interimInFlight = false;
    this.interimSuperseded = false;
    this.lastInterimKey = '';
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
        log('translate result:', english);
        pipelineTelemetry.endTranslationSuccess(english);
        if (this.active && this.emit === emit) {
          emit({ type: 'translation:text', urdu: text, english });
        }
      } catch (err) {
        if (err instanceof RateLimitError) {
          // Provider is rate-limited. Surface a concise user-facing state;
          // the failed item is DROPPED (not queued/retried), so cooldown
          // expiry never replays stale transcripts.
          log('rate-limited:', errMessage(err));
          pipelineTelemetry.endTranslationRateLimited();
          if (this.active && this.emit === emit) {
            emit({
              type: 'translation:rate-limited',
              message: 'Translation temporarily rate-limited',
            });
          }
        } else {
          log('translate ERROR:', errMessage(err));
          pipelineTelemetry.endTranslationError();
          if (this.active && this.emit === emit) {
            emit({ type: 'translation:error', message: errMessage(err) });
          }
        }
      }
    }

    this.processing = false;
  }
}
