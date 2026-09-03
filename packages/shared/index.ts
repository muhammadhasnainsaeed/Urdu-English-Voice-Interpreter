/*
 * Urdu English Interpreter
 * Copyright (C) 2026 Muhammad Hasnain Saeed
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface AudioDevice {
  deviceId: string;
  label: string;
  type: 'input' | 'output';
}

export type ApplicationStatus =
  'idle' | 'requesting-permission' | 'ready' | 'listening' | 'processing' | 'speaking' | 'error';

export type PermissionStatus = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';

export interface TranslationState {
  status: ApplicationStatus;
  urduText: string;
  englishText: string;
  latency?: number;
  error?: string;
}

export type AIProviderState = 'uninitialized' | 'ready' | 'connecting' | 'active' | 'error';

export type SttStatus = 'idle' | 'starting' | 'listening' | 'processing' | 'stopping' | 'error';

export type SttEvent =
  | { type: 'started'; message?: string }
  | { type: 'partial'; text: string }
  | { type: 'final'; text: string }
  | { type: 'error'; message: string }
  | { type: 'stopped'; message?: string };

export interface SttStartResult {
  ok: boolean;
  message?: string;
  provider?: string;
}

export type TranslationEvent =
  | { type: 'translation:started'; provider?: string }
  | {
      type: 'translation:text';
      urdu: string;
      english: string;
      /** True when produced from a stabilized STT partial, not a final. */
      interim?: boolean;
    }
  | { type: 'translation:rate-limited'; message: string }
  | { type: 'translation:error'; message: string }
  | { type: 'translation:stopped' };

export type TranslationStatus = 'idle' | 'starting' | 'active' | 'rate-limited' | 'error';

export interface TranslationStartResult {
  ok: boolean;
  message?: string;
  provider?: string;
}

export type TtsStatus = 'idle' | 'starting' | 'active' | 'error';

export type TtsEvent =
  | { type: 'tts:started'; provider?: string }
  | { type: 'tts:speaking'; text: string }
  | { type: 'tts:spoken'; text: string }
  | { type: 'tts:interrupted'; text: string }
  | { type: 'tts:error'; message: string }
  | { type: 'tts:stopped' };

export interface TtsStartResult {
  ok: boolean;
  message?: string;
  provider?: string;
}

/* ---- TTS voices (voice selection) ---- */

/** Reliable-to-know gender for a TTS voice where the source advertises it. */
export type VoiceGender = 'female' | 'male' | 'unknown';

export type TtsVoiceSource = 'azure' | 'system';

export interface TtsVoice {
  /** Provider-specific id — azure: "en-US-JennyNeural"; system: macOS name. */
  id: string;
  /** Human-friendly label for the dropdown. */
  name: string;
  gender: VoiceGender;
  source: TtsVoiceSource;
}

export interface ListVoicesResult {
  ok: boolean;
  /** Available for the current environment (dev exposes system voices). */
  voices: TtsVoice[];
  /** True when the app is running unpackaged (macOS system voices available). */
  development: boolean;
  message?: string;
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
  /**
   * Telemetry correlation id assigned by TtsManager. 0 marks an INTERIM
   * (partial-based) chunk whose playback must not consume normal FIFO
   * stage attribution; final-path chunks receive 1,2,3… Absent = legacy.
   */
  playbackId?: number;
  /** True for the first chunk of a streamed playback. */
  streamStart?: boolean;
  /** False until the final chunk of a streamed playback. */
  streamEnd?: boolean;
}

export interface AudioOutputDevice {
  id: string;
  label: string;
  isDefault: boolean;
}

export type AudioOutputStatus = 'idle' | 'active' | 'error';

export type AudioOutputEvent =
  | { type: 'audio-output:started'; provider?: string }
  | { type: 'audio-output:devices'; devices: AudioOutputDevice[] }
  | { type: 'audio-output:error'; message: string }
  | { type: 'audio-output:stopped' };

export interface AudioOutputStartResult {
  ok: boolean;
  message?: string;
  provider?: string;
}

/* ---- Session (Milestone 7) ---- */

export type SessionStatus = 'idle' | 'starting' | 'active' | 'stopping' | 'error';

export interface PipelineStageStatus {
  stt: SttStatus;
  translation: TranslationStatus;
  tts: TtsStatus;
  audioOutput: AudioOutputStatus;
}

