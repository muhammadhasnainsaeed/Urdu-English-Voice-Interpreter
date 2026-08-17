import { ipcMain, BrowserWindow } from "electron";
import { TranslationManager } from "../services/translation/manager";

export const translationManager = new TranslationManager();

export function registerTranslationIpc(
  getWindow: () => BrowserWindow | null,
  onTranslationText?: (english: string) => void
): void {
  ipcMain.handle("translation:start", () => {
    const emit = (event: import("@shared/index").TranslationEvent) => {
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("translation:event", event);
      }
      if (onTranslationText && event.type === "translation:text") {
        onTranslationText(event.english);
      }
    };
    return translationManager.start(emit);
  });

  ipcMain.handle("translation:stop", () => {
    translationManager.stop();
  });
}
