/*
 * Urdu English Interpreter
 * Copyright (C) 2026 Muhammad Hasnain Saeed
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
