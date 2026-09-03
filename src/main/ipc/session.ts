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
import type { SessionEvent } from '@shared/index';
import { sessionManager } from '../services/session';
import { resolveTtsVoiceId } from './tts';

export { sessionManager };

export function registerSessionIpc(getWindow: () => BrowserWindow | null): void {
  sessionManager.setWindowGetter(getWindow);
  sessionManager.setTtsVoiceIdResolver(resolveTtsVoiceId);

  const emit = (event: SessionEvent) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('session:event', event);
    }
  };

  sessionManager.setEmitter(emit);

  ipcMain.handle('session:start', () => sessionManager.start());
  ipcMain.handle('session:stop', () => sessionManager.stop());
}
