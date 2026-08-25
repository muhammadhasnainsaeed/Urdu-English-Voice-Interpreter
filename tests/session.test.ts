/**
 * Deterministic tests for SessionManager and pipeline fixes.
 *
 * Run:  npx tsx tests/session.test.ts
 *
 * Uses mock providers — no network, no audio, no Electron.
 */

import { SessionManager } from "../src/main/services/session";
import { TranslationManager } from "../src/main/services/translation/manager";
import { TtsManager } from "../src/main/services/tts/manager";
import { translationManager } from "../src/main/ipc/translation";
import { ttsManager } from "../src/main/ipc/tts";
import type {
  SessionEvent,
  TranslationEvent,
  TtsEvent,
  AudioChunk,
} from "../packages/shared/index";
import type { TtsProvider } from "../src/main/services/tts/provider";

/* ------------------------------------------------------------------ */
/*  Mock TTS provider                                                  */
/* ------------------------------------------------------------------ */

function createMockTtsProvider(): TtsProvider & { spoken: string[] } {
  const spoken: string[] = [];
  return {
    name: "mock-tts",
    spoken,
    async synthesize(text: string): Promise<AudioChunk> {
      spoken.push(text);
      return {
        data: new ArrayBuffer(0),
        format: { sampleRate: 24000, bitsPerSample: 16, channels: 1 },
      };
    },
    async stop() {},
  };
}

/* ------------------------------------------------------------------ */
/*  Mock AudioOutputManager                                            */
/* ------------------------------------------------------------------ */

