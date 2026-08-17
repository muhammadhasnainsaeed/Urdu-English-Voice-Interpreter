/**
 * Deterministic tests for TtsManager time-window dedup.
 *
 * Run:  npx tsx tests/tts-dedup.test.ts
 *
 * Uses a synchronous mock provider (synthesize resolves immediately), a
 * controllable clock, and a mock AudioOutputManager so every assertion is
 * deterministic — no real timers, no network, no audio.
 */

import { TtsManager } from "../src/main/services/tts/manager";
import type { TtsEvent, TtsStartResult, AudioChunk } from "../packages/shared/index";
import type { TtsProvider } from "../src/main/services/tts/provider";

/* ------------------------------------------------------------------ */
/*  Mock TTS provider — synthesize() resolves immediately               */
/* ------------------------------------------------------------------ */

function createInstantMockProvider(): TtsProvider & { spoken: string[] } {
  const spoken: string[] = [];
  return {
    name: "mock-test",
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
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

let now = 0;
const originalDateNow = Date.now;

function installFakeClock(startMs = 0) {
  now = startMs;
  Date.now = () => now;
}

function advanceMs(ms: number) {
  now += ms;
}

function uninstallFakeClock() {
  Date.now = originalDateNow;
}

async function startManager(
  mgr: TtsManager,
  events: TtsEvent[],
  provider: TtsProvider
): Promise<TtsStartResult> {
  return mgr.start((e) => events.push(e), createMockAudioOutput(), provider);
}

function drainMicrotasks(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/** Process queue until idle (all pending speaks resolved). */
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
  // --- A ---
  {
    name: "A: Same text repeated immediately → only one TTS event",
    fn: async () => {
      installFakeClock(0);
      const mgr = new TtsManager(2000);
      const events: TtsEvent[] = [];
      const provider = createInstantMockProvider();
      await startManager(mgr, events, provider);

      mgr.onTranslationText("Hello");
      await drainQueue();
      mgr.onTranslationText("Hello");
      await drainQueue();
      mgr.onTranslationText("Hello");
      await drainQueue();

      const spokenEvents = events.filter((e) => e.type === "tts:spoken");
      if (spokenEvents.length !== 1) {
        throw new Error(
          `Expected 1 tts:spoken event, got ${spokenEvents.length}`
        );
      }
      if (provider.spoken.length !== 1) {
        throw new Error(
          `Expected provider.synthesize called once, got ${provider.spoken.length}`
        );
      }
      if (provider.spoken[0] !== "Hello") {
        throw new Error(
          `Expected provider to synthesize "Hello", got "${provider.spoken[0]}"`
        );
      }
      uninstallFakeClock();
    },
  },

  // --- B ---
  {
    name: "B: Same text repeated after >2s → spoken again",
    fn: async () => {
      installFakeClock(0);
      const mgr = new TtsManager(2000);
      const events: TtsEvent[] = [];
      const provider = createInstantMockProvider();
      await startManager(mgr, events, provider);

      mgr.onTranslationText("Hello");
      await drainQueue();

      advanceMs(2500); // past the 2s window

      mgr.onTranslationText("Hello");
      await drainQueue();

      const spokenEvents = events.filter((e) => e.type === "tts:spoken");
      if (spokenEvents.length !== 2) {
        throw new Error(
          `Expected 2 tts:spoken events, got ${spokenEvents.length}`
        );
      }
      if (provider.spoken.length !== 2) {
        throw new Error(
          `Expected provider.synthesize called twice, got ${provider.spoken.length}`
        );
      }
      uninstallFakeClock();
    },
  },

  // --- C ---
  {
    name: "C: Different texts → all spoken",
    fn: async () => {
      installFakeClock(0);
      const mgr = new TtsManager(2000);
      const events: TtsEvent[] = [];
      const provider = createInstantMockProvider();
      await startManager(mgr, events, provider);

      mgr.onTranslationText("How are you?");
      await drainQueue();
      mgr.onTranslationText("I am fine.");
      await drainQueue();
      mgr.onTranslationText("Where are you going?");
      await drainQueue();

      if (provider.spoken.length !== 3) {
        throw new Error(
          `Expected 3 spoken, got ${provider.spoken.length}: ${JSON.stringify(provider.spoken)}`
        );
      }
      const expected = ["How are you?", "I am fine.", "Where are you going?"];
      for (let i = 0; i < expected.length; i++) {
        if (provider.spoken[i] !== expected[i]) {
          throw new Error(
            `Expected spoken[${i}]="${expected[i]}", got "${provider.spoken[i]}"`
          );
        }
      }
      uninstallFakeClock();
    },
  },

  // --- D ---
  {
    name: "D: A → B → A → all three spoken",
    fn: async () => {
      installFakeClock(0);
      const mgr = new TtsManager(2000);
      const events: TtsEvent[] = [];
      const provider = createInstantMockProvider();
      await startManager(mgr, events, provider);

      mgr.onTranslationText("A");
      await drainQueue();
      mgr.onTranslationText("B");
      await drainQueue();
      mgr.onTranslationText("A");
      await drainQueue();

      if (provider.spoken.length !== 3) {
        throw new Error(
          `Expected 3 spoken, got ${provider.spoken.length}: ${JSON.stringify(provider.spoken)}`
        );
      }
      if (provider.spoken[0] !== "A") throw new Error(`spoken[0]="${provider.spoken[0]}"`);
      if (provider.spoken[1] !== "B") throw new Error(`spoken[1]="${provider.spoken[1]}"`);
      if (provider.spoken[2] !== "A") throw new Error(`spoken[2]="${provider.spoken[2]}"`);
      uninstallFakeClock();
    },
  },

  // --- E ---
  {
    name: "E: Queue remains active after becoming empty",
    fn: async () => {
      installFakeClock(0);
      const mgr = new TtsManager(2000);
      const events: TtsEvent[] = [];
      const provider = createInstantMockProvider();
      await startManager(mgr, events, provider);

      mgr.onTranslationText("First");
      await drainQueue();
      // Queue is now empty.
      mgr.onTranslationText("Second");
      await drainQueue();

      if (provider.spoken.length !== 2) {
        throw new Error(
          `Expected 2 spoken after re-queue, got ${provider.spoken.length}`
        );
      }
      if (provider.spoken[0] !== "First") throw new Error(`spoken[0]="${provider.spoken[0]}"`);
      if (provider.spoken[1] !== "Second") throw new Error(`spoken[1]="${provider.spoken[1]}"`);
      uninstallFakeClock();
    },
  },

  // --- F ---
  {
    name: "F: New translation after idle → automatically spoken",
    fn: async () => {
      installFakeClock(0);
      const mgr = new TtsManager(2000);
      const events: TtsEvent[] = [];
      const provider = createInstantMockProvider();
      await startManager(mgr, events, provider);

      mgr.onTranslationText("First");
      await drainQueue();

      // Idle for a long time.
      advanceMs(10000);

      mgr.onTranslationText("After idle");
      await drainQueue();

      if (provider.spoken.length !== 2) {
        throw new Error(
          `Expected 2 spoken after idle, got ${provider.spoken.length}`
        );
      }
      if (provider.spoken[1] !== "After idle") {
        throw new Error(`spoken[1]="${provider.spoken[1]}"`);
      }
      uninstallFakeClock();
    },
  },

  // --- Extra: dedup at exactly window boundary ---
  {
    name: "Extra: Same text at exactly window boundary → spoken",
    fn: async () => {
      installFakeClock(0);
      const mgr = new TtsManager(2000);
      const events: TtsEvent[] = [];
      const provider = createInstantMockProvider();
      await startManager(mgr, events, provider);

      mgr.onTranslationText("Test");
      await drainQueue();

      advanceMs(2000); // exactly at boundary

      mgr.onTranslationText("Test");
      await drainQueue();

      if (provider.spoken.length !== 2) {
        throw new Error(
          `Expected 2 spoken at boundary, got ${provider.spoken.length}`
        );
      }
      uninstallFakeClock();
    },
  },

  // --- Extra: dedup window = 0 disables dedup ---
  {
    name: "Extra: dedupeWindowMs=0 disables dedup entirely",
    fn: async () => {
      installFakeClock(0);
      const mgr = new TtsManager(0);
      const events: TtsEvent[] = [];
      const provider = createInstantMockProvider();
      await startManager(mgr, events, provider);

      mgr.onTranslationText("A");
      await drainQueue();
      mgr.onTranslationText("A");
      await drainQueue();
      mgr.onTranslationText("A");
      await drainQueue();

      if (provider.spoken.length !== 3) {
        throw new Error(
          `Expected 3 spoken with dedup disabled, got ${provider.spoken.length}`
        );
      }
      uninstallFakeClock();
    },
  },

  // --- Extra: empty/whitespace text is ignored ---
  {
    name: "Extra: empty and whitespace-only text is ignored",
    fn: async () => {
      installFakeClock(0);
      const mgr = new TtsManager(2000);
      const events: TtsEvent[] = [];
      const provider = createInstantMockProvider();
      await startManager(mgr, events, provider);

      mgr.onTranslationText("");
      mgr.onTranslationText("   ");
      mgr.onTranslationText("\t\n");
      await drainQueue();

      if (provider.spoken.length !== 0) {
        throw new Error(
          `Expected 0 spoken for empty/whitespace, got ${provider.spoken.length}`
        );
      }
      uninstallFakeClock();
    },
  },

  // --- Extra: inactive manager ignores text ---
  {
    name: "Extra: inactive manager ignores text",
    fn: async () => {
      installFakeClock(0);
      const mgr = new TtsManager(2000);
      const events: TtsEvent[] = [];
      const provider = createInstantMockProvider();

      // Don't start the manager.
      mgr.onTranslationText("Hello");
      await drainQueue();

      if (provider.spoken.length !== 0) {
        throw new Error(
          `Expected 0 spoken when inactive, got ${provider.spoken.length}`
        );
      }
      uninstallFakeClock();
    },
  },

  // --- Extra: stop resets dedup state ---
  {
    name: "Extra: stop() resets dedup state so same text is spoken again after restart",
    fn: async () => {
      installFakeClock(0);
      const mgr = new TtsManager(2000);
      const events: TtsEvent[] = [];
      const provider = createInstantMockProvider();
      await startManager(mgr, events, provider);

      mgr.onTranslationText("Hello");
      await drainQueue();

      mgr.stop();

      // Restart with a fresh provider.
      const provider2 = createInstantMockProvider();
      await startManager(mgr, events, provider2);

      mgr.onTranslationText("Hello");
      await drainQueue();

      if (provider2.spoken.length !== 1) {
        throw new Error(
          `Expected 1 spoken after restart, got ${provider2.spoken.length}`
        );
      }
      if (provider2.spoken[0] !== "Hello") {
        throw new Error(`spoken[0]="${provider2.spoken[0]}"`);
      }
      uninstallFakeClock();
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Run                                                                */
/* ------------------------------------------------------------------ */

runTests(tests);
