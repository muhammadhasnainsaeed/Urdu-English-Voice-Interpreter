/**
 * M9 tests: STT partial telemetry, interim-replacement preemption,
 * playback lifecycle tracking.
 *
 * Run:  npx tsx --test tests/m9-streaming.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import process from "node:process";

process.env.PIPELINE_DEBUG = "1";

import { TtsManager } from "../src/main/services/tts/manager";
import type { TtsEvent } from "../packages/shared/index";
import type { TtsProvider } from "../src/main/services/tts/provider";
import type { AudioChunk } from "../packages/shared/index";
import { PipelineTelemetry } from "../src/main/services/telemetry/pipeline-telemetry";
import type { PlaybackTelemetryEvent } from "../packages/shared/index";

/* ------------------------------------------------------------------ */
/* Shared helpers (duplicated from m8 for independent test file)       */
/* ------------------------------------------------------------------ */

function makeSlowTtsProvider(): {
  provider: TtsProvider;
  started: () => string[];
  releaseFirst: () => void;
} {
  const startedTexts: string[] = [];
  let release: (() => void) | null = null;
  const chunk: AudioChunk = {
    data: new ArrayBuffer(4),
    format: { sampleRate: 24000, bitsPerSample: 16, channels: 1 },
  };
  return {
    provider: {
      name: "mock",
      synthesize(text: string, signal?: AbortSignal): Promise<AudioChunk> {
        startedTexts.push(text);
        return new Promise<AudioChunk>((resolve, reject) => {
          const timer = setTimeout(() => resolve(chunk), 250);
          signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(signal.reason);
            },
            { once: true }
          );
          release = () => resolve(chunk);
        });
      },
      stop: async () => {},
    },
    started: () => startedTexts,
    releaseFirst: () => release?.(),
  };
}

function makeFastTtsProvider(): { provider: TtsProvider } {
  const chunk: AudioChunk = {
    data: new ArrayBuffer(4),
    format: { sampleRate: 24000, bitsPerSample: 16, channels: 1 },
  };
  return {
    provider: {
      name: "mock",
      synthesize: async () => chunk,
      stop: async () => {},
    },
  };
}

