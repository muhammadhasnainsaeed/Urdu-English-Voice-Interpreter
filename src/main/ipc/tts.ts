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

import { ipcMain, BrowserWindow, app } from 'electron';
import { TtsManager } from '../services/tts/manager';
import type { AudioOutputManager } from '../services/audio-output/manager';
import {
  listVoices,
  normalizeSelectedVoiceId,
  resolveTtsProviderName,
  voiceIsAzure,
} from '../services/tts/voices';
import { loadPreferences } from './preferences';

const TEST_TEXT = 'Hello, this is a test of the selected voice.';

export const ttsManager = new TtsManager();

/**
 * macOS system voices are a development/testing-only convenience. In a
 * packaged (production) build they are never exposed or usable.
 */
export function isTtsDevelopment(): boolean {
  return !app.isPackaged;
}

/**
 * The voice id currently selected by the user, resolved for this environment
 * AND the active TTS provider. A persisted id that the active provider cannot
 * synthesize is dropped so the provider falls back to its own default voice:
 *   - `say`:   only macOS system voices are usable (an Azure id is rejected).
 *   - azure/mock: only curated Azure ids in production (system voices in dev).
 */
export function resolveTtsVoiceId(): string | null {
  const preferences = loadPreferences();
  const stored = preferences.ttsVoiceId?.trim();
  const provider = resolveTtsProviderName();

  if (provider === 'say') {
    if (!stored || voiceIsAzure(stored)) return null;
    return stored;
  }

  return normalizeSelectedVoiceId(stored, isTtsDevelopment());
}

export function registerTtsIpc(getWindow: () => BrowserWindow | null, audioOutput: AudioOutputManager): void {
  ipcMain.handle('tts:start', () => {
    const emit = (event: import('@shared/index').TtsEvent) => {
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('tts:event', event);
      }
    };
    return ttsManager.start(emit, audioOutput, undefined, resolveTtsVoiceId() ?? undefined);
  });

  ipcMain.handle('tts:stop', () => {
    ttsManager.stop();
  });

  ipcMain.handle('tts:list-voices', async (): Promise<import('@shared/index').ListVoicesResult> => {
    try {
      const provider = resolveTtsProviderName();
      const {
        voices,
        development,
        provider: resolvedProvider,
      } = await listVoices(isTtsDevelopment(), provider);
      return { ok: true, voices, development, provider: resolvedProvider };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, voices: [], development: isTtsDevelopment(), message: msg };
    }
  });

  /**
   * Test the currently selected voice through the REAL TTS provider + audio
   * output path, but on an INDEPENDENT TtsManager so it never leaves the
   * shared meeting/session manager active (which would make a later
   * start return "TTS is already running"). The test manager starts itself,
   * speaks the test phrase, then stops itself and any audio output it started.
   */
  ipcMain.handle('tts:test', async (): Promise<import('@shared/index').TtsStartResult> => {
    const voiceId = resolveTtsVoiceId() ?? undefined;
    const win = getWindow();

    // Ensure an audio output is running so the test phrase is actually audible.
    // The shared AudioOutputManager is used so playback follows the user's
    // selected output device; it is stopped again when the test finishes.
    const audioSend = (event: import('@shared/index').AudioOutputEvent) => {
      if (win && !win.isDestroyed()) win.webContents.send('audio-output:event', event);
    };
    const startedAudioHere = !audioOutput.isActive;
    if (startedAudioHere) {
      const audioStart = await audioOutput.start(audioSend, () => win);
      if (!audioStart.ok) {
        return { ok: false, message: `Audio output unavailable: ${audioStart.message}` };
      }
    }

    const testManager = new TtsManager();
    const emit = (event: import('@shared/index').TtsEvent) => {
      if (win && !win.isDestroyed()) win.webContents.send('tts:event', event);
      if (event.type === 'tts:spoken') {
        // Self-terminate once the test phrase has finished speaking, then
        // release the audio output we may have started so a later meeting
        // start is not blocked by "already running".
        setImmediate(() => {
          testManager.stop();
          if (startedAudioHere) audioOutput.stop();
          if (win && !win.isDestroyed())
            win.webContents.send('tts:event', { type: 'tts:stopped' } as import('@shared/index').TtsEvent);
        });
      }
    };

    const result = await testManager.start(emit, audioOutput, undefined, voiceId);
    if (!result.ok) {
      testManager.stop();
      if (startedAudioHere) audioOutput.stop();
      return result;
    }
    // Feed the test phrase through the existing TTS pipeline (the same path
    // real translations take) so the selected voice is exercised end-to-end.
    testManager.onTranslationText(TEST_TEXT, false);
    return result;
  });
}
