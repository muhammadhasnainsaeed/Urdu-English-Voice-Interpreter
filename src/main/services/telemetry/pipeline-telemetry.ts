import type {
  PipelineEvent,
  PipelinePhaseAverages,
  PipelineSummary,
  PlaybackTelemetryEvent,
  UtteranceOutcome,
  UtteranceLatencyBreakdown,
  UtteranceTraceReport,
} from "@shared/index";

/**
 * Development-only pipeline latency instrumentation.
 *
 * Observes the EXISTING pipeline flow without changing its behavior:
 *
 *   speechStart (service-detected voice onset)
 *     → first STT partial → STT final
 *     → translation start → translation complete
 *     → TTS start → TTS audio ready
 *     → playback start (renderer) → playback complete (renderer)
 *
 * Attribution model: each downstream stage (translation, TTS, audio output)
 * processes items strictly sequentially, so FIFO queues per stage attribute
 * marks to the correct utterance even when consecutive utterances overlap.
 * Traces that leave the pipeline early (dedupe, backpressure drop,
 * rate-limit, errors) are recorded with an outcome but excluded from the
 * end-to-end rolling window, which only holds fully completed utterances.
 *
 * Privacy: traces carry transcript text and timings only. No credentials,
 * no API keys, no raw audio ever pass through this module.
 */

const WINDOW_CAP = 20;

interface Trace {
  id: number;
  outcome: UtteranceOutcome;
  speechStartApprox: boolean;
  urdu?: string;
  english?: string;
  /** STT partial (recognizing) events observed for this utterance. */
  sttPartialCount?: number;
  t: UtteranceTraceReport["t"];
  /** Earliest interim (partial-based) playback start, when one occurred. */
  interimFirstAudioAt?: number | null;
}

function emptyBreakdown(): UtteranceLatencyBreakdown {
  return {
    sttFirstPartialMs: null,
    sttFinalMs: null,
    translationMs: null,
    ttsMs: null,
    audioOutputMs: null,
    endToEndMs: null,
    sttFinalToTranslationMs: null,
    translationToTtsReadyMs: null,
    ttsReadyToAudioOutMs: null,
    firstAudioMs: null,
    interimFirstAudioMs: null,
  };
}

export class PipelineTelemetry {
  private nowFn: () => number;
  private nextId = 1;
  private enabled = process.env.PIPELINE_DEBUG === "1";

  /** Rolling window of completed end-to-end latencies. */
  private e2eWindow: number[] = [];
  private phaseSums = {
    sttFirstPartialMs: 0,
    sttFinalMs: 0,
    translationMs: 0,
    ttsMs: 0,
    audioOutputMs: null as number | null,
    sttFinalToTranslationMs: 0,
    translationToTtsReadyMs: 0,
    ttsReadyToAudioOutMs: 0,
    firstAudioMs: 0,
    interimFirstAudioMs: 0,
  };
  private phaseCounts = {
    sttFirstPartialMs: 0,
    sttFinalMs: 0,
    translationMs: 0,
    ttsMs: 0,
    audioOutputMs: 0,
    sttFinalToTranslationMs: 0,
    translationToTtsReadyMs: 0,
    ttsReadyToAudioOutMs: 0,
    firstAudioMs: 0,
    interimFirstAudioMs: 0,
  };
  private totalCompleted = 0;
  private lastE2E: number | null = null;

  /** Intake trace being built while speech is ongoing (pre-final). */
  private intake: {
    speechStartAt: number;
    speechStartApprox: boolean;
    firstPartialAt: number | null;
    interimFirstAudioAt: number | null;
    partialCount: number;
  } | null = null;
  /**
   * Interim playback observed after the intake was already closed by a final
   * but before that final's own trace could adopt it (race window).
   */
  private pendingInterimFirstAudioAt: number | null = null;

  /** Traces accepted for downstream processing, per stage. */
  private awaitingTranslation: Trace[] = [];
  private awaitingTts: Trace[] = [];
  private awaitingAudioOut: Trace[] = [];
  private inFlightTranslation: Trace | null = null;
  private inFlightTts: Trace | null = null;
  private inFlightAudioOut: Trace | null = null;

