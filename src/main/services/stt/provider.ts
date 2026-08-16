export interface SttHandlers {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
}

export interface SttProvider {
  readonly name: string;
  start(handlers: SttHandlers): Promise<void>;
  pushAudio(buffer: ArrayBuffer): void;
  stop(): Promise<void>;
}

export const STT_SAMPLE_RATE = 16000;
