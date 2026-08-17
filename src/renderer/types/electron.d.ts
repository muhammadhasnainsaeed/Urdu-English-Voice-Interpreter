import type { ElectronAPI } from '@shared/index';

declare global {
  interface Window {
    electron: ElectronAPI;
  }

  // AudioContext.setSinkId() — Chrome 110+, Electron 42+
  // Not yet in TypeScript DOM types (lib.dom.d.ts)
  interface AudioContext {
    setSinkId(sinkId: string): Promise<void>;
    readonly sinkId: string;
  }
}

export {};
