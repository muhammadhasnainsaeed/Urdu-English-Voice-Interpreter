import React from "react";
import type {
  AudioOutputDevice,
  AudioOutputStatus,
  SttStatus,
  TranslationStatus,
  TtsStatus,
} from "@shared/index";

interface SttPanelProps {
  status: SttStatus;
  partialText: string;
  finalText: string;
  error: string | null;
  provider: string | null;
  onStart: () => void;
  onStop: () => void;
  translationStatus: TranslationStatus;
  finalEnglish: string;
  translationError: string | null;
  translationProvider: string | null;
  onTranslationStart: () => void;
  onTranslationStop: () => void;
  ttsStatus: TtsStatus;
  ttsError: string | null;
  ttsProvider: string | null;
  ttsCurrentText: string;
  onTtsStart: () => void;
  onTtsStop: () => void;
  audioOutputStatus: AudioOutputStatus;
  audioOutputDevices: AudioOutputDevice[];
  audioOutputSelectedId: string;
  onSelectAudioOutput: (deviceId: string) => void;
}

const STT_STATUS_LABELS: Record<SttStatus, string> = {
  idle: "Idle",
  starting: "Starting…",
  listening: "Listening",
  processing: "Processing…",
  stopping: "Stopping…",
  error: "Error",
};

const TRANSLATION_STATUS_LABELS: Record<TranslationStatus, string> = {
  idle: "Off",
  starting: "Starting…",
  active: "Active",
  error: "Error",
};

const TTS_STATUS_LABELS: Record<TtsStatus, string> = {
  idle: "Off",
  starting: "Starting…",
  active: "Active",
  error: "Error",
};

const PROVIDER_LABELS: Record<string, string> = {
  azure: "Azure",
  whisper: "Local Whisper",
  mock: "Mock (dev)",
  mymemory: "MyMemory",
  say: "macOS Say",
};

