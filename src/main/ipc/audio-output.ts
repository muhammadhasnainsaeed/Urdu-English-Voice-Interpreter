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
import { AudioOutputManager, detectBlackHole } from '../services/audio-output/manager';

export const audioOutputManager = new AudioOutputManager();

export function registerAudioOutputIpc(getWindow: () => BrowserWindow | null): void {
  const emit = (event: import('@shared/index').AudioOutputEvent) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('audio-output:event', event);
    }
  };

  ipcMain.handle('audio-output:start', () => {
    return audioOutputManager.start(emit, getWindow);
  });

  ipcMain.handle('audio-output:stop', () => {
    audioOutputManager.stop();
  });

  ipcMain.handle('audio-output:select', (_event, deviceId: unknown) => {
    if (typeof deviceId === 'string') {
      audioOutputManager.selectDevice(deviceId);
    }
  });

  ipcMain.handle('audio-output:list-devices', () => {
    return audioOutputManager.getAvailableDevices();
  });

  ipcMain.handle('audio-output:detect-blackhole', () => {
    return detectBlackHole();
  });
}
