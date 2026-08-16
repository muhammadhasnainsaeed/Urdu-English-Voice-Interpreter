import { contextBridge, ipcRenderer } from "electron";
import type {
  ApplicationStatus,
  ElectronAPI,
  PermissionStatus,
} from "@shared/index";

const api: ElectronAPI = {
  getAppStatus: () =>
    ipcRenderer.invoke("get-app-status") as Promise<ApplicationStatus>,
  getMicPermission: () =>
    ipcRenderer.invoke("mic:get-permission") as Promise<PermissionStatus>,
  requestMicPermission: () =>
    ipcRenderer.invoke("mic:request-permission") as Promise<PermissionStatus>,
};

contextBridge.exposeInMainWorld("electron", api);
