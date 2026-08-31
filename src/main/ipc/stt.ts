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

import { ipcMain, BrowserWindow } from "electron";
import type { SttEvent } from "@shared/index";
import { sttSession } from "../services/stt/manager";

function toArrayBuffer(data: unknown): ArrayBuffer | null {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return view.buffer.slice(
      view.byteOffset,
      view.byteOffset + view.byteLength
    ) as ArrayBuffer;
  }
  return null;
}

export function registerSttIpc(
  getWindow: () => BrowserWindow | null,
  onSttText?: (text: string, isFinal: boolean) => void
) {
  const emit = (event: SttEvent) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("stt:event", event);
    }
    if (onSttText) {
      if (event.type === "partial") onSttText(event.text, false);
      else if (event.type === "final") onSttText(event.text, true);
    }
  };

  ipcMain.handle("stt:start", () => sttSession.start(emit));

  ipcMain.on("stt:audio-data", (_event, data: unknown) => {
    const buffer = toArrayBuffer(data);
    if (buffer && buffer.byteLength > 0) {
      sttSession.pushAudio(buffer);
    }
  });

  ipcMain.handle("stt:stop", () => sttSession.stop());
}
