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

import { test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";

process.env.PIPELINE_DEBUG = "1";

import {
  TranslationManager,
  normalizeForDedupe,
} from "../src/main/services/translation/manager";
import type { TranslationEvent } from "../packages/shared/index";
import type { TranslationProvider } from "../src/main/services/translation/provider";
import {
  TtsManager,
} from "../src/main/services/tts/manager";
import type { TtsEvent } from "../packages/shared/index";
import type { TtsProvider } from "../src/main/services/tts/provider";
import type { AudioChunk } from "../packages/shared/index";
import {
  resolveSegmentationSilenceMs,
} from "../src/main/services/stt/providers/azure";

/* ------------------------------------------------------------------ */
/* Azure segmentation config                                           */
/* ------------------------------------------------------------------ */

test("segmentation silence: unset env → undefined (service default)", () => {
  assert.equal(resolveSegmentationSilenceMs(undefined), undefined);
  assert.equal(resolveSegmentationSilenceMs(""), undefined);
  assert.equal(resolveSegmentationSilenceMs("   "), undefined);
});

test("segmentation silence: valid values pass through", () => {
  assert.equal(resolveSegmentationSilenceMs("300"), 300);
  assert.equal(resolveSegmentationSilenceMs("100"), 100);
  assert.equal(resolveSegmentationSilenceMs("5000"), 5000);
});

test("segmentation silence: out-of-range clamped into 100–5000", () => {
  assert.equal(resolveSegmentationSilenceMs("50"), 100);
  assert.equal(resolveSegmentationSilenceMs("9999"), 5000);
});

test("segmentation silence: non-numeric ignored with fallback", () => {
  assert.equal(resolveSegmentationSilenceMs("abc"), undefined);
  assert.equal(resolveSegmentationSilenceMs("-300"), undefined);
});

/* ------------------------------------------------------------------ */
/* Incremental translation                                             */
/* ------------------------------------------------------------------ */

interface TranslationRecorder {
  provider: TranslationProvider;
  calls: () => string[];
  settleAll: () => void;
}

function makeCountingTranslationProvider(delayMs = 5): TranslationRecorder {
  const received: string[] = [];
  const resolvers: Array<() => void> = [];
  return {
    provider: {
      name: "mock",
      async translate(text: string): Promise<string> {
        received.push(text);
        await new Promise<void>((resolve) => resolvers.push(resolve));
        if (delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
        return `EN:${text}`;
      },
    },
    calls: () => received,
    settleAll: () => {
      while (resolvers.length > 0) resolvers.shift()!();
    },
  };
}

async function startTranslation(
  manager: TranslationManager,
  provider: TranslationProvider
): Promise<TranslationEvent[]> {
  const events: TranslationEvent[] = [];
  await manager.start((event) => events.push(event));
  // Inject the test provider (bypasses env-based factory).
  (
    manager as unknown as { provider: TranslationProvider }
  ).provider = provider;
  return events;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makePartialConfigEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PARTIAL_TRANSLATION_ENABLED: "true",
    PARTIAL_TRANSLATION_MIN_WORDS: "4",
    PARTIAL_TRANSLATION_STABLE_MS: "20",
  };
}

test("interim fires once for a stable long partial and emits interim result", async () => {
  const env = makePartialConfigEnv();
  const saved = process.env;
  process.env = env;
  try {
    const rec = makeCountingTranslationProvider();
    const mgr = new TranslationManager(0);
    const events = await startTranslation(mgr, rec.provider);

    mgr.onSttText("یہ ایک بڑا جملہ ہے", false);
    await sleep(60); // stability window (20ms)

    assert.equal(rec.calls().length, 1, "exactly one interim request");
    rec.settleAll();
    await sleep(10);
    const interimEvents = events.filter(
      (e) => e.type === "translation:text" && e.interim === true
    );
    assert.equal(interimEvents.length, 1);
    mgr.stop();
  } finally {
    process.env = saved;
  }
});

test("short partials below min-words never trigger interim requests", async () => {
  const saved = process.env;
  process.env = makePartialConfigEnv();
  try {
    const rec = makeCountingTranslationProvider();
    const mgr = new TranslationManager(0);
    await startTranslation(mgr, rec.provider);

    mgr.onSttText("سلام", false);
    await sleep(60);

    assert.equal(rec.calls().length, 0);
    mgr.stop();
  } finally {
    process.env = saved;
  }
});

test("unchanged partial text does not retrigger translation", async () => {
  const saved = process.env;
  process.env = makePartialConfigEnv();
  try {
    const rec = makeCountingTranslationProvider();
    const mgr = new TranslationManager(0);
    await startTranslation(mgr, rec.provider);

    mgr.onSttText("یہ ایک بڑا جملہ ہے", false);
    await sleep(60);
    mgr.onSttText("یہ ایک بڑا جملہ ہے", false); // identical repeat
    await sleep(60);
    mgr.onSttText("یہ ایک بڑا  جملہ ہے ", false); // whitespace-only diff
    await sleep(60);

    assert.equal(rec.calls().length, 1);
    mgr.stop();
  } finally {
    process.env = saved;
  }
});

test("final arriving while interim in flight drops the interim result", async () => {
  const saved = process.env;
  process.env = makePartialConfigEnv();
  try {
    const rec = makeCountingTranslationProvider(30);
    const mgr = new TranslationManager(0);
    const events = await startTranslation(mgr, rec.provider);

    mgr.onSttText("یہ ایک بڑا جملہ ہے", false);
    await sleep(40); // interim request now in flight (unresolved)
    assert.equal(rec.calls().length, 1);

    mgr.onSttText("یہ ایک بڑا جملہ ہے۔", true); // final supersedes
    rec.settleAll(); // resolve interim AND final requests
    await sleep(80);

    const interimEvents = events.filter(
      (e) => e.type === "translation:text" && e.interim === true
    );
    assert.equal(interimEvents.length, 0, "superseded interim is dropped");
    const finalEvents = events.filter(
      (e) => e.type === "translation:text" && !e.interim
    );
    assert.equal(finalEvents.length, 1, "final path still delivers");
    mgr.stop();
  } finally {
    process.env = saved;
  }
});

test("PARTIAL_TRANSLATION_ENABLED=false disables interim entirely", async () => {
  const saved = process.env;
  process.env = { ...makePartialConfigEnv(), PARTIAL_TRANSLATION_ENABLED: "false" };
  try {
    const rec = makeCountingTranslationProvider();
    const mgr = new TranslationManager(0);
    await startTranslation(mgr, rec.provider);

    mgr.onSttText("یہ ایک بڑا جملہ ہے", false);
    await sleep(60);

    assert.equal(rec.calls().length, 0);
    mgr.stop();
  } finally {
    process.env = saved;
  }
});

test("silence/empty partials are never sent", async () => {
  const saved = process.env;
  process.env = makePartialConfigEnv();
  try {
    const rec = makeCountingTranslationProvider();
    const mgr = new TranslationManager(0);
    await startTranslation(mgr, rec.provider);

    mgr.onSttText("", false);
    mgr.onSttText("   ", false);
    await sleep(60);

    assert.equal(rec.calls().length, 0);
    mgr.stop();
  } finally {
    process.env = saved;
  }
});

/* ------------------------------------------------------------------ */
/* TTS preemption                                                      */
/* ------------------------------------------------------------------ */

interface TtsRecorder {
  provider: TtsProvider;
  started: () => string[];
  releaseFirst: () => void;
}

function makeSlowTtsProvider(): TtsRecorder {
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

function attachFakeAudioOutput(tts: TtsManager): { cancelled: () => number } {
  let cancelCount = 0;
  (
    tts as unknown as { audioOutput: unknown }
  ).audioOutput = {
    writeAudio: async () => {},
    cancelPlayback: () => {
      cancelCount++;
    },
  };
  return { cancelled: () => cancelCount };
}

test("new utterance preempts busy TTS: abort + clear queue + cancel playback", async () => {
  const saved = process.env;
  process.env.TTS_DEDUPE_WINDOW_MS = "0";
  try {
    const rec = makeSlowTtsProvider();
    const tts = new TtsManager(0);
    const events: TtsEvent[] = [];
    await tts.start((e) => events.push(e), null as never, rec.provider);
    const audio = attachFakeAudioOutput(tts);

    tts.onTranslationText("first sentence");
    await sleep(20);
    assert.ok(rec.started().includes("first sentence"));
    assert.equal(audio.cancelled(), 0, "no cancellation before preemption");

    tts.onTranslationText("second sentence");
    await sleep(30);

    assert.equal(audio.cancelled(), 1, "playback cancelled exactly once");
    const interrupted = events.find((e) => e.type === "tts:interrupted");
    assert.ok(interrupted, "tts:interrupted emitted");

    rec.releaseFirst();
    await sleep(320); // let second synthesis complete (250ms)
    assert.ok(rec.started().includes("second sentence"));
    assert.deepEqual(
      events.filter((e) => e.type === "tts:spoken").map((e) =>
        e.type === "tts:spoken" ? e.text : ""
      ),
      ["second sentence"]
    );
    tts.stop();
  } finally {
    process.env = saved;
  }
});

test("idle TTS accepts new text without emitting interruption", async () => {
  const saved = process.env;
  process.env.TTS_DEDUPE_WINDOW_MS = "0";
  try {
    const rec = makeSlowTtsProvider();
    const tts = new TtsManager(0);
    const events: TtsEvent[] = [];
    await tts.start((e) => events.push(e), null as never, rec.provider);
    const audio = attachFakeAudioOutput(tts);

    tts.onTranslationText("only sentence");
    await sleep(20);

    assert.equal(audio.cancelled(), 0);
    assert.ok(!events.some((e) => e.type === "tts:interrupted"));
    rec.releaseFirst();
    await sleep(320);
    tts.stop();
  } finally {
    process.env = saved;
  }
});

/* ------------------------------------------------------------------ */
/* say provider abort semantics                                        */
/* ------------------------------------------------------------------ */

test("say synthesize rejects immediately when signal already aborted", async () => {
  const { createSayTtsProvider } = await import(
    "../src/main/services/tts/providers/say"
  );
  const provider = createSayTtsProvider();
  const controller = new AbortController();
  controller.abort(new Error("pre-aborted"));
  await assert.rejects(
    () => provider.synthesize("hello", controller.signal),
    /pre-aborted/
  );
});

test("TTS assigns playbackId 0 to interim chunks and sequence ids to finals", async () => {
  const saved = process.env;
  process.env.TTS_DEDUPE_WINDOW_MS = "0";
  try {
    const rec = makeSlowTtsProvider();
    const tts = new TtsManager(0);
    const events: TtsEvent[] = [];
    const written: Array<number | null | undefined> = [];
    await tts.start((e) => events.push(e), null as never, rec.provider);
    (
      tts as unknown as { audioOutput: unknown }
    ).audioOutput = {
      writeAudio: async (chunk: AudioChunk) => {
        written.push(chunk.playbackId);
      },
      cancelPlayback: () => {},
    };

    tts.onTranslationText("interim draft", true);
    await sleep(320); // interim completes
    tts.onTranslationText("final text");
    await sleep(320); // final completes

    assert.deepEqual(written, [0, 1]);
    tts.stop();
  } finally {
    process.env = saved;
  }
});
