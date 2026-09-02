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

import type { AudioChunk } from '@shared/index';

export interface TtsProvider {
  readonly name: string;
  /**
   * Synthesize `text` to an audio chunk. Implementations SHOULD abort work
   * promptly when `signal` aborts (e.g. kill a spawned synthesizer process)
   * and reject with the abort reason. Cancellation is best-effort.
   */
  synthesize(text: string, signal?: AbortSignal): Promise<AudioChunk>;
  /** Optional low-latency audio stream. Chunks must be emitted in order. */
  synthesizeStream?: (
    text: string,
    onChunk: (chunk: AudioChunk, isFinal: boolean) => Promise<void> | void,
    signal?: AbortSignal,
  ) => Promise<void>;
  stop(): Promise<void>;
}

export async function createTtsProvider(): Promise<TtsProvider | null> {
  const providerName = (process.env.TTS_PROVIDER || 'mock').toLowerCase();

  if (providerName === 'mock') {
    const { createMockTtsProvider } = await import('./providers/mock');
    return createMockTtsProvider();
  }

  if (providerName === 'say') {
    const { createSayTtsProvider } = await import('./providers/say');
    return createSayTtsProvider();
  }

  if (providerName === 'azure') {
    const { createAzureTtsProvider } = await import('./providers/azure');
    return createAzureTtsProvider();
  }

  return null;
}
