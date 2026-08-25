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

/* ---- Pipeline telemetry (development instrumentation) ---- */

/** How an instrumented utterance left the pipeline. */
export type UtteranceOutcome =
  | "completed"
  | "stt-deduped"
  | "backpressure-dropped"
  | "translation-failed"
  | "rate-limited"
  | "tts-suppressed"
  | "tts-failed"
  | "incomplete";

/** Per-phase latency breakdown for one utterance (all values are ms). */
export interface UtteranceLatencyBreakdown {
  /** speechStart → first STT partial */
  sttFirstPartialMs: number | null;
  /** speechStart → STT final */
  sttFinalMs: number | null;
  /** translationStart → translationComplete */
  translationMs: number | null;
  /** ttsStart → ttsReady (audio buffer available) */
  ttsMs: number | null;
  /** playbackStart → playbackComplete */
  audioOutputMs: number | null;
  /** speechStart → audioOutputComplete */
  endToEndMs: number | null;
  /** STT final → translation complete (includes translation queue wait) */
  sttFinalToTranslationMs: number | null;
  /** translation complete → TTS audio ready (includes TTS queue wait) */
  translationToTtsReadyMs: number | null;
  /** TTS audio ready → playback start (IPC + renderer handoff) */
  ttsReadyToAudioOutMs: number | null;
}

/**
 * Timestamps (epoch ms, main-process clock; playback timestamps come from
 * the renderer clock on the same machine) for one instrumented utterance.
 * Contains transcript TEXT ONLY — never credentials or raw audio.
 */
export interface UtteranceTraceReport {
  id: number;
  outcome: UtteranceOutcome;
  /**
   * True when speechStart could not be observed (provider without a
   * speech-start signal) and first-partial time was used instead.
   */
  speechStartApprox: boolean;
  urdu?: string;
  english?: string;
  t: {
    speechStart: number;
    firstPartial: number | null;
    sttFinal: number;
    translationStart: number | null;
    translationComplete: number | null;
    ttsStart: number | null;
    ttsReady: number | null;
    audioOutputStart: number | null;
    audioOutputComplete: number | null;
  };
  ms: UtteranceLatencyBreakdown;
}

/** Average per-phase latencies over the rolling window (ms, nullable). */
export interface PipelinePhaseAverages {
  sttFirstPartialMs: number | null;
  sttFinalMs: number | null;
  translationMs: number | null;
  ttsMs: number | null;
  audioOutputMs: number | null;
  sttFinalToTranslationMs: number | null;
  translationToTtsReadyMs: number | null;
  ttsReadyToAudioOutMs: number | null;
}

export interface PipelineSummary {
  /** Number of completed utterances kept in the rolling window. */
  windowSize: number;
  /** Cap of the rolling window (20). */
  windowCap: number;
  /** Completed end-to-end utterances observed in total. */
  completedCount: number;
  e2e: {
    lastMs: number | null;
    avgMs: number | null;
    minMs: number | null;
    maxMs: number | null;
  };
  phaseAvg: PipelinePhaseAverages;
}

export type PipelineEvent =
  | { type: "pipeline:utterance"; utterance: UtteranceTraceReport }
  | { type: "pipeline:summary"; summary: PipelineSummary };

/** Renderer → main playback lifecycle report for output latency timing. */
export type PlaybackTelemetryEvent =
  | { event: "start"; bytes: number }
  | { event: "complete"; bytes: number };

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
  /** True when PIPELINE_DEBUG=1 — gates the dev-only performance panel. */
  pipelineDebugEnabled: boolean;
  onPipelineEvent: (handler: (event: PipelineEvent) => void) => () => void;
  reportPlaybackEvent: (event: PlaybackTelemetryEvent) => void;
}
