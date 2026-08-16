import React from "react";
import type {
  ApplicationStatus,
  AudioDevice,
  PermissionStatus,
} from "@shared/index";
import MicrophonePanel from "../components/MicrophonePanel";

interface HomeScreenProps {
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

export default function HomeScreen(props: HomeScreenProps) {
  return (
    <div className="screen home-screen">
      <h1>Urdu → English Interpreter</h1>

      <MicrophonePanel {...props} />

      <div className="field">
        <label>Output</label>
        <select className="device-select" disabled>
          <option>BlackHole (Milestone 3+)</option>
        </select>
      </div>

      <div className="field">
        <label>Input Language</label>
        <div className="pill">Urdu</div>
      </div>

      <div className="field">
        <label>Output Language</label>
        <div className="pill">English</div>
      </div>

      <p className="hint">
        Milestone 2: local microphone capture and audio level monitoring.
        Translation will be added in Milestone 3.
      </p>
    </div>
  );
}