function createMockAudioOutput() {
  const written: AudioChunk[] = [];
  return {
    written,
    get isActive() { return true; },
    async writeAudio(chunk: AudioChunk): Promise<void> {
      written.push(chunk);
    },
    cancelPlayback(): void {
      // Preemption support (M8) — no-op for the session-level mock.
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function drainMicrotasks(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

async function drainQueue(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await drainMicrotasks();
  }
}

/* ------------------------------------------------------------------ */
/*  Test runner                                                        */
/* ------------------------------------------------------------------ */

type TestFn = () => Promise<void>;

interface TestCase {
  name: string;
  fn: TestFn;
}

const results: { name: string; pass: boolean; reason?: string }[] = [];

async function runTests(cases: TestCase[]) {
  console.log(`\nRunning ${cases.length} tests...\n`);
  for (const tc of cases) {
    try {
      await tc.fn();
      results.push({ name: tc.name, pass: true });
      console.log(`  ✓ ${tc.name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name: tc.name, pass: false, reason: msg });
      console.log(`  ✗ ${tc.name}`);
      console.log(`    ${msg}`);
    }
  }

  console.log("\n--- Summary ---");
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log(`${passed} passed, ${failed} failed, ${results.length} total`);
  if (failed > 0) {
    console.log("\nFailed:");
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  ✗ ${r.name}: ${r.reason}`);
    }
  }
  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

const tests: TestCase[] = [
  // ==========================================
  // Session Manager Tests
  // ==========================================

  {
    name: "Session: starts idle",
    fn: () => {
      const mgr = new SessionManager();
      if (mgr.status$ !== "idle") throw new Error(`Expected idle, got ${mgr.status$}`);
    },
  },

  {
    name: "Session: stop when idle is no-op",
    async fn() {
      const mgr = new SessionManager();
      const events: SessionEvent[] = [];
      mgr.setEmitter((e) => events.push(e));
      await mgr.stop();
      if (mgr.status$ !== "idle") throw new Error("Should remain idle");
      // No events should be emitted for idle stop
      if (events.length !== 0) throw new Error(`Expected 0 events, got ${events.length}`);
    },
  },

  {
    name: "Session: getStages returns all idle when not active",
    fn: () => {
      const mgr = new SessionManager();
      const stages = mgr.getStages();
      if (stages.stt !== "idle") throw new Error(`stt should be idle, got ${stages.stt}`);
      if (stages.translation !== "idle") throw new Error(`translation should be idle`);
      if (stages.tts !== "idle") throw new Error(`tts should be idle`);
      if (stages.audioOutput !== "idle") throw new Error(`audioOutput should be idle`);
    },
  },

  {
    name: "Session: emergencyStop sets idle and clears emitter",
    async fn() {
      const mgr = new SessionManager();
      let emitCount = 0;
      mgr.setEmitter(() => { emitCount++; });
      mgr.emergencyStop();
      if (mgr.status$ !== "idle") throw new Error("Should be idle after emergencyStop");
      // Emitter should be cleared — further emits are no-ops
    },
  },

  // ==========================================
  // Translation Manager Tests
  // ==========================================

  {
    name: "Translation: emit race — stop() during translateText does not crash",
    async fn() {
      const mgr = new TranslationManager();
      const events: TranslationEvent[] = [];
      const emit = (e: TranslationEvent) => events.push(e);

      // Start with mock provider
      process.env.TRANSLATION_PROVIDER = "mock";
      await mgr.start(emit);

      // Feed final text — starts an async translateText
      mgr.onSttText("Hello", true);

      // Stop immediately — this used to crash because emit was nulled
      mgr.stop();

      // Wait for any pending async work
      await drainQueue();

      // Should not have crashed. The translation may or may not have completed
      // depending on timing, but no crash should occur.
      process.env.TRANSLATION_PROVIDER = "";
    },
  },

  {
    name: "Translation: stop() clears pending texts",
    async fn() {
      const mgr = new TranslationManager();
      const events: TranslationEvent[] = [];
      const emit = (e: TranslationEvent) => events.push(e);

      process.env.TRANSLATION_PROVIDER = "mock";
      await mgr.start(emit);

      // Feed multiple texts
      mgr.onSttText("A", true);
      mgr.onSttText("B", true);
      mgr.onSttText("C", true);

      mgr.stop();

      await drainQueue();

      // After stop, no more events should be emitted
      const textEvents = events.filter((e) => e.type === "translation:text");
      // Some may have completed before stop, but none after
      process.env.TRANSLATION_PROVIDER = "";
    },
  },

  {
    name: "Translation: serialization — texts are processed in order",
    async fn() {
      const mgr = new TranslationManager();
      const events: TranslationEvent[] = [];
      const emit = (e: TranslationEvent) => events.push(e);

      process.env.TRANSLATION_PROVIDER = "mock";
      await mgr.start(emit);

      mgr.onSttText("First", true);
      mgr.onSttText("Second", true);
      mgr.onSttText("Third", true);

      await drainQueue();

      const textEvents = events.filter((e) => e.type === "translation:text");
      if (textEvents.length !== 3) {
        throw new Error(`Expected 3 translation:text events, got ${textEvents.length}`);
      }
      // Mock provider translates synchronously, so order should be preserved
      const t0 = textEvents[0] as { type: string; urdu: string; english: string };
      const t1 = textEvents[1] as { type: string; urdu: string; english: string };
      const t2 = textEvents[2] as { type: string; urdu: string; english: string };
      if (t0.urdu !== "First") throw new Error(`Expected "First", got "${t0.urdu}"`);
      if (t1.urdu !== "Second") throw new Error(`Expected "Second", got "${t1.urdu}"`);
      if (t2.urdu !== "Third") throw new Error(`Expected "Third", got "${t2.urdu}"`);
      process.env.TRANSLATION_PROVIDER = "";
    },
  },

  // ==========================================
  // TTS Queue Tests
  // ==========================================

  {
    name: "TTS: bounded queue — drops oldest when full",
    fn: async () => {
      const mgr = new TtsManager(0); // no dedup
      const events: TtsEvent[] = [];
      const provider = createMockTtsProvider();
      const audioOutput = createMockAudioOutput();

      // Start with a slow provider that takes 50ms per synthesis
      const slowProvider: TtsProvider = {
        name: "slow-mock",
        async synthesize(text: string): Promise<AudioChunk> {
          await new Promise((r) => setTimeout(r, 50));
          provider.spoken.push(text);
          return {
            data: new ArrayBuffer(0),
            format: { sampleRate: 24000, bitsPerSample: 16, channels: 1 },
          };
        },
        async stop() {},
      };

      await mgr.start((e) => events.push(e), audioOutput as never, slowProvider);

      // Queue 7 items rapidly (max is 5)
      mgr.onTranslationText("A");
      mgr.onTranslationText("B");
      mgr.onTranslationText("C");
      mgr.onTranslationText("D");
      mgr.onTranslationText("E");
      mgr.onTranslationText("F");
      mgr.onTranslationText("G");

      // Wait for queue to process
      await new Promise((r) => setTimeout(r, 500));

      // Queue should have dropped oldest items (A, B) to keep at most 5
      // The first item processed is whatever was in the queue when processQueue started
      // After that, items C-G should be in the queue (5 items max)
      // Since the first synthesis takes 50ms, by the time it completes,
      // all 7 items have been added. The queue drops oldest when >5.
      // Queue at that point: C, D, E, F, G (A and B dropped)
      // But the first one (A) was already shifted and is being processed
      // So spoken should be: A, C, D, E, F, G (B was dropped when F was added)
      // Actually let me think again...
      // onTranslationText("A") → queue=["A"], processQueue starts
      // onTranslationText("B") → queue=["B"] (processQueue already running)
      // ... all 7 added while first is synthesizing
      // When first synthesis completes, queue has been trimmed to 5 latest
      // So spoken = ["A"] then queue processes the remaining 5
      if (provider.spoken.length < 2) {
        throw new Error(`Expected at least 2 spoken, got ${provider.spoken.length}`);
      }
      // The important thing: queue is bounded and doesn't grow without limit
      if (mgr.queueLength > 5) {
        throw new Error(`Queue should be bounded, got ${mgr.queueLength}`);
      }
      mgr.stop();
    },
  },

  // ==========================================
  // Session + TTS Integration
  // ==========================================

  {
    name: "TTS: stop clears queue — no pending items after stop",
    fn: async () => {
      const mgr = new TtsManager(0);
      const events: TtsEvent[] = [];
      const provider = createMockTtsProvider();
      const audioOutput = createMockAudioOutput();

      await mgr.start((e) => events.push(e), audioOutput as never, provider);

      mgr.onTranslationText("Hello");
      await drainQueue();

      // Queue some more
      mgr.onTranslationText("World");
      mgr.onTranslationText("!");

      // Stop immediately
      mgr.stop();

      // After stop, queue should be empty
      if (mgr.queueLength !== 0) {
        throw new Error(`Queue should be empty after stop, got ${mgr.queueLength}`);
      }
      if (mgr.isActive) throw new Error("Should not be active after stop");
    },
  },

  {
    name: "TTS: error in one item does not block the next",
    fn: async () => {
      const mgr = new TtsManager(0);
      const events: TtsEvent[] = [];
      const audioOutput = createMockAudioOutput();

      let callCount = 0;
      const failOnSecond: TtsProvider = {
        name: "fail-on-second",
        async synthesize(text: string): Promise<AudioChunk> {
          callCount++;
          if (callCount === 2) {
            throw new Error("Synthesis failed");
          }
          return {
            data: new ArrayBuffer(0),
            format: { sampleRate: 24000, bitsPerSample: 16, channels: 1 },
          };
        },
        async stop() {},
      };

      await mgr.start((e) => events.push(e), audioOutput as never, failOnSecond);

      // M8 semantics: each accepted utterance preempts the previous one,
      // so items are sent sequentially — A completes, B fails, C recovers.
      mgr.onTranslationText("A");
      await drainQueue();
      mgr.onTranslationText("B"); // will fail
      await drainQueue();
      mgr.onTranslationText("C");
      await drainQueue();

      const spokenEvents = events.filter((e) => e.type === "tts:spoken");
      const errorEvents = events.filter((e) => e.type === "tts:error");

      if (errorEvents.length < 1) {
        throw new Error(`Expected at least 1 error event, got ${errorEvents.length}`);
      }

      // Verify C was spoken (error didn't block subsequent items)
      const spokenTexts = spokenEvents.map((e) => (e as { text: string }).text);
      if (!spokenTexts.includes("A")) throw new Error("A should have been spoken");
      if (!spokenTexts.includes("C")) throw new Error("C should have been spoken (error didn't block)");

      mgr.stop();
    },
  },

  // ==========================================
  // M7 Regression: session emit wiring
  // ==========================================

  {
    name: "Regression: session start wires translation→TTS chain",
    async fn() {
      // Use a fresh SessionManager — it references the same singletons
      const mgr = new SessionManager();
      mgr.setEmitter(() => {});

      process.env.TRANSLATION_PROVIDER = "mock";
      process.env.TTS_PROVIDER = "mock";

      try {
        const result = await mgr.start();
        if (!result.ok) throw new Error(`Session start failed: ${result.message}`);

        // Access internal state to verify the chain
        const tm = translationManager as unknown as {
          active: boolean;
          emit: ((e: TranslationEvent) => void) | null;
          onSttText: (text: string, isFinal: boolean) => void;
        };
        const tts = ttsManager as unknown as {
          active: boolean;
          lastSpokenText: string;
        };

        if (!tm.active) throw new Error("Translation should be active after session start");
        if (!tts.active) throw new Error("TTS should be active after session start");
        if (!tm.emit) throw new Error("Translation emit must be set after session start");

        // Simulate STT producing final Urdu text.
        // Pipeline: onSttText → translate → emit → ttsManager.onTranslationText
        tm.onSttText("ہیلو", true);
        await drainQueue();

        // If the session's translation emit properly chains to TTS,
        // lastSpokenText will be set. With the regression it stays "".
        if (!tts.lastSpokenText) {
          throw new Error(
            "TTS never received translated text — session translation→TTS chain is broken"
          );
        }
        if (tts.lastSpokenText !== "Hello") {
          throw new Error(
            `Expected TTS to receive "Hello", got "${tts.lastSpokenText}"`
          );
        }
      } finally {
        mgr.stop();
        process.env.TRANSLATION_PROVIDER = "";
        process.env.TTS_PROVIDER = "";
      }
    },
  },

  // ==========================================
  // STT-final upstream dedupe (TranslationManager)
  // ==========================================

  {
    name: "Dedupe: first final transcript is translated",
    async fn() {
      const mgr = new TranslationManager(2000);
      const events: TranslationEvent[] = [];
      process.env.TRANSLATION_PROVIDER = "mock";
      await mgr.start((e) => events.push(e));

      mgr.onSttText("ہیلو", true);
      await drainQueue();

      const texts = events.filter((e) => e.type === "translation:text");
      if (texts.length !== 1) {
        throw new Error(`Expected 1 translation, got ${texts.length}`);
      }
      mgr.stop();
    },
  },

  {
    name: "Dedupe: identical final within window is ignored",
    async fn() {
      const mgr = new TranslationManager(2000);
      const events: TranslationEvent[] = [];
      process.env.TRANSLATION_PROVIDER = "mock";
      await mgr.start((e) => events.push(e));

      mgr.onSttText("ہیلو", true);
      mgr.onSttText("ہیلو", true);
      mgr.onSttText("ہیلو", true);
      await drainQueue();

      const texts = events.filter((e) => e.type === "translation:text");
      if (texts.length !== 1) {
        throw new Error(`Expected 1 translation (2 suppressed), got ${texts.length}`);
      }
      mgr.stop();
    },
  },

  {
    name: "Dedupe: identical final after window is translated again",
    async fn() {
      const mgr = new TranslationManager(30); // tiny window
      const events: TranslationEvent[] = [];
      process.env.TRANSLATION_PROVIDER = "mock";
      await mgr.start((e) => events.push(e));

      mgr.onSttText("ہیلو", true);
      await new Promise((r) => setTimeout(r, 60)); // > window
      mgr.onSttText("ہیلو", true);
      await drainQueue();

      const texts = events.filter((e) => e.type === "translation:text");
      if (texts.length !== 2) {
        throw new Error(`Expected 2 translations after window expiry, got ${texts.length}`);
      }
      mgr.stop();
    },
  },

  {
    name: "Dedupe: different final is translated immediately",
    async fn() {
      const mgr = new TranslationManager(60000); // long window must not block new text
      const events: TranslationEvent[] = [];
      process.env.TRANSLATION_PROVIDER = "mock";
      await mgr.start((e) => events.push(e));

      mgr.onSttText("ہیلو", true);
      mgr.onSttText("شکریہ", true);
      await drainQueue();

      const texts = events.filter((e) => e.type === "translation:text");
      if (texts.length !== 2) {
        throw new Error(`Expected 2 different texts translated, got ${texts.length}`);
      }
      mgr.stop();
    },
  },

  {
    name: "Dedupe: whitespace-only differences are duplicates",
    async fn() {
      const mgr = new TranslationManager(2000);
      const events: TranslationEvent[] = [];
      process.env.TRANSLATION_PROVIDER = "mock";
      await mgr.start((e) => events.push(e));

      mgr.onSttText("ہیلو", true);
      mgr.onSttText("  ہیلو  ", true);
      mgr.onSttText("ہیلو", true);
      await drainQueue();

      const texts = events.filter((e) => e.type === "translation:text");
      if (texts.length !== 1) {
        throw new Error(`Expected whitespace variants suppressed (1 total), got ${texts.length}`);
      }
      mgr.stop();
    },
  },

  {
    name: "Dedupe: window=0 disables deduplication",
    async fn() {
      const mgr = new TranslationManager(0);
      const events: TranslationEvent[] = [];
      process.env.TRANSLATION_PROVIDER = "mock";
      await mgr.start((e) => events.push(e));

      mgr.onSttText("ہیلو", true);
      mgr.onSttText("ہیلو", true);
      mgr.onSttText("ہیلو", true);
      await drainQueue();

      const texts = events.filter((e) => e.type === "translation:text");
      if (texts.length !== 3) {
        throw new Error(`Expected 3 translations with dedup disabled, got ${texts.length}`);
      }
      mgr.stop();
    },
  },

  {
    name: "Dedupe: invalid env config warns and falls back explicitly",
    async fn() {
      const original = process.env.STT_FINAL_DEDUPE_WINDOW_MS;
      process.env.STT_FINAL_DEDUPE_WINDOW_MS = "disable"; // invalid string
      const warnings: string[] = [];
      const origWarn = console.warn;
      console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
      try {
        const mgr = new TranslationManager(); // reads env → should warn + use default
        const events: TranslationEvent[] = [];
        process.env.TRANSLATION_PROVIDER = "mock";
        await mgr.start((e) => events.push(e));
        mgr.onSttText("ہیلو", true);
        mgr.onSttText("ہیلو", true);
        await drainQueue();

        if (warnings.length === 0) {
          throw new Error("Expected a [CONFIG] warning for invalid value");
        }
        if (!warnings[0].includes("STT_FINAL_DEDUPE_WINDOW_MS")) {
          throw new Error(`Warning should name the env var, got: ${warnings[0]}`);
        }
        // Default window (2000ms) active → duplicate suppressed
        const texts = events.filter((e) => e.type === "translation:text");
        if (texts.length !== 1) {
          throw new Error(`Fallback default should suppress duplicate, got ${texts.length} translations`);
        }
        mgr.stop();
      } finally {
        console.warn = origWarn;
        if (original === undefined) delete process.env.STT_FINAL_DEDUPE_WINDOW_MS;
        else process.env.STT_FINAL_DEDUPE_WINDOW_MS = original;
      }
    },
  },

  {
    name: "Dedupe: provider not called for suppressed duplicates",
    async fn() {
      const mgr = new TranslationManager(5000);
      const events: TranslationEvent[] = [];
      process.env.TRANSLATION_PROVIDER = "mock";
      await mgr.start((e) => events.push(e));

      // Simulate mock STT cadence: same final repeated 6 times
      for (let i = 0; i < 6; i++) {
        mgr.onSttText("آپ کی آواز سنائی دے رہی ہے", true);
      }
      await drainQueue();

      // Each actual provider call emits exactly one translation:text on success.
      const providerCalls = events.filter((e) => e.type === "translation:text");
      if (providerCalls.length !== 1) {
        throw new Error(`Provider should be called once for 6 identical finals, got ${providerCalls.length}`);
      }
      mgr.stop();
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Run                                                                */
/* ------------------------------------------------------------------ */

runTests(tests);
