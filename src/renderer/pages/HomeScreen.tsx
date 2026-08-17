import React from "react";
import type {
  ApplicationStatus,
  AudioDevice,
  PermissionStatus,
  SttStatus,
  TranslationStatus,
  TtsStatus,
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
        translationStatus={props.translationStatus}
        finalEnglish={props.finalEnglish}
        translationError={props.translationError}
        translationProvider={props.translationProvider}
        onTranslationStart={props.onTranslationStart}
        onTranslationStop={props.onTranslationStop}
        ttsStatus={props.ttsStatus}
        ttsError={props.ttsError}
        ttsProvider={props.ttsProvider}
        ttsCurrentText={props.ttsCurrentText}
        onTtsStart={props.onTtsStart}
        onTtsStop={props.onTtsStop}
      />

      <div className="field">
        <label>Output</label>
        <select className="device-select" disabled>
          <option>BlackHole (Milestone 5+)</option>
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
        Milestone 5: real-time Urdu → English translation with text-to-speech.
        Speak Urdu and watch the English translation appear and hear it spoken.
        BlackHole audio routing arrives in Milestone 6.
      </p>
    </div>
  );
}
