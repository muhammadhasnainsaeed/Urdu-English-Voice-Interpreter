/**
 * Unit tests for the pipeline telemetry module (deterministic clock).
 *
 * Run:  npx tsx --test tests/telemetry.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { PipelineTelemetry } from "../src/main/services/telemetry/pipeline-telemetry";
import type { PipelineEvent } from "../packages/shared/index";

// Telemetry emits events only when PIPELINE_DEBUG=1.
process.env.PIPELINE_DEBUG = "1";

/** Deterministic clock. */
function makeClock() {
  let t = 1_000_000;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    get value() {
      return t;
    },
  };
}

function collect(tel: PipelineTelemetry) {
  const events: PipelineEvent[] = [];
  tel.setListener((e) => events.push(e));
  return events;
}

test("completed utterance produces full latency breakdown", () => {
  const clock = makeClock();
  const tel = new PipelineTelemetry(clock.now);
  const events = collect(tel);

  tel.onSpeechStart();
  clock.advance(120);
  tel.onFirstPartial();
  clock.advance(600);
  tel.onSttFinal("سلام");
  clock.advance(10);
  tel.beginTranslation();
  clock.advance(180);
  tel.endTranslationSuccess("peace");
  clock.advance(15);
  tel.beginTts();
  clock.advance(310);
  tel.endTtsSuccess();
  clock.advance(20);
  tel.reportPlayback({ event: "start", bytes: 1000 });
  clock.advance(1500);
  tel.reportPlayback({ event: "complete", bytes: 1000 });

  const utteranceEvents = events.filter(
    (e): e is Extract<PipelineEvent, { type: "pipeline:utterance" }> =>
      e.type === "pipeline:utterance"
  );
  assert.equal(utteranceEvents.length, 1);
  const u = utteranceEvents[0].utterance;
  assert.equal(u.outcome, "completed");
  assert.equal(u.speechStartApprox, false);
  assert.equal(u.urdu, "سلام");
  assert.equal(u.english, "peace");

  assert.equal(u.ms.sttFirstPartialMs, 120);
  assert.equal(u.ms.sttFinalMs, 720); // 120 + 600
  assert.equal(u.ms.translationMs, 180);
  assert.equal(u.ms.ttsMs, 310);
  assert.equal(u.ms.audioOutputMs, 1500);
  assert.equal(u.ms.endToEndMs, 720 + 10 + 180 + 15 + 310 + 20 + 1500);
  assert.equal(u.ms.sttFinalToTranslationMs, 190); // 10 + 180
  assert.equal(u.ms.translationToTtsReadyMs, 325); // 15 + 310
  assert.equal(u.ms.ttsReadyToAudioOutMs, 20);

  const summary = tel.getSummary();
  assert.equal(summary.windowSize, 1);
  assert.equal(summary.completedCount, 1);
  assert.equal(summary.e2e.lastMs, u.ms.endToEndMs);
  assert.equal(summary.e2e.minMs, u.ms.endToEndMs);
  assert.equal(summary.phaseAvg.translationMs, 180);
});

test("STT-deduped finals are excluded from the E2E rolling window", () => {
  const clock = makeClock();
  const tel = new PipelineTelemetry(clock.now);
  const events = collect(tel);

  // Utterance 1 completes normally.
  tel.onSpeechStart();
  tel.onFirstPartial();
  tel.onSttFinal("الف");
  tel.beginTranslation();
  tel.endTranslationSuccess("a");
  tel.beginTts();
  tel.endTtsSuccess();
  tel.reportPlayback({ event: "start", bytes: 1 });
  tel.reportPlayback({ event: "complete", bytes: 1 });

  // Utterance 2 is suppressed by upstream dedupe after its final.
  tel.onSpeechStart();
  tel.onFirstPartial();
  tel.onSttFinal("الف");
  tel.markSttDeduped();

  const outcomes = events
    .filter((e): e is Extract<PipelineEvent, { type: "pipeline:utterance" }> => e.type === "pipeline:utterance")
    .map((e) => e.utterance.outcome);
  assert.deepEqual(outcomes, ["completed", "stt-deduped"]);

  const summary = tel.getSummary();
  assert.equal(summary.windowSize, 1);
  assert.equal(summary.completedCount, 1);
});

