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

export type ApplicationStatus =
  | "idle"
  | "requesting-permission"
  | "ready"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

export type PermissionStatus =
  | "granted"
  | "denied"
  | "not-determined"
  | "restricted"
  | "unknown";

export interface TranslationState {
  status: ApplicationStatus;
  urduText: string;
  englishText: string;
  latency?: number;
  error?: string;
}

export type AIProviderState = "uninitialized" | "ready" | "connecting" | "active" | "error";

export type SttStatus =
  | "idle"
  | "starting"
  | "listening"
  | "processing"
  | "stopping"
  | "error";

export type SttEvent =
  | { type: "started"; message?: string }
  | { type: "partial"; text: string }
  | { type: "final"; text: string }
  | { type: "error"; message: string }
  | { type: "stopped"; message?: string };

export interface SttStartResult {
  ok: boolean;
  message?: string;
  provider?: string;
}

export type TranslationEvent =
  | { type: "translation:started"; provider?: string }
  | { type: "translation:text"; urdu: string; english: string }
  | { type: "translation:error"; message: string }
  | { type: "translation:stopped" };

export type TranslationStatus = "idle" | "starting" | "active" | "error";

export interface TranslationStartResult {
  ok: boolean;
  message?: string;
  provider?: string;
}

export type TtsStatus = "idle" | "starting" | "active" | "error";

export type TtsEvent =
  | { type: "tts:started"; provider?: string }
  | { type: "tts:speaking"; text: string }
  | { type: "tts:spoken"; text: string }
  | { type: "tts:error"; message: string }
  | { type: "tts:stopped" };

export interface TtsStartResult {
  ok: boolean;
  message?: string;
  provider?: string;
}

export interface ElectronAPI {
  getAppStatus: () => Promise<ApplicationStatus>;
  getMicPermission: () => Promise<PermissionStatus>;
  requestMicPermission: () => Promise<PermissionStatus>;
  startStt: () => Promise<SttStartResult>;
  sendSttAudio: (chunk: ArrayBuffer) => void;
  stopStt: () => Promise<void>;
  onSttEvent: (handler: (event: SttEvent) => void) => () => void;
  startTranslation: () => Promise<TranslationStartResult>;
  stopTranslation: () => Promise<void>;
  onTranslationEvent: (handler: (event: TranslationEvent) => void) => () => void;
  startTts: () => Promise<TtsStartResult>;
  stopTts: () => Promise<void>;
  onTtsEvent: (handler: (event: TtsEvent) => void) => () => void;
}
