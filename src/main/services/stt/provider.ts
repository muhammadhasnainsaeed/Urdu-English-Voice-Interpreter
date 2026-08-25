export interface SttHandlers {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  /**
   * Optional voice-onset signal used only by latency telemetry. Providers
   * with service-side speech detection (Azure) emit it per detected
   * phrase; providers without one simply omit it and telemetry falls back
   * to first-partial time.
   */
  onSpeechStart?: () => void;
}

export interface SttProvider {
  readonly name: string;
  start(handlers: SttHandlers): Promise<void>;
  pushAudio(buffer: ArrayBuffer): void;
  stop(): Promise<void>;
}

export const STT_SAMPLE_RATE = 16000;