  private listener: ((event: PipelineEvent) => void) | null = null;

  constructor(now: () => number = Date.now) {
    this.nowFn = now;
  }

  setListener(listener: ((event: PipelineEvent) => void) | null): void {
    this.listener = listener;
  }

  private now(): number {
    return this.nowFn();
  }

  private emit(event: PipelineEvent): void {
    if (!this.enabled) return;
    try {
      this.listener?.(event);
    } catch {
      // Telemetry must never break the pipeline.
    }
  }

  private debug(...args: unknown[]): void {
    if (this.enabled) console.log("[TELEMETRY]", ...args);
  }

  /* ------------------------- STT intake ------------------------- */

  /** Service detected voice onset (Azure speechStartDetected). */
  onSpeechStart(): void {
    // Keep an existing onset until a partial proves this intake is real;
    // repeated speechStart events before any partial do not move the start.
    if (!this.intake || this.intake.firstPartialAt !== null) {
      this.intake = {
        speechStartAt: this.now(),
        speechStartApprox: false,
        firstPartialAt: null,
        interimFirstAudioAt: null,
        partialCount: 0,
      };
      this.debug("speechStart");
    }
  }

  /** First partial transcript of an utterance. */
  onFirstPartial(): void {
    const ts = this.now();
    if (!this.intake) {
      // Provider without a speech-start signal — approximate onset.
      this.intake = {
        speechStartAt: ts,
        speechStartApprox: true,
        firstPartialAt: ts,
        interimFirstAudioAt: null,
        partialCount: 1,
      };
      return;
    }
    this.intake.partialCount++;
    if (this.intake.firstPartialAt === null) {
      this.intake.firstPartialAt = ts;
      this.debug("firstPartial");
    }
  }

  /** A final transcript was produced; open a downstream trace. */
  onSttFinal(urdu: string): void {
    const ts = this.now();
    const intake = this.intake ?? {
      speechStartAt: ts,
      speechStartApprox: true,
      firstPartialAt: null,
      interimFirstAudioAt: null,
      partialCount: 0,
    };
    this.intake = null;

    // Adopt any interim playback observed in the race window between the
    // final closing the intake and this trace being created.
    const interimFirstAudioAt =
      intake.interimFirstAudioAt ?? this.pendingInterimFirstAudioAt;
    this.pendingInterimFirstAudioAt = null;

    const trace: Trace = {
      id: this.nextId++,
      outcome: "incomplete",
      speechStartApprox: intake.speechStartApprox,
      urdu,
      sttPartialCount: intake.partialCount,
      interimFirstAudioAt,
      t: {
        speechStart: intake.speechStartAt,
        firstPartial: intake.firstPartialAt,
        sttFinal: ts,
        translationStart: null,
        translationComplete: null,
        ttsStart: null,
        ttsReady: null,
        audioOutputStart: null,
        audioOutputComplete: null,
      },
    };
    this.awaitingTranslation.push(trace);
    this.debug(`final #${trace.id}`);
  }

  /**
   * The just-produced final was suppressed by upstream STT-final dedupe.
   * Finalizes the newest awaiting trace (dedupe applies to the final that
   * was just received — i.e. the last one pushed).
   */
  markSttDeduped(): void {
    const trace = this.awaitingTranslation.pop();
    if (trace) this.finalize(trace, "stt-deduped");
  }

  /** A queued final was dropped by translation backpressure (oldest first). */
  markBackpressureDropped(): void {
    const trace = this.awaitingTranslation.shift();
    if (trace) this.finalize(trace, "backpressure-dropped");
  }

  /* ----------------------- Translation ----------------------- */

  beginTranslation(): void {
    const trace = this.awaitingTranslation.shift();
    if (!trace) return;
    this.inFlightTranslation = trace;
    trace.t.translationStart = this.now();
  }

