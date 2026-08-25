import type { AudioChunk } from "@shared/index";

export interface TtsProvider {
  readonly name: string;
  /**
   * Synthesize `text` to an audio chunk. Implementations SHOULD abort work
   * promptly when `signal` aborts (e.g. kill a spawned synthesizer process)
   * and reject with the abort reason. Cancellation is best-effort.
   */
  synthesize(text: string, signal?: AbortSignal): Promise<AudioChunk>;
  stop(): Promise<void>;
}

export async function createTtsProvider(): Promise<TtsProvider | null> {
  const providerName = (process.env.TTS_PROVIDER || "mock").toLowerCase();

  if (providerName === "mock") {
    const { createMockTtsProvider } = await import("./providers/mock");
    return createMockTtsProvider();
  }

  if (providerName === "say") {
    const { createSayTtsProvider } = await import("./providers/say");
    return createSayTtsProvider();
  }

  if (providerName === "azure") {
    const { createAzureTtsProvider } = await import("./providers/azure");
    return createAzureTtsProvider();
  }

  return null;
}
