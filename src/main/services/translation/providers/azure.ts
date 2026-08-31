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

export function createAzureTranslatorProvider(): TranslationProvider {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;
  const endpoint =
    process.env.AZURE_TRANSLATOR_ENDPOINT ||
    "https://api.cognitive.microsofttranslator.com";

  if (!key || !region) {
    throw new Error(
      "Azure Translator requires AZURE_TRANSLATOR_KEY and AZURE_TRANSLATOR_REGION in .env."
    );
  }

  return {
    name: "azure",

    async translate(text: string): Promise<string> {
      const url = `${endpoint.replace(/\/+$/, "")}/translate?api-version=3.0&from=ur&to=en`;

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Ocp-Apim-Subscription-Region": region,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([{ Text: text }]),
      });

      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(
          `Azure Translator HTTP ${resp.status}: ${body}`
        );
      }

      const data = (await resp.json()) as Array<{
        translations: Array<{ text: string; to: string }>;
      }>;

      const translated = data?.[0]?.translations?.[0]?.text;
      if (!translated) {
        throw new Error("Azure Translator returned empty translation.");
      }

      return translated;
    },
  };
}
