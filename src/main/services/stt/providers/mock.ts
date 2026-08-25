import type { SttHandlers, SttProvider } from "../provider";

const SENTENCE = "آپ کی آواز سنائی دے رہی ہے";
const WORDS = SENTENCE.split(" ");
// Deterministic cadence: first partial immediately, then one word every
// STEP_MS. The full cycle (5 words) completes in ~1 s.
const STEP_MS = 250;

export function createMockSttProvider(): SttProvider {
  let handlers: SttHandlers | null = null;
  let timer: NodeJS.Timeout | null = null;
  let cycleRunning = false;
  let step = 0;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    name: "mock",

    async start(active: SttHandlers) {
      handlers = active;
      cycleRunning = false;
      step = 0;
    },

    pushAudio() {
      // Start a recognition cycle on the first chunk of real audio that
      // arrives (a cycle runs once per push burst and emits a growing
      // partial followed by a final). The first partial is emitted
      // immediately and words follow every STEP_MS, so the mock responds as
      // fast as a real recognizer. No transcription or model work happens.
      if (!handlers || cycleRunning) return;
      cycleRunning = true;
      step = 0;
      // Voice-onset proxy for latency telemetry (first chunk of a burst).
      handlers.onSpeechStart?.();

      const emit = () => {
        if (!handlers) {
          cycleRunning = false;
          return;
        }
        step += 1;
        const text = WORDS.slice(0, step).join(" ");
        if (step >= WORDS.length) {
          handlers.onFinal(text);
          cycleRunning = false;
          return;
        }
        handlers.onPartial(text);
        timer = setTimeout(emit, STEP_MS);
      };
      emit();
    },

    async stop() {
      clearTimer();
      cycleRunning = false;
    },
  };
}
