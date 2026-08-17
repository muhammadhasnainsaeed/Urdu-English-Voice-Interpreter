import type { AudioChunk } from "@shared/index";
import type { TtsProvider } from "../provider";

const MOCK_SAMPLE_RATE = 24000;
const MOCK_DURATION_MS = 200;

export function createMockTtsProvider(): TtsProvider {
  return {
    name: "mock",

    async synthesize(_text: string): Promise<AudioChunk> {
      await new Promise((resolve) => setTimeout(resolve, MOCK_DURATION_MS));
      const sampleCount = Math.floor(
        (MOCK_SAMPLE_RATE * MOCK_DURATION_MS) / 1000
      );
      const data = new ArrayBuffer(sampleCount * 2);
      return {
        data,
        format: {
          sampleRate: MOCK_SAMPLE_RATE,
          bitsPerSample: 16,
          channels: 1,
        },
      };
    },

    async stop(): Promise<void> {
      // No-op.
    },
  };
}
