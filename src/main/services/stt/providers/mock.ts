import type { SttHandlers, SttProvider } from "../provider";

const SENTENCE = "آپ کی آواز سنائی دے رہی ہے";
const WORDS = SENTENCE.split(" ");

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
      // partial followed by a final).
      if (!handlers || cycleRunning) return;
      cycleRunning = true;
      step = 0;

      const tick = () => {
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
        timer = setTimeout(tick, 500);
      };
      timer = setTimeout(tick, 300);
    },

    async stop() {
      clearTimer();
      cycleRunning = false;
    },
  };
}
