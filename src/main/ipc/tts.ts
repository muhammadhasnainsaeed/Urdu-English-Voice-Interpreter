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

import { ipcMain, BrowserWindow } from 'electron';
import { TtsManager } from '../services/tts/manager';
import type { AudioOutputManager } from '../services/audio-output/manager';

export const ttsManager = new TtsManager();

export function registerTtsIpc(getWindow: () => BrowserWindow | null, audioOutput: AudioOutputManager): void {
  ipcMain.handle('tts:start', () => {
    const emit = (event: import('@shared/index').TtsEvent) => {
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('tts:event', event);
      }
    };
    return ttsManager.start(emit, audioOutput);
  });

  ipcMain.handle('tts:stop', () => {
    ttsManager.stop();
  });
}
