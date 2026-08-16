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

export function registerSttIpc(getWindow: () => BrowserWindow | null) {
  const emit = (event: SttEvent) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("stt:event", event);
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
