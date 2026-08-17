import type { TranslationProvider } from "../provider";

const MOCK_TRANSLATIONS: Record<string, string> = {
  "ہیلو": "Hello",
  "کیا حال ہے": "How are you?",
  "آپ کیا کر رہے ہیں": "What are you doing?",
  "میں ٹھیک ہوں": "I am fine",
  "شکریہ": "Thank you",
  "ہاں": "Yes",
  "نہیں": "No",
  "مجھے سمجھ نہیں آئی": "I did not understand",
  "آپ کا نام کیا ہے": "What is your name?",
  "میرا نام ہے": "My name is",
  "اللہ حافظ": "Goodbye",
  "خوش آمدید": "Welcome",
  "معذرت": "Excuse me",
  "بارش ہو رہی ہے": "It is raining",
  "موسم اچھا ہے": "The weather is nice",
};

export function createMockTranslationProvider(): TranslationProvider {
  return {
    name: "mock",

    async translate(text: string): Promise<string> {
      const trimmed = text.trim();

      if (MOCK_TRANSLATIONS[trimmed]) {
        return MOCK_TRANSLATIONS[trimmed];
      }

      for (const [urdu, english] of Object.entries(MOCK_TRANSLATIONS)) {
        if (trimmed.includes(urdu)) {
          return english;
        }
      }

      return `[English] ${trimmed}`;
    },
  };
}
