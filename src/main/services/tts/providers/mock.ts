import type { AudioChunk } from "@shared/index";
import type { TtsProvider } from "../provider";

const MOCK_SAMPLE_RATE = 24000;
const MOCK_DURATION_MS = 200;

export function createMockTtsProvider(): TtsProvider {
  return {
    name: "mock",

    async synthesize(_text: string, signal?: AbortSignal): Promise<AudioChunk> {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, MOCK_DURATION_MS);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(signal.reason);
          },
          { once: true }
        );
      });
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
