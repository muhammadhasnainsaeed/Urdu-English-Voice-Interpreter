import type { TranslationProvider } from "../provider";

export function createMyMemoryProvider(): TranslationProvider {
  return {
    name: "mymemory",

    async translate(text: string): Promise<string> {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ur|en`;
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`MyMemory HTTP ${resp.status}`);
      }
      const data = await resp.json();
      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        return data.responseData.translatedText;
      }
      throw new Error(data.responseDetails || "MyMemory translation failed");
    },
  };
}
