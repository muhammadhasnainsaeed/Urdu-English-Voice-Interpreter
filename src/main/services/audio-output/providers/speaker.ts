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

import type { BrowserWindow } from "electron";
import type { AudioChunk } from "@shared/index";
import type { AudioOutputProvider } from "../provider";

export function createSystemSpeakerOutput(
  getWindow: () => BrowserWindow | null
): AudioOutputProvider {
  return {
    name: "speaker",

    async start(): Promise<void> {
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("audio-output:start");
      }
    },

    async writeAudio(chunk: AudioChunk): Promise<void> {
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("audio-output:audio", {
          data: chunk.data,
          format: chunk.format,
          playbackId: chunk.playbackId ?? null,
          streamStart: chunk.streamStart ?? true,
          streamEnd: chunk.streamEnd ?? true,
        });
      }
    },

    cancelPlayback(): void {
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("audio-output:cancel");
      }
    },

    async stop(): Promise<void> {
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("audio-output:stop");
      }
    },
  };
}
