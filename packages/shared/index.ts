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

export interface ElectronAPI {
  getAppStatus: () => Promise<ApplicationStatus>;
  getMicPermission: () => Promise<PermissionStatus>;
  requestMicPermission: () => Promise<PermissionStatus>;
}