  endTranslationSuccess(english: string): void {
    const trace = this.inFlightTranslation;
    if (!trace) return;
    trace.t.translationComplete = this.now();
    trace.english = english;
    this.inFlightTranslation = null;
    this.awaitingTts.push(trace);
  }

  endTranslationRateLimited(): void {
    const trace = this.inFlightTranslation;
    this.inFlightTranslation = null;
    if (trace) this.finalize(trace, "rate-limited");
  }

  endTranslationError(): void {
    const trace = this.inFlightTranslation;
    this.inFlightTranslation = null;
    if (trace) this.finalize(trace, "translation-failed");
  }

  /* --------------------------- TTS --------------------------- */

  /** TTS dedupe suppressed this text before synthesis. */
  markTtsSuppressed(): void {
    const trace = this.awaitingTts.shift();
    if (trace) this.finalize(trace, "tts-suppressed");
  }

  /**
   * TTS work was discarded by an interruption (in-flight synthesis aborted
   * or a queued item dropped). Finalizes ONE trace per call so the caller
   * can drain exactly as many traces as were dropped.
   */
  markTtsInterrupted(): void {
    const trace = this.inFlightTts ?? this.awaitingTts.shift();
    this.inFlightTts = null;
    if (trace) this.finalize(trace, "tts-interrupted");
  }

  beginTts(): void {
    const trace = this.awaitingTts.shift();
    if (!trace) return;
    this.inFlightTts = trace;
    trace.t.ttsStart = this.now();
  }

  endTtsSuccess(): void {
    const trace = this.inFlightTts;
    if (!trace) return;
    trace.t.ttsReady = this.now();
    this.inFlightTts = null;
    this.awaitingAudioOut.push(trace);
  }

  endTtsError(): void {
    const trace = this.inFlightTts;
    this.inFlightTts = null;
    if (trace) this.finalize(trace, "tts-failed");
  }

  /* ---------------------- Audio output ---------------------- */

  /**
   * An INTERIM (partial-based) chunk started playing. Recorded against the
   * current intake without consuming FIFO attribution; if the intake was
   * already closed, held pending for the next final's trace.
   */
  markInterimAudioReady(): void {
    const ts = this.now();
    if (this.intake) {
      if (this.intake.interimFirstAudioAt === null) {
        this.intake.interimFirstAudioAt = ts;
        this.debug("interimFirstAudio");
      }
    } else if (this.pendingInterimFirstAudioAt === null) {
      this.pendingInterimFirstAudioAt = ts;
      this.debug("interimFirstAudio (pending)");
    }
  }

  reportPlayback(event: PlaybackTelemetryEvent): void {
    // Interim chunks carry playbackId 0 — they must never consume a FIFO
    // trace slot; their start timestamp feeds the true First-Audio metric.
    if (event.playbackId === 0) {
      if (event.event === "start") {
        this.markInterimAudioReady();
      }
      return;
    }
    if (event.event === "start") {
      const trace = this.awaitingAudioOut.shift() ?? this.inFlightAudioOut;
      if (!trace) return;
      this.inFlightAudioOut = trace;
      trace.t.audioOutputStart = this.now();
    } else {
      const trace = this.inFlightAudioOut ?? this.awaitingAudioOut.shift();
      if (!trace) return;
      this.inFlightAudioOut = null;
      trace.t.audioOutputComplete = this.now();
      this.finalize(trace, "completed");
    }
  }

  /* ------------------------ Lifecycle ------------------------ */

  /**
   * Drop all in-flight/awaiting state (session stop). The rolling window of
   * completed utterances survives so benchmarks persist across sessions.
   */
  resetPipeline(): void {
    const dangling = [
      ...this.awaitingTranslation,
      ...this.awaitingTts,
      ...this.awaitingAudioOut,
      this.inFlightTranslation,
      this.inFlightTts,
      this.inFlightAudioOut,
    ].filter((trace): trace is Trace => trace !== null);
    if (dangling.length > 0) {
      this.debug(`reset — discarding ${dangling.length} dangling trace(s)`);
    }
    this.awaitingTranslation = [];
    this.awaitingTts = [];
    this.awaitingAudioOut = [];
    this.inFlightTranslation = null;
    this.inFlightTts = null;
    this.inFlightAudioOut = null;
    this.intake = null;
    this.pendingInterimFirstAudioAt = null;
  }

