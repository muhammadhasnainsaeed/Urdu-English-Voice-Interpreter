import React from "react";
import type {
  ApplicationStatus,
  AudioDevice,
  PermissionStatus,
  SttStatus,
} from "@shared/index";
import MicrophonePanel from "../components/MicrophonePanel";
import SttPanel from "../components/SttPanel";

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
  sttStatus: SttStatus;
  sttPartialText: string;
  sttFinalText: string;
  sttError: string | null;
  sttProvider: string | null;
  onSttStart: () => void;
  onSttStop: () => void;
}

export default function HomeScreen(props: HomeScreenProps) {
  return (
    <div className="screen home-screen">
      <h1>Urdu → English Interpreter</h1>

      <MicrophonePanel
        permission={props.permission}
        status={props.status}
        devices={props.devices}
        selectedDeviceId={props.selectedDeviceId}
        level={props.level}
        error={props.error}
        onSelectDevice={props.onSelectDevice}
        onStart={props.onStart}
        onStop={props.onStop}
      />

      <SttPanel
        status={props.sttStatus}
        partialText={props.sttPartialText}
        finalText={props.sttFinalText}
        error={props.sttError}
        provider={props.sttProvider}
        onStart={props.onSttStart}
        onStop={props.onSttStop}
      />

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
        Milestone 3: real-time Urdu speech-to-text. Speak into the microphone
        and watch the live transcript. Urdu → English translation arrives in
        Milestone 4.
      </p>
    </div>
  );
}
