import type { TtsProvider } from "../provider";

export function createMockTtsProvider(): TtsProvider {
  return {
    name: "mock",

    async speak(_text: string): Promise<void> {
      // Simulate speech delay; no actual audio output.
      await new Promise((resolve) => setTimeout(resolve, 200));
    },

    async stop(): Promise<void> {
      // No-op.
    },
  };
}