  getSummary(): PipelineSummary {
    const avg = (sum: number, count: number): number | null =>
      count > 0 ? Math.round(sum / count) : null;
    return {
      windowSize: this.e2eWindow.length,
      windowCap: WINDOW_CAP,
      completedCount: this.totalCompleted,
      e2e: {
        lastMs: this.lastE2E,
        avgMs:
          this.e2eWindow.length > 0
            ? Math.round(
                this.e2eWindow.reduce((a, b) => a + b, 0) /
                  this.e2eWindow.length
              )
            : null,
        minMs: this.e2eWindow.length > 0 ? Math.min(...this.e2eWindow) : null,
        maxMs: this.e2eWindow.length > 0 ? Math.max(...this.e2eWindow) : null,
      },
      phaseAvg: {
        sttFirstPartialMs: avg(
          this.phaseSums.sttFirstPartialMs,
          this.phaseCounts.sttFirstPartialMs
        ),
        sttFinalMs: avg(this.phaseSums.sttFinalMs, this.phaseCounts.sttFinalMs),
        translationMs: avg(
          this.phaseSums.translationMs,
          this.phaseCounts.translationMs
        ),
        ttsMs: avg(this.phaseSums.ttsMs, this.phaseCounts.ttsMs),
        audioOutputMs:
          this.phaseCounts.audioOutputMs > 0
            ? Math.round(
                (this.phaseSums.audioOutputMs ?? 0) /
                  this.phaseCounts.audioOutputMs
              )
            : null,
        sttFinalToTranslationMs: avg(
          this.phaseSums.sttFinalToTranslationMs,
          this.phaseCounts.sttFinalToTranslationMs
        ),
        translationToTtsReadyMs: avg(
          this.phaseSums.translationToTtsReadyMs,
          this.phaseCounts.translationToTtsReadyMs
        ),
        ttsReadyToAudioOutMs: avg(
          this.phaseSums.ttsReadyToAudioOutMs,
          this.phaseCounts.ttsReadyToAudioOutMs
        ),
        firstAudioMs: avg(
          this.phaseSums.firstAudioMs,
          this.phaseCounts.firstAudioMs
        ),
        interimFirstAudioMs: avg(
          this.phaseSums.interimFirstAudioMs,
          this.phaseCounts.interimFirstAudioMs
        ),
      },
    };
  }

  /* ------------------------ Internal ------------------------ */

  private computeBreakdown(trace: Trace): UtteranceLatencyBreakdown {
    const ms = emptyBreakdown();
    const { t } = trace;
    if (t.firstPartial !== null) {
      ms.sttFirstPartialMs = t.firstPartial - t.speechStart;
    }
    ms.sttFinalMs = t.sttFinal - t.speechStart;
    if (t.translationStart !== null && t.translationComplete !== null) {
      ms.translationMs = t.translationComplete - t.translationStart;
    }
    if (t.ttsStart !== null && t.ttsReady !== null) {
      ms.ttsMs = t.ttsReady - t.ttsStart;
    }
    if (t.audioOutputStart !== null && t.audioOutputComplete !== null) {
      ms.audioOutputMs = t.audioOutputComplete - t.audioOutputStart;
    }
    if (t.audioOutputComplete !== null) {
      ms.endToEndMs = t.audioOutputComplete - t.speechStart;
    }
    if (t.translationComplete !== null) {
      ms.sttFinalToTranslationMs = t.translationComplete - t.sttFinal;
    }
    if (t.translationComplete !== null && t.ttsReady !== null) {
      ms.translationToTtsReadyMs = t.ttsReady - t.translationComplete;
    }
    if (t.ttsReady !== null && t.audioOutputStart !== null) {
      ms.ttsReadyToAudioOutMs = t.audioOutputStart - t.ttsReady;
    }
    // True First Audio: earliest audible playback from either path. A
    // pending interim timestamp (race: interim playback reported after the
    // final closed the intake) is adopted lazily here, exactly once.
    const interimAt = trace.interimFirstAudioAt ?? this.pendingInterimFirstAudioAt;
    if (trace.interimFirstAudioAt === null && this.pendingInterimFirstAudioAt !== null) {
      this.pendingInterimFirstAudioAt = null;
    }
    const firstAudioCandidates: number[] = [];
    if (t.audioOutputStart !== null) {
      firstAudioCandidates.push(t.audioOutputStart);
    }
    if (interimAt) {
      firstAudioCandidates.push(interimAt);
      ms.interimFirstAudioMs = interimAt - t.speechStart;
    }
    if (firstAudioCandidates.length > 0) {
      const earliest = Math.min(...firstAudioCandidates);
      ms.firstAudioMs = earliest - t.speechStart;
    }
    return ms;
  }

