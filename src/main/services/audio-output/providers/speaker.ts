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
