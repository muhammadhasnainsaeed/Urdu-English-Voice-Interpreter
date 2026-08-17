export interface TranslationProvider {
  readonly name: string;
  translate(text: string): Promise<string>;
}

export async function createTranslationProvider(): Promise<TranslationProvider | null> {
  const providerName = (process.env.TRANSLATION_PROVIDER || "mock").toLowerCase();

  if (providerName === "mock") {
    const { createMockTranslationProvider } = await import("./providers/mock");
    return createMockTranslationProvider();
  }

  if (providerName === "mymemory") {
    const { createMyMemoryProvider } = await import("./providers/mymemory");
    return createMyMemoryProvider();
  }

  if (providerName === "azure") {
    const { createAzureTranslatorProvider } = await import("./providers/azure");
    return createAzureTranslatorProvider();
  }

  return null;
}