  private accumulate(trace: Trace, ms: UtteranceLatencyBreakdown): void {
    if (ms.endToEndMs === null) return;
    this.e2eWindow.push(ms.endToEndMs);
    if (this.e2eWindow.length > WINDOW_CAP) this.e2eWindow.shift();
    this.totalCompleted++;
    this.lastE2E = ms.endToEndMs;
    const add = (
      key: keyof Omit<typeof this.phaseSums, "audioOutputMs">,
      value: number | null
    ) => {
      if (value === null) return;
      this.phaseSums[key] += value;
      this.phaseCounts[key]++;
    };
    add("sttFirstPartialMs", ms.sttFirstPartialMs);
    add("sttFinalMs", ms.sttFinalMs);
    add("translationMs", ms.translationMs);
    add("ttsMs", ms.ttsMs);
    add("sttFinalToTranslationMs", ms.sttFinalToTranslationMs);
    add("translationToTtsReadyMs", ms.translationToTtsReadyMs);
    add("ttsReadyToAudioOutMs", ms.ttsReadyToAudioOutMs);
    add("firstAudioMs", ms.firstAudioMs);
    add("interimFirstAudioMs", ms.interimFirstAudioMs);
    if (ms.audioOutputMs !== null) {
      this.phaseSums.audioOutputMs =
        (this.phaseSums.audioOutputMs ?? 0) + ms.audioOutputMs;
      this.phaseCounts.audioOutputMs++;
    }
  }

  private toReport(
    trace: Trace,
    outcome: UtteranceOutcome,
    ms: UtteranceLatencyBreakdown
  ): UtteranceTraceReport {
    return {
      id: trace.id,
      outcome,
      speechStartApprox: trace.speechStartApprox,
      urdu: trace.urdu,
      english: trace.english,
      sttPartialCount: trace.sttPartialCount,
      t: { ...trace.t },
      ms,
    };
  }

  private finalize(trace: Trace, outcome: UtteranceOutcome): void {
    trace.outcome = outcome;
    const ms = this.computeBreakdown(trace);
    if (outcome === "completed") {
      this.accumulate(trace, ms);
    }
    this.debug(
      `#${trace.id} ${outcome}` +
        ` e2e=${ms.endToEndMs ?? "-"}ms` +
        ` firstAudio=${ms.firstAudioMs ?? "-"}ms` +
        (ms.interimFirstAudioMs !== null
          ? ` (interim@${ms.interimFirstAudioMs}ms)`
          : "") +
        ` firstPartial=${ms.sttFirstPartialMs ?? "-"}ms` +
        ` sttFinal=${ms.sttFinalMs ?? "-"}ms` +
        ` partials=${trace.sttPartialCount ?? "-"}` +
        ` translation=${ms.translationMs ?? "-"}ms` +
        ` tts=${ms.ttsMs ?? "-"}ms` +
        ` audioOut=${ms.audioOutputMs ?? "-"}ms`
    );
    this.emit({ type: "pipeline:utterance", utterance: this.toReport(trace, outcome, ms) });
    this.emit({ type: "pipeline:summary", summary: this.getSummary() });
  }
}

export const pipelineTelemetry = new PipelineTelemetry();
