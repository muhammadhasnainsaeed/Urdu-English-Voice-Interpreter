import React from "react";
import type {
  ApplicationStatus,
  AudioDevice,
  PermissionStatus,
} from "@shared/index";
import AudioLevelMeter from "./AudioLevelMeter";

interface MicrophonePanelProps {
  permission: PermissionStatus;
  status: ApplicationStatus;
  devices: AudioDevice[];
  selectedDeviceId: string | null;
  level: number;
  error: string | null;
  onSelectDevice: (deviceId: string) => void;
  onStart: () => void;
  onStop: () => void;
}

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  idle: "Idle",
  "requesting-permission": "Requesting permission…",
  ready: "Ready",
  listening: "Listening",
  processing: "Processing",
  speaking: "Speaking",
  error: "Error",
};

const PERMISSION_LABELS: Record<PermissionStatus, string> = {
  granted: "Granted",
  denied: "Denied",
  "not-determined": "Not requested",
  restricted: "Restricted",
  unknown: "Unknown",
};

export default function MicrophonePanel({
  permission,
  status,
  devices,
  selectedDeviceId,
  level,
  error,
  onSelectDevice,
  onStart,
  onStop,
}: MicrophonePanelProps) {
  const listening = status === "listening";
  const requesting = status === "requesting-permission";
  const startDisabled = requesting;

  return (
    <div className="mic-panel">
      <div className="device-field">
        <label>Microphone</label>
        <select
          className="device-select"
          value={selectedDeviceId ?? ""}
          onChange={(e) => onSelectDevice(e.target.value)}
          disabled={listening}
        >
          {devices.length === 0 && <option value="">No microphone found</option>}
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mic-status-row">
        <span className="status-label">Status:</span>{" "}
        <span className={`status-value status-${status}`}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      <div className="mic-status-row">
        <span className="status-label">Permission:</span>{" "}
        <span className={`status-value permission-${permission}`}>
          {PERMISSION_LABELS[permission]}
        </span>
      </div>

      <div className="field">
        <label>Audio Level</label>
        <AudioLevelMeter level={level} />
      </div>

      <div className="mic-actions">
        {listening ? (
          <button className="secondary-btn" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button
            className="primary-btn"
            onClick={onStart}
            disabled={startDisabled}
          >
            Start
          </button>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {permission === "denied" && (
        <p className="hint">
          Enable microphone access in System Settings → Privacy &amp; Security →
          Microphone, then restart the app.
        </p>
      )}
    </div>
  );
}