export default function SttPanel({
  status,
  partialText,
  finalText,
  error,
  provider,
  onStart,
  onStop,
  translationStatus,
  finalEnglish,
  translationError,
  translationProvider,
  onTranslationStart,
  onTranslationStop,
  ttsStatus,
  ttsError,
  ttsProvider,
  ttsCurrentText,
  onTtsStart,
  onTtsStop,
  audioOutputStatus,
  audioOutputDevices,
  audioOutputSelectedId,
  onSelectAudioOutput,
}: SttPanelProps) {
  const listening =
    status === "starting" ||
    status === "listening" ||
    status === "processing" ||
    status === "stopping";
  const startDisabled = status === "starting" || status === "stopping";
  const translationActive = translationStatus === "active" || translationStatus === "starting";
  const canToggleTranslation = status === "listening" || status === "processing";
  const ttsActive = ttsStatus === "active" || ttsStatus === "starting";
  const canToggleTts = translationActive;

  return (
    <div className="stt-panel">
      <div className="stt-header">
        <span className="stt-title">Speech Recognition</span>
        <span className="stt-lang">Urdu</span>
      </div>

      <div className="mic-status-row">
        <span className="status-label">Status:</span>{" "}
        <span className={`status-value status-${status}`}>
          {STT_STATUS_LABELS[status]}
        </span>
      </div>

      {provider && (
        <div className="mic-status-row provider-row">
          <span className="status-label">Provider:</span>{" "}
          <span className="status-value">
            {PROVIDER_LABELS[provider] ?? provider}
          </span>
        </div>
      )}

      <div className="field">
        <label>Live Transcript</label>
        <div className="transcript-box" dir="rtl">
          {finalText ? (
            <div className="transcript-final">{finalText}</div>
          ) : (
            <div className="transcript-empty">
              {listening ? "Listening for Urdu speech…" : "No speech yet."}
            </div>
          )}
          {partialText && (
            <div className="transcript-partial">{partialText}</div>
          )}
        </div>
      </div>

      <div className="translation-section">
        <div className="stt-header">
          <span className="stt-title">Translation</span>
          <span className="stt-lang">English</span>
        </div>

        <div className="mic-status-row">
          <span className="status-label">Status:</span>{" "}
          <span
            className={`status-value status-translation-${translationStatus}`}
          >
            {TRANSLATION_STATUS_LABELS[translationStatus]}
          </span>
        </div>

        {translationProvider && (
          <div className="mic-status-row provider-row">
            <span className="status-label">Provider:</span>{" "}
            <span className="status-value">
              {PROVIDER_LABELS[translationProvider] ?? translationProvider}
            </span>
          </div>
        )}

        <div className="field">
          <label>Translated Output</label>
          <div className="transcript-box translation-box">
            {finalEnglish ? (
              <div className="transcript-final">{finalEnglish}</div>
            ) : (
              <div className="transcript-empty">
                {translationActive
                  ? listening
                    ? "Translation active — waiting for speech…"
                    : "Start listening to see translations"
                  : "Enable translation to see English output"}
              </div>
            )}
          </div>
        </div>

        <div className="mic-actions">
          {translationActive ? (
            <button
              className="secondary-btn"
              onClick={onTranslationStop}
              disabled={translationStatus === "starting"}
            >
              Stop Translation
            </button>
          ) : (
            <button
              className="primary-btn"
              onClick={onTranslationStart}
              disabled={!canToggleTranslation}
              title={
                !canToggleTranslation
                  ? "Start listening first"
                  : undefined
              }
            >
              Start Translation
            </button>
          )}
        </div>

        {translationError && (
          <p className="error-text">{translationError}</p>
        )}
      </div>

      <div className="tts-section">
        <div className="stt-header">
          <span className="stt-title">Text-to-Speech</span>
          <span className="stt-lang">English</span>
        </div>

        <div className="mic-status-row">
          <span className="status-label">Status:</span>{" "}
          <span className={`status-value status-tts-${ttsStatus}`}>
            {TTS_STATUS_LABELS[ttsStatus]}
          </span>
        </div>

        {ttsProvider && (
          <div className="mic-status-row provider-row">
            <span className="status-label">Provider:</span>{" "}
            <span className="status-value">
              {PROVIDER_LABELS[ttsProvider] ?? ttsProvider}
            </span>
          </div>
        )}

        {ttsCurrentText && (
          <div className="field">
            <label>Speaking</label>
            <div className="transcript-box tts-speaking-box">
              <div className="transcript-final">{ttsCurrentText}</div>
            </div>
          </div>
        )}

        <div className="mic-actions">
          {ttsActive ? (
            <button
              className="secondary-btn"
              onClick={onTtsStop}
              disabled={ttsStatus === "starting"}
            >
              Stop TTS
            </button>
          ) : (
            <button
              className="primary-btn"
              onClick={onTtsStart}
              disabled={!canToggleTts}
              title={
                !canToggleTts
                  ? "Start translation first"
                  : undefined
              }
            >
              Start TTS
            </button>
          )}
        </div>

        {ttsError && (
          <p className="error-text">{ttsError}</p>
        )}
      </div>

      <div className="audio-output-section">
        <div className="stt-header">
          <span className="stt-title">Audio Output</span>
          <span className={`status-pill status-${audioOutputStatus}`}>
            {audioOutputStatus === "active" ? "Active" : audioOutputStatus === "error" ? "Error" : "Off"}
          </span>
        </div>

        <div className="field">
          <label>Output Device</label>
          <select
            className="device-select"
            value={audioOutputSelectedId}
            onChange={(e) => onSelectAudioOutput(e.target.value)}
          >
            {audioOutputDevices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mic-actions">
        {listening ? (
          <button
            className="secondary-btn"
            onClick={onStop}
            disabled={status === "stopping"}
          >
            Stop Listening
          </button>
        ) : (
          <button
            className="primary-btn"
            onClick={onStart}
            disabled={startDisabled}
          >
            Start Listening
          </button>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