test("rate-limited translations are recorded but not counted as completed", () => {
  const clock = makeClock();
  const tel = new PipelineTelemetry(clock.now);
  const events = collect(tel);

  tel.onSttFinal("بر");
  tel.beginTranslation();
  tel.endTranslationRateLimited();

  const u = events.find(
    (e): e is Extract<PipelineEvent, { type: "pipeline:utterance" }> => e.type === "pipeline:utterance"
  )!.utterance;
  assert.equal(u.outcome, "rate-limited");
  assert.equal(u.ms.translationMs, null);
  assert.equal(u.ms.endToEndMs, null);
  assert.equal(tel.getSummary().windowSize, 0);
});

test("translation errors are classified separately from rate limits", () => {
  const clock = makeClock();
  const tel = new PipelineTelemetry(clock.now);
  const events = collect(tel);

  tel.onSttFinal("x");
  tel.beginTranslation();
  tel.endTranslationError();

  const u = events.find(
    (e): e is Extract<PipelineEvent, { type: "pipeline:utterance" }> => e.type === "pipeline:utterance"
  )!.utterance;
  assert.equal(u.outcome, "translation-failed");
  assert.equal(tel.getSummary().windowSize, 0);
});

test("TTS-suppressed texts are excluded from the E2E window", () => {
  const clock = makeClock();
  const tel = new PipelineTelemetry(clock.now);
  const events = collect(tel);

  tel.onSttFinal("dup");
  tel.beginTranslation();
  tel.endTranslationSuccess("dup-en");
  tel.markTtsSuppressed(); // TTS dedupe drops before synthesis

  const u = events.find(
    (e): e is Extract<PipelineEvent, { type: "pipeline:utterance" }> => e.type === "pipeline:utterance"
  )!.utterance;
  assert.equal(u.outcome, "tts-suppressed");
  assert.equal(u.ms.ttsMs, null);
  assert.equal(tel.getSummary().windowSize, 0);
});

test("rolling window keeps only the last 20 completed utterances", () => {
  const clock = makeClock();
  const tel = new PipelineTelemetry(clock.now);

  const run = (e2eTail: number) => {
    tel.onSttFinal(`t${clock.value}`);
    tel.beginTranslation();
    tel.endTranslationSuccess("en");
    tel.beginTts();
    tel.endTtsSuccess();
    tel.reportPlayback({ event: "start", bytes: 1 });
    clock.advance(e2eTail - 1);
    tel.reportPlayback({ event: "complete", bytes: 1 });
    clock.advance(1);
  };

  // 25 utterances with distinct tails; effective tails are 0..24ms, so the
  // last 20 kept values span 5..24.
  for (let i = 1; i <= 25; i++) run(i);

  const s = tel.getSummary();
  assert.equal(s.completedCount, 25);
  assert.equal(s.windowSize, 20);
  assert.equal(s.e2e.minMs, 5);
  assert.equal(s.e2e.maxMs, 24);
  assert.equal(s.e2e.lastMs, 24);
});

test("overlapping utterances are attributed FIFO per stage", () => {
  const clock = makeClock();
  const tel = new PipelineTelemetry(clock.now);
  const events = collect(tel);

  // A: final accepted, translation begins.
  tel.onSttFinal("A");
  tel.beginTranslation();
  // B arrives while A is translating.
  tel.onSttFinal("B");
  clock.advance(100);
  tel.endTranslationSuccess("A-en");
  // A goes through TTS while B is translated.
  tel.beginTts();
  tel.beginTranslation();
  clock.advance(50);
  tel.endTranslationSuccess("B-en");
  tel.endTtsSuccess();
  tel.reportPlayback({ event: "start", bytes: 1 });
  tel.reportPlayback({ event: "complete", bytes: 1 }); // A done

  // B still needs TTS + playback.
  tel.beginTts();
  tel.endTtsSuccess();
  tel.reportPlayback({ event: "start", bytes: 1 });
  tel.reportPlayback({ event: "complete", bytes: 1 }); // B done

  const reports = events
    .filter((e): e is Extract<PipelineEvent, { type: "pipeline:utterance" }> => e.type === "pipeline:utterance")
    .map((e) => e.utterance);
  assert.equal(reports.length, 2);
  const [a, b] = reports;
  assert.equal(a.urdu, "A");
  assert.equal(b.urdu, "B");
  assert.equal(a.english, "A-en");
  assert.equal(b.english, "B-en");
  assert.equal(a.outcome, "completed");
  assert.equal(b.outcome, "completed");
  // B waited for A's playback before its own TTS began.
  assert.ok((b.t.ttsStart ?? 0) >= (a.t.audioOutputComplete ?? 0));
  assert.equal(a.ms.translationMs !== null, true);
  assert.equal(b.ms.ttsMs !== null, true);
});

