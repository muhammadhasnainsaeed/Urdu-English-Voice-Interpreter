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
import { listVoices, selectSystemVoice, voiceIsAzure } from './voices';
import { requireLanguage } from '@shared/languages';

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

async function createLocalProvider(voiceId?: string, language?: string): Promise<TtsProvider> {
  const { createSayTtsProvider } = await import('./providers/say');
  if (!language) return createSayTtsProvider(voiceId);
  const { voices } = await listVoices(true, 'say', language);
  return createSayTtsProvider(selectSystemVoice(voices, voiceId, language));
}

export async function createTtsProvider(voiceId?: string, language?: string): Promise<TtsProvider | null> {
  if (language) requireLanguage(language);
  const providerName = (process.env.TTS_PROVIDER || 'mock').toLowerCase();
  // A non-Azure voice id is a macOS system voice (selectable only in dev).
  // System voices are local `say` voices — route them to the `say` provider so
  // they are never passed to the Azure SDK (which would reject them). This
  // only affects dev/unpackaged builds; production only exposes Azure voices.
  if (voiceId && !voiceIsAzure(voiceId)) {
    if (!language) return createLocalProvider(voiceId);
    const { voices } = await listVoices(true, 'say', language);
    if (voices.some((voice) => voice.id === voiceId)) return createLocalProvider(voiceId, language);
    // Persisted system voices from a previous language must not override the configured provider.
    voiceId = undefined;
  }

  if (providerName === 'mock') {
    const { createMockTtsProvider } = await import('./providers/mock');
    return createMockTtsProvider();
  }

  if (providerName === 'say') {
    return createLocalProvider(voiceId && !voiceIsAzure(voiceId) ? voiceId : undefined, language);
  }

  if (providerName === 'azure') {
    const { createAzureTtsProvider } = await import('./providers/azure');
    return createAzureTtsProvider(voiceId, language);
  }

  return null;
}
