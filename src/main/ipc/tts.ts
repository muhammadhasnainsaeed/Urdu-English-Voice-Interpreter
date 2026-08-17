import { ipcMain, BrowserWindow } from "electron";
import { TtsManager } from "../services/tts/manager";

export const ttsManager = new TtsManager();

export function registerTtsIpc(
  getWindow: () => BrowserWindow | null
): void {
  ipcMain.handle("tts:start", () => {
    const emit = (event: import("@shared/index").TtsEvent) => {
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("tts:event", event);
      }
    };
    return ttsManager.start(emit);
  });

  ipcMain.handle("tts:stop", () => {
    ttsManager.stop();
  });
}