test("approximate speech start when provider has no onset signal", () => {
  const clock = makeClock();
  const tel = new PipelineTelemetry(clock.now);
  const events = collect(tel);

  tel.onFirstPartial(); // no onSpeechStart call
  clock.advance(500);
  tel.onSttFinal("خودکار");
  tel.beginTranslation();
  tel.endTranslationSuccess("auto");
  tel.beginTts();
  tel.endTtsSuccess();
  tel.reportPlayback({ event: "start", bytes: 1 });
  tel.reportPlayback({ event: "complete", bytes: 1 });

  const u = events.find(
    (e): e is Extract<PipelineEvent, { type: "pipeline:utterance" }> => e.type === "pipeline:utterance"
  )!.utterance;
  assert.equal(u.speechStartApprox, true);
  assert.equal(u.ms.sttFirstPartialMs, 0);
});

test("resetPipeline discards dangling traces but keeps the stats window", () => {
  const clock = makeClock();
  const tel = new PipelineTelemetry(clock.now);
  collect(tel);

  tel.onSttFinal("keep-stats");
  tel.beginTranslation();
  tel.endTranslationSuccess("en");
  tel.beginTts();
  tel.endTtsSuccess();
  tel.reportPlayback({ event: "start", bytes: 1 });
  tel.reportPlayback({ event: "complete", bytes: 1 });
  assert.equal(tel.getSummary().windowSize, 1);

  // Dangling trace mid-translation at reset time.
  tel.onSttFinal("dangling");
  tel.beginTranslation();
  tel.resetPipeline();

  assert.equal(tel.getSummary().windowSize, 1);

  // After reset, a fresh utterance flows normally.
  const events2: PipelineEvent[] = [];
  tel.setListener((e) => events2.push(e));
  tel.onSttFinal("fresh");
  tel.beginTranslation();
  tel.endTranslationSuccess("fresh-en");
  tel.beginTts();
  tel.endTtsSuccess();
  tel.reportPlayback({ event: "start", bytes: 1 });
  tel.reportPlayback({ event: "complete", bytes: 1 });

  const u = events2.find(
    (e): e is Extract<PipelineEvent, { type: "pipeline:utterance" }> => e.type === "pipeline:utterance"
  )!.utterance;
  assert.equal(u.urdu, "fresh");
  assert.equal(u.outcome, "completed");
  assert.equal(tel.getSummary().windowSize, 2);
});

test("backpressure-dropped traces bypass downstream stages", () => {
  const clock = makeClock();
  const tel = new PipelineTelemetry(clock.now);
  const events = collect(tel);

  tel.onSttFinal("oldest");
  tel.onSttFinal("newer"); // queue: oldest, newer
  tel.markBackpressureDropped(); // oldest dropped

  // newer still completes end-to-end.
  tel.beginTranslation(); // pops "newer"
  tel.endTranslationSuccess("newer-en");
  tel.beginTts();
  tel.endTtsSuccess();
  tel.reportPlayback({ event: "start", bytes: 1 });
  tel.reportPlayback({ event: "complete", bytes: 1 });

  const reports = events
    .filter((e): e is Extract<PipelineEvent, { type: "pipeline:utterance" }> => e.type === "pipeline:utterance")
    .map((e) => e.utterance);
  assert.deepEqual(
    reports.map((r) => [r.urdu, r.outcome]),
    [
      ["oldest", "backpressure-dropped"],
      ["newer", "completed"],
    ]
  );
});
