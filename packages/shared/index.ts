export interface TranslationResult {
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface AudioDevice {
  deviceId: string;
  label: string;
  type: "input" | "output";
}

export type ApplicationStatus = "idle" | "starting" | "listening" | "processing" | "speaking" | "error";

export interface TranslationState {
  status: ApplicationStatus;
  urduText: string;
  englishText: string;
  latency?: number;
  error?: string;
}

export type AIProviderState = "uninitialized" | "ready" | "connecting" | "active" | "error";

export interface ElectronAPI {
  getAppStatus: () => Promise<ApplicationStatus>;
}
