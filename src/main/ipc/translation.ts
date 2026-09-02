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
import { TranslationManager } from '../services/translation/manager';

export const translationManager = new TranslationManager();

export function registerTranslationIpc(
  getWindow: () => BrowserWindow | null,
  onTranslationText?: (english: string, interim: boolean) => void,
): void {
  ipcMain.handle('translation:start', () => {
    const emit = (event: import('@shared/index').TranslationEvent) => {
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('translation:event', event);
      }
      if (onTranslationText && event.type === 'translation:text') {
        onTranslationText(event.english, event.interim === true);
      }
    };
    return translationManager.start(emit);
  });

  ipcMain.handle('translation:stop', () => {
    translationManager.stop();
  });
}
