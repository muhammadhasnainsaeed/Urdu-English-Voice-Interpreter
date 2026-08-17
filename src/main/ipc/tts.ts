import { ipcMain, BrowserWindow } from "electron";
import { TtsManager } from "../services/tts/manager";
import type { AudioOutputManager } from "../services/audio-output/manager";

export const ttsManager = new TtsManager();

export function registerTtsIpc(
  getWindow: () => BrowserWindow | null,
  audioOutput: AudioOutputManager
): void {
  ipcMain.handle("tts:start", () => {
    const emit = (event: import("@shared/index").TtsEvent) => {
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("tts:event", event);
      }
    };
    return ttsManager.start(emit, audioOutput);
  });

  ipcMain.handle("tts:stop", () => {
    ttsManager.stop();
  });
}
