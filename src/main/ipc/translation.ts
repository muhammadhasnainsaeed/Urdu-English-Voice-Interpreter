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

import { ipcMain } from 'electron';
import { TranslationManager } from '../services/translation/manager';
import { sendToRenderer } from '../windows';
import { loadPreferences } from './preferences';
import { normalizeConversationSettings } from '@shared/conversation';

export const translationManager = new TranslationManager();

export function registerTranslationIpc(
  onTranslationText?: (english: string, interim: boolean) => void,
): void {
  ipcMain.handle('translation:start', () => {
    const emit = (event: import('@shared/index').TranslationEvent) => {
      sendToRenderer('translation:event', event);
      if (onTranslationText && event.type === 'translation:text') {
        onTranslationText(event.english, event.interim === true);
      }
    };
    const settings = normalizeConversationSettings(loadPreferences().conversation);
    return translationManager.start(emit, {
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
    });
  });

  ipcMain.handle('translation:stop', () => {
    translationManager.stop();
  });
}
