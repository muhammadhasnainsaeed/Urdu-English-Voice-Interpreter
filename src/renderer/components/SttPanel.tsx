import React from "react";
import type { SttStatus, TranslationStatus } from "@shared/index";

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

const PROVIDER_LABELS: Record<string, string> = {
  azure: "Azure",
  whisper: "Local Whisper",
  mock: "Mock (dev)",
  mymemory: "MyMemory",
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
}: SttPanelProps) {
  const listening =
    status === "starting" ||
    status === "listening" ||
    status === "processing" ||
    status === "stopping";
  const startDisabled = status === "starting" || status === "stopping";
  const translationActive = translationStatus === "active" || translationStatus === "starting";
  const canToggleTranslation = status === "listening" || status === "processing";

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
