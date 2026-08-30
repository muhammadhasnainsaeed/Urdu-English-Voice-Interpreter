import { contextBridge, ipcRenderer } from "electron";
import type {
  ApplicationStatus,
  AudioFormat,
  AudioOutputDevice,
  AudioOutputEvent,
  AudioOutputStartResult,
  ElectronAPI,
  OpenExternalResult,
  PermissionStatus,
  PipelineEvent,
  PlaybackTelemetryEvent,
  SessionEvent,
  SessionStartResult,
  SttEvent,
  SttStartResult,
  TranslationEvent,
  TranslationStartResult,
  TtsEvent,
  TtsStartResult,
} from "@shared/index";

const api: ElectronAPI = {
  getAppStatus: () =>
    ipcRenderer.invoke("get-app-status") as Promise<ApplicationStatus>,
  openExternal: (url: string) =>
    ipcRenderer.invoke("system:open-external", url) as Promise<OpenExternalResult>,
  getMicPermission: () =>
    ipcRenderer.invoke("mic:get-permission") as Promise<PermissionStatus>,
  requestMicPermission: () =>
    ipcRenderer.invoke("mic:request-permission") as Promise<PermissionStatus>,
  startStt: () =>
    ipcRenderer.invoke("stt:start") as Promise<SttStartResult>,
  sendSttAudio: (chunk: ArrayBuffer) => {
    ipcRenderer.send("stt:audio-data", chunk);
  },
  stopStt: () => ipcRenderer.invoke("stt:stop") as Promise<void>,
  onSttEvent: (handler: (event: SttEvent) => void) => {
    const listener = (_event: unknown, payload: SttEvent) => handler(payload);
    ipcRenderer.on("stt:event", listener);
    return () => {
      ipcRenderer.removeListener("stt:event", listener);
    };
  },
  startTranslation: () =>
    ipcRenderer.invoke("translation:start") as Promise<TranslationStartResult>,
  stopTranslation: () =>
    ipcRenderer.invoke("translation:stop") as Promise<void>,
  onTranslationEvent: (handler: (event: TranslationEvent) => void) => {
    const listener = (_event: unknown, payload: TranslationEvent) =>
      handler(payload);
    ipcRenderer.on("translation:event", listener);
    return () => {
      ipcRenderer.removeListener("translation:event", listener);
    };
  },
  startTts: () =>
    ipcRenderer.invoke("tts:start") as Promise<TtsStartResult>,
  stopTts: () =>
    ipcRenderer.invoke("tts:stop") as Promise<void>,
  onTtsEvent: (handler: (event: TtsEvent) => void) => {
    const listener = (_event: unknown, payload: TtsEvent) =>
      handler(payload);
    ipcRenderer.on("tts:event", listener);
    return () => {
      ipcRenderer.removeListener("tts:event", listener);
    };
  },

  /* Audio output (Milestone 6) */
  getAudioOutputDevices: () =>
    ipcRenderer.invoke("audio-output:list-devices") as Promise<AudioOutputDevice[]>,
  selectAudioOutput: (deviceId: string) =>
    ipcRenderer.invoke("audio-output:select", deviceId) as Promise<void>,
  startAudioOutput: () =>
    ipcRenderer.invoke("audio-output:start") as Promise<AudioOutputStartResult>,
  stopAudioOutput: () =>
    ipcRenderer.invoke("audio-output:stop") as Promise<void>,
  onAudioOutputEvent: (handler: (event: AudioOutputEvent) => void) => {
    const listener = (_event: unknown, payload: AudioOutputEvent) =>
      handler(payload);
    ipcRenderer.on("audio-output:event", listener);
    return () => {
      ipcRenderer.removeListener("audio-output:event", listener);
    };
  },
  onAudioData: (handler: (chunk: { data: ArrayBuffer; format: AudioFormat; playbackId?: number | null; streamStart?: boolean; streamEnd?: boolean }) => void) => {
    const listener = (_event: unknown, payload: { data: ArrayBuffer; format: AudioFormat; playbackId?: number | null; streamStart?: boolean; streamEnd?: boolean }) =>
      handler(payload);
    ipcRenderer.on("audio-output:audio", listener);
    return () => {
      ipcRenderer.removeListener("audio-output:audio", listener);
    };
  },
  onAudioCancel: (handler: () => void) => {
    const listener = () => handler();
    ipcRenderer.on("audio-output:cancel", listener);
    return () => {
      ipcRenderer.removeListener("audio-output:cancel", listener);
    };
  },
  detectBlackHole: () =>
    ipcRenderer.invoke("audio-output:detect-blackhole") as Promise<boolean>,

  /* Session (Milestone 7) */
  startSession: () =>
    ipcRenderer.invoke("session:start") as Promise<SessionStartResult>,
  stopSession: () =>
    ipcRenderer.invoke("session:stop") as Promise<void>,
  onSessionEvent: (handler: (event: SessionEvent) => void) => {
    const listener = (_event: unknown, payload: SessionEvent) =>
      handler(payload);
    ipcRenderer.on("session:event", listener);
    return () => {
      ipcRenderer.removeListener("session:event", listener);
    };
  },

  /* Pipeline telemetry (development-only) */
  pipelineDebugEnabled: process.env.PIPELINE_DEBUG === "1",
  onPipelineEvent: (handler: (event: PipelineEvent) => void) => {
    const listener = (_event: unknown, payload: PipelineEvent) =>
      handler(payload);
    ipcRenderer.on("pipeline:event", listener);
    return () => {
      ipcRenderer.removeListener("pipeline:event", listener);
    };
  },
  reportPlaybackEvent: (event: PlaybackTelemetryEvent): void => {
    ipcRenderer.send("telemetry:playback", event);
  },
};

contextBridge.exposeInMainWorld("electron", api);
