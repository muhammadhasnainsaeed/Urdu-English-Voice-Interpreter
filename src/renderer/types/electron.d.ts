import type { ElectronAPI } from '@shared/index';

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
