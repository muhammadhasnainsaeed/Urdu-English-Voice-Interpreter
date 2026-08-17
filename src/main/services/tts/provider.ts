export interface TtsProvider {
  readonly name: string;
  speak(text: string): Promise<void>;
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
