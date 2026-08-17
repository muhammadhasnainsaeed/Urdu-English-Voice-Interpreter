import React from "react";
import type { SttStatus } from "@shared/index";

interface SttPanelProps {
  status: SttStatus;
  partialText: string;
  finalText: string;
  error: string | null;
  provider: string | null;
  onStart: () => void;
  onStop: () => void;
}

const STT_STATUS_LABELS: Record<SttStatus, string> = {
  idle: "Idle",
  starting: "Starting…",
  listening: "Listening",
  processing: "Processing…",
  stopping: "Stopping…",
  error: "Error",
};

const PROVIDER_LABELS: Record<string, string> = {
  azure: "Azure Speech",
  whisper: "Local Whisper",
  mock: "Mock (dev)",
};

export default function SttPanel({
  status,
  partialText,
  finalText,
  error,
  provider,
  onStart,
  onStop,
}: SttPanelProps) {
  const listening =
    status === "starting" ||
    status === "listening" ||
    status === "processing" ||
    status === "stopping";
  const startDisabled = status === "starting" || status === "stopping";

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
