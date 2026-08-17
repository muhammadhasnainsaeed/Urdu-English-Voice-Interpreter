import { contextBridge, ipcRenderer } from "electron";
import type {
  ApplicationStatus,
  ElectronAPI,
  PermissionStatus,
  SttEvent,
  SttStartResult,
  TranslationEvent,
  TranslationStartResult,
} from "@shared/index";

const api: ElectronAPI = {
  getAppStatus: () =>
    ipcRenderer.invoke("get-app-status") as Promise<ApplicationStatus>,
  getMicPermission: () =>
    ipcRenderer.invoke("mic:get-permission") as Promise<PermissionStatus>,
  requestMicPermission: () =>
    ipcRenderer.invoke("mic:request-permission") as Promise<PermissionStatus>,
  startStt: () =>
    ipcRenderer.invoke("stt:start") as Promise<SttStartResult>,
  sendSttAudio: (chunk: ArrayBuffer) => {
    ipcRenderer.send("stt:audio-data", chunk);
  },
  stopStt: () => ipcRenderer.invoke("stt:stop") as Promise<void>,
  onSttEvent: (handler: (event: SttEvent) => void) => {
    const listener = (_event: unknown, payload: SttEvent) => handler(payload);
    ipcRenderer.on("stt:event", listener);
    return () => {
      ipcRenderer.removeListener("stt:event", listener);
    };
  },
  startTranslation: () =>
    ipcRenderer.invoke("translation:start") as Promise<TranslationStartResult>,
  stopTranslation: () =>
    ipcRenderer.invoke("translation:stop") as Promise<void>,
  onTranslationEvent: (handler: (event: TranslationEvent) => void) => {
    const listener = (_event: unknown, payload: TranslationEvent) =>
      handler(payload);
    ipcRenderer.on("translation:event", listener);
    return () => {
      ipcRenderer.removeListener("translation:event", listener);
    };
  },
};

contextBridge.exposeInMainWorld("electron", api);