export type SessionEvent =
  | { type: 'session:started' }
  | { type: 'session:stopped' }
  | { type: 'session:error'; message: string }
  | { type: 'session:stage'; stage: string; status: string }
  | { type: 'session:status'; stages: PipelineStageStatus };

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
  | 'completed'
  | 'stt-deduped'
  | 'backpressure-dropped'
  | 'translation-failed'
  | 'rate-limited'
  | 'tts-suppressed'
  | 'tts-failed'
  | 'tts-interrupted'
  | 'incomplete';

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
  /** speechStart → first streamed TTS chunk available */
  ttsFirstChunkMs: number | null;
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
  /** Speech start → FIRST audible playback (primary perceived-latency metric) */
  firstAudioMs: number | null;
  /** Speech start → interim (partial-based) audio playback, when one occurred */
  interimFirstAudioMs: number | null;
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
  /** Number of STT partial (recognizing) events observed for this utterance. */
  sttPartialCount?: number;
  t: {
    speechStart: number;
    firstPartial: number | null;
    sttFinal: number;
    translationStart: number | null;
    translationComplete: number | null;
    ttsStart: number | null;
    ttsFirstChunk: number | null;
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
  ttsFirstChunkMs: number | null;
  audioOutputMs: number | null;
  sttFinalToTranslationMs: number | null;
  translationToTtsReadyMs: number | null;
  ttsReadyToAudioOutMs: number | null;
  firstAudioMs: number | null;
  interimFirstAudioMs: number | null;
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
  | { type: 'pipeline:utterance'; utterance: UtteranceTraceReport }
  | { type: 'pipeline:summary'; summary: PipelineSummary };

/** Renderer → main playback lifecycle report for output latency timing. */
export type PlaybackTelemetryEvent =
  | { event: 'start'; bytes: number; playbackId?: number | null }
  | { event: 'complete'; bytes: number; playbackId?: number | null };

/* ---- Open-external (productization: first-launch onboarding) ---- */

export interface OpenExternalResult {
  ok: boolean;
  message?: string;
}

/**
 * Links the renderer may ask the OS to open. Living in shared keeps the
 * renderer-facing link set and the main-process allowlist in lock-step.
 */
export const RENDERER_OPEN_EXTERNAL_LINKS: Record<'micPrivacySettings' | 'blackholeDownload', string> = {
  micPrivacySettings: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  blackholeDownload: 'https://existential.audio/blackhole/',
};

export const ALLOWED_OPEN_EXTERNAL_LINKS: readonly string[] = Object.values(RENDERER_OPEN_EXTERNAL_LINKS);

/** True only for exact allow-listed external links (no sub-paths, no tampering). */
export function isAllowedOpenExternalUrl(url: string): boolean {
  return ALLOWED_OPEN_EXTERNAL_LINKS.some((allowed) => url === allowed);
}

/* ---- Onboarding persistence (first-launch → Home) ---- */

/** The single persisted UI/app-state flag that drives first-launch onboarding. */
export interface AppPreferences {
  /** True once the user has completed (or dismissed) first-launch onboarding. */
  onboardingCompleted: boolean;
  /** Selected TTS voice id (provider-specific). Absent/null → provider default. */
  ttsVoiceId?: string | null;
}

export interface GetPreferencesResult {
  ok: boolean;
  preferences?: AppPreferences;
  message?: string;
}

export interface SetPreferencesResult {
  ok: boolean;
  preferences?: AppPreferences;
  message?: string;
}

/* ---- Electron API bridge ---- */

export interface ElectronAPI {
  getAppStatus: () => Promise<ApplicationStatus>;
  getPreferences: () => Promise<GetPreferencesResult>;
  setPreferences: (preferences: Partial<AppPreferences>) => Promise<SetPreferencesResult>;
  openExternal: (url: string) => Promise<OpenExternalResult>;
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
  getTtsVoices: () => Promise<ListVoicesResult>;
  testTtsVoice: () => Promise<TtsStartResult>;
  getAudioOutputDevices: () => Promise<AudioOutputDevice[]>;
  selectAudioOutput: (deviceId: string) => Promise<void>;
  startAudioOutput: () => Promise<AudioOutputStartResult>;
  stopAudioOutput: () => Promise<void>;
  onAudioOutputEvent: (handler: (event: AudioOutputEvent) => void) => () => void;
  onAudioData: (
    handler: (chunk: {
      data: ArrayBuffer;
      format: AudioFormat;
      playbackId?: number | null;
      streamStart?: boolean;
      streamEnd?: boolean;
    }) => void,
  ) => () => void;
  onAudioCancel: (handler: () => void) => () => void;
  detectBlackHole: () => Promise<boolean>;
  startSession: () => Promise<SessionStartResult>;
  stopSession: () => Promise<void>;
  onSessionEvent: (handler: (event: SessionEvent) => void) => () => void;
  /** True when PIPELINE_DEBUG=1 — gates the dev-only performance panel. */
  pipelineDebugEnabled: boolean;
  onPipelineEvent: (handler: (event: PipelineEvent) => void) => () => void;
  reportPlaybackEvent: (event: PlaybackTelemetryEvent) => void;
}
