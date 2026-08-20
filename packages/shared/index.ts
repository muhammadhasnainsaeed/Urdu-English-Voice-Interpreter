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
  | { type: "translation:rate-limited"; message: string }
  | { type: "translation:error"; message: string }
  | { type: "translation:stopped" };

export type TranslationStatus =
  | "idle"
  | "starting"
  | "active"
  | "rate-limited"
  | "error";

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

/* ---- Audio output (Milestone 6) ---- */

export interface AudioFormat {
  sampleRate: number;
  bitsPerSample: number;
  channels: number;
}

export interface AudioChunk {
  data: ArrayBuffer;
  format: AudioFormat;
}

export interface AudioOutputDevice {
  id: string;
  label: string;
  isDefault: boolean;
}

export type AudioOutputStatus = "idle" | "active" | "error";

export type AudioOutputEvent =
  | { type: "audio-output:started"; provider?: string }
  | { type: "audio-output:devices"; devices: AudioOutputDevice[] }
  | { type: "audio-output:error"; message: string }
  | { type: "audio-output:stopped" };

export interface AudioOutputStartResult {
  ok: boolean;
  message?: string;
  provider?: string;
}

/* ---- Session (Milestone 7) ---- */

export type SessionStatus = "idle" | "starting" | "active" | "stopping" | "error";

export interface PipelineStageStatus {
  stt: SttStatus;
  translation: TranslationStatus;
  tts: TtsStatus;
  audioOutput: AudioOutputStatus;
}

export type SessionEvent =
  | { type: "session:started" }
  | { type: "session:stopped" }
  | { type: "session:error"; message: string }
  | { type: "session:stage"; stage: string; status: string }
  | { type: "session:status"; stages: PipelineStageStatus };

export interface SessionStartResult {
  ok: boolean;
  message?: string;
  sttProvider?: string;
  translationProvider?: string;
  ttsProvider?: string;
}

/* ---- Electron API bridge ---- */

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
  getAudioOutputDevices: () => Promise<AudioOutputDevice[]>;
  selectAudioOutput: (deviceId: string) => Promise<void>;
  startAudioOutput: () => Promise<AudioOutputStartResult>;
  stopAudioOutput: () => Promise<void>;
  onAudioOutputEvent: (handler: (event: AudioOutputEvent) => void) => () => void;
  onAudioData: (handler: (chunk: { data: ArrayBuffer; format: AudioFormat }) => void) => () => void;
  detectBlackHole: () => Promise<boolean>;
  startSession: () => Promise<SessionStartResult>;
  stopSession: () => Promise<void>;
  onSessionEvent: (handler: (event: SessionEvent) => void) => () => void;
}