function attachFakeAudioOutput(tts: TtsManager): {
  cancelled: () => number;
} {
  let cancelCount = 0;
  (tts as unknown as { audioOutput: unknown }).audioOutput = {
    writeAudio: async () => {},
    cancelPlayback: () => {
      cancelCount++;
    },
  };
  return { cancelled: () => cancelCount };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Playback lifecycle tracking                                         */
/* ------------------------------------------------------------------ */

test("handlePlaybackLifecycle sets playingInterimAt on start id=0", async () => {
  const saved = process.env;
  process.env.TTS_DEDUPE_WINDOW_MS = "0";
  try {
    const rec = makeSlowTtsProvider();
    const tts = new TtsManager(0);
    const events: TtsEvent[] = [];
    await tts.start((e) => events.push(e), null as never, rec.provider);
    attachFakeAudioOutput(tts);

    // Idle — no audio playing
    const noWork = (tts as unknown as { playingInterimAt: number | null })
      .playingInterimAt;
    assert.equal(noWork, null, "no playingInterimAt before anything plays");

    // Simulate renderer reporting interim playback start
    tts.handlePlaybackLifecycle({
      event: "start",
      bytes: 100,
      playbackId: 0,
    });
    const afterStart = (tts as unknown as { playingInterimAt: number | null })
      .playingInterimAt;
    assert.ok(afterStart !== null, "playingInterimAt set on start");

    // Simulate renderer reporting interim playback complete
    tts.handlePlaybackLifecycle({
      event: "complete",
      bytes: 100,
      playbackId: 0,
    });
    const afterComplete = (
      tts as unknown as { playingInterimAt: number | null }
    ).playingInterimAt;
    assert.equal(afterComplete, null, "playingInterimAt cleared on complete");

    rec.releaseFirst();
    await sleep(320);
    tts.stop();
  } finally {
    process.env = saved;
  }
});

test("final path clears playingInterimAt on intercept (stop reset)", async () => {
  const saved = process.env;
  process.env.TTS_DEDUPE_WINDOW_MS = "0";
  try {
    const tts = new TtsManager(0);
    await tts.start(() => {}, null as never, makeFastTtsProvider().provider);
    attachFakeAudioOutput(tts);

    tts.handlePlaybackLifecycle({
      event: "start",
      bytes: 100,
      playbackId: 0,
    });
    assert.ok(
      (tts as unknown as { playingInterimAt: number | null }).playingInterimAt
    );

    tts.stop();
    assert.equal(
      (tts as unknown as { playingInterimAt: number | null }).playingInterimAt,
      null,
      "stop clears playingInterimAt"
    );
  } finally {
    process.env = saved;
  }
});

/* ------------------------------------------------------------------ */
/* Interim-replacement preemption                                      */
/* ------------------------------------------------------------------ */

test("final replaces stale interim: cancelPlayback called", async () => {
  const saved = process.env;
  process.env.TTS_DEDUPE_WINDOW_MS = "0";
  try {
    const rec = makeSlowTtsProvider();
    const tts = new TtsManager(0);
    const events: TtsEvent[] = [];
    await tts.start((e) => events.push(e), null as never, rec.provider);
    const audio = attachFakeAudioOutput(tts);

    // Simulate an interim chunk already being rendered by the renderer
    tts.handlePlaybackLifecycle({
      event: "start",
      bytes: 100,
      playbackId: 0,
    });

    // Final arrives while interim audio still audible
    tts.onTranslationText("final correction");
    await sleep(30);

    assert.equal(audio.cancelled(), 1, "cancelPlayback called for stale interim");
    const interrupted = events.find((e) => e.type === "tts:interrupted");
    assert.ok(interrupted, "tts:interrupted emitted");
    assert.ok(
      rec.started().includes("final correction"),
      "final text synthesised"
    );

    rec.releaseFirst();
    await sleep(320);
    tts.stop();
  } finally {
    process.env = saved;
  }
});

test("completed interim is not reaped: no preempt without work", async () => {
  const saved = process.env;
  process.env.TTS_DEDUPE_WINDOW_MS = "0";
  try {
    const rec = makeSlowTtsProvider();
    const tts = new TtsManager(0);
    const events: TtsEvent[] = [];
    await tts.start((e) => events.push(e), null as never, rec.provider);
    const audio = attachFakeAudioOutput(tts);

    // Interim played and completed in renderer
    tts.handlePlaybackLifecycle({
      event: "start",
      bytes: 100,
      playbackId: 0,
    });
    tts.handlePlaybackLifecycle({
      event: "complete",
      bytes: 100,
      playbackId: 0,
    });

    // Final arrives — nothing is playing/synthesizing/queued
    tts.onTranslationText("final after idle");
    await sleep(30);

    assert.equal(
      audio.cancelled(),
      0,
      "no cancelPlayback when interim already completed"
    );
    assert.ok(
      !events.some((e) => e.type === "tts:interrupted"),
      "no tts:interrupted"
    );
    assert.ok(
      rec.started().includes("final after idle"),
      "final synthesised normally"
    );

    rec.releaseFirst();
    await sleep(320);
    tts.stop();
  } finally {
    process.env = saved;
  }
});

test("interim delivery sets playingInterimAt", async () => {
  const saved = process.env;
  process.env.TTS_DEDUPE_WINDOW_MS = "0";
  try {
    const rec = makeFastTtsProvider();
    const tts = new TtsManager(0);
    await tts.start(() => {}, null as never, rec.provider);
    attachFakeAudioOutput(tts);

    // Queue an interim item — it should set playingInterimAt after writeAudio
    tts.onTranslationText("partial draft", true);
    await sleep(10); // fast provider completes quickly

    const val = (tts as unknown as { playingInterimAt: number | null })
      .playingInterimAt;
    assert.ok(val !== null, "playingInterimAt set after interim writeAudio");
    tts.stop();
  } finally {
    process.env = saved;
  }
});

/* ------------------------------------------------------------------ */
/* Telemetry: sttPartialCount propagates to trace                     */
/* ------------------------------------------------------------------ */

test("telemetry: sttPartialCount appears in trace report", () => {
  const tel = new PipelineTelemetry();
  const reports: Array<{ sttPartialCount?: number }> = [];
  tel.setListener((ev) => {
    if (ev.type === "pipeline:utterance") reports.push(ev.utterance);
  });

  // Simulate speechStart → 3 partials → final → translation → tts → audio
  tel.onSpeechStart();
  tel.onFirstPartial(); // count=1
  tel.onFirstPartial(); // count=2
  tel.onFirstPartial(); // count=3
  tel.onSttFinal("test urdu");
  tel.beginTranslation();
  tel.endTranslationSuccess("english");
  tel.beginTts();
  tel.endTtsSuccess();
  tel.reportPlayback({ event: "start", bytes: 100, playbackId: 1 });
  tel.reportPlayback({ event: "complete", bytes: 100, playbackId: 1 });

  assert.equal(reports.length, 1);
  assert.equal(
    reports[0].sttPartialCount,
    3,
    "trace carries partialCount"
  );
  tel.setListener(null);
});
