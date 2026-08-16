import { contextBridge, ipcRenderer } from 'electron';
import type { ApplicationStatus, ElectronAPI } from '@shared/index';

const api: ElectronAPI = {
  getAppStatus: () => ipcRenderer.invoke('get-app-status') as Promise<ApplicationStatus>,
};

contextBridge.exposeInMainWorld('electron', api);
