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

import { dialog, ipcMain, type BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import type { SaveTranscriptResult } from '@shared/index';
import { validateSaveRequest } from '../transcript/saveRequest';

/**
 * Transcript export IPC. The renderer serializes the transcript and sends it
 * here; the main process validates the payload, shows the native save dialog,
 * and performs the write. The renderer never selects a filesystem path.
 */
export function registerTranscriptIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('transcript:save', async (_event, payload: unknown): Promise<SaveTranscriptResult> => {
    const validated = validateSaveRequest(payload);
    if (!validated.ok) {
      return { ok: false, message: validated.message };
    }
    const { format, content, fileName } = validated.request;

    const options = {
      defaultPath: fileName,
      filters:
        format === 'txt'
          ? [{ name: 'Text file', extensions: ['txt'] }]
          : [{ name: 'JSON', extensions: ['json'] }],
    };

    try {
      const win = getWindow();
      const result =
        win && !win.isDestroyed()
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options);

      if (result.canceled || !result.filePath) {
        return { ok: false, canceled: true };
      }
      await fs.promises.writeFile(result.filePath, content, 'utf8');
      return { ok: true, path: result.filePath };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Could not save the transcript: ${msg}` };
    }
  });
}
