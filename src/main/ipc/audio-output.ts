import { ipcMain, BrowserWindow } from "electron";
import { AudioOutputManager, detectBlackHole } from "../services/audio-output/manager";

export const audioOutputManager = new AudioOutputManager();

export function registerAudioOutputIpc(
  getWindow: () => BrowserWindow | null
): void {
  const emit = (event: import("@shared/index").AudioOutputEvent) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("audio-output:event", event);
    }
  };

  ipcMain.handle("audio-output:start", () => {
    return audioOutputManager.start(emit, getWindow);
  });

  ipcMain.handle("audio-output:stop", () => {
    audioOutputManager.stop();
  });

  ipcMain.handle(
    "audio-output:select",
    (_event, deviceId: unknown) => {
      if (typeof deviceId === "string") {
        audioOutputManager.selectDevice(deviceId);
      }
    }
  );

  ipcMain.handle("audio-output:list-devices", () => {
    return audioOutputManager.getAvailableDevices();
  });

  ipcMain.handle("audio-output:detect-blackhole", () => {
    return detectBlackHole();
  });
}
