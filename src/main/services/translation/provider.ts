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

export interface TranslationProvider {
  readonly name: string;
  translate(text: string): Promise<string>;
}

/**
 * Thrown by providers when a translation is rejected due to provider rate
 * limiting (e.g. HTTP 429). Generic reliability signal — any provider can
 * raise it; TranslationManager surfaces it as a "rate-limited" state without
 * knowing provider specifics.
 *
 * `retryAfterMs` is the cooldown the provider entered (from Retry-After when
 * available, otherwise its configured fallback). It is informational for
 * callers; the provider owns the actual cooldown enforcement.
 */
export class RateLimitError extends Error {
  readonly retryAfterMs: number | null;

  constructor(message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export async function createTranslationProvider(): Promise<TranslationProvider | null> {
  const providerName = (process.env.TRANSLATION_PROVIDER || 'mock').toLowerCase();

  if (providerName === 'mock') {
    const { createMockTranslationProvider } = await import('./providers/mock');
    return createMockTranslationProvider();
  }

  if (providerName === 'mymemory') {
    const { createMyMemoryProvider } = await import('./providers/mymemory');
    return createMyMemoryProvider();
  }

  if (providerName === 'azure') {
    const { createAzureTranslatorProvider } = await import('./providers/azure');
    return createAzureTranslatorProvider();
  }

  return null;
}
