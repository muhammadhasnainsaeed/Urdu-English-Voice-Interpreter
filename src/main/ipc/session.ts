import { ipcMain, BrowserWindow } from "electron";
import type { SessionEvent } from "@shared/index";
import { sessionManager } from "../services/session";

export { sessionManager };

export function registerSessionIpc(
  getWindow: () => BrowserWindow | null
): void {
  sessionManager.setWindowGetter(getWindow);

  const emit = (event: SessionEvent) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("session:event", event);
    }
  };

  sessionManager.setEmitter(emit);

  ipcMain.handle("session:start", () => sessionManager.start());
  ipcMain.handle("session:stop", () => sessionManager.stop());
}
