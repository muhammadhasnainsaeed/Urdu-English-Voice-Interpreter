import { ipcMain } from "electron";
import {
  getMicrophonePermission,
  requestMicrophonePermission,
} from "../services/audio";

export function registerAudioIpc() {
  ipcMain.handle("mic:get-permission", () => getMicrophonePermission());
  ipcMain.handle("mic:request-permission", () =>
    requestMicrophonePermission()
  );
}
