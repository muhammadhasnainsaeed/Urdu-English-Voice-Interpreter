import React from "react";
import type {
  ApplicationStatus,
  AudioDevice,
  AudioOutputDevice,
  AudioOutputStatus,
  PipelineStageStatus,
  PermissionStatus,
  SessionStatus,
  SttStatus,
  TranslationStatus,
  TtsStatus,
} from "@shared/index";
import MicrophonePanel from "../components/MicrophonePanel";
import SttPanel from "../components/SttPanel";
import PipelinePanel from "../components/PipelinePanel";

const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  idle: "Ready",
  starting: "Starting…",
  active: "Active",
  stopping: "Stopping…",
  error: "Error",
};

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
  audioOutputStatus: AudioOutputStatus;
  audioOutputDevices: AudioOutputDevice[];
  audioOutputSelectedId: string;
  onSelectAudioOutput: (deviceId: string) => void;
  sessionStatus: SessionStatus;
  sessionStages: PipelineStageStatus;
  sessionError: string | null;
  onMeetingStart: () => void;
  onMeetingStop: () => void;
}

function stageIcon(s: string): string {
  if (s === "active" || s === "listening") return "\u25cf";
  if (s === "starting" || s === "stopping") return "\u25cb";
  if (s === "error") return "\u2716";
  return "\u25cb";
}

export default function HomeScreen(props: HomeScreenProps) {
  const meetingActive = props.sessionStatus === "active";
  const meetingStarting = props.sessionStatus === "starting";
  const meetingStopping = props.sessionStatus === "stopping";
  const meetingBusy = meetingStarting || meetingStopping;

  // Live pipeline stage for the dev performance panel.
  const currentStage = !meetingActive
    ? "Idle"
    : props.ttsCurrentText
      ? "Speaking"
      : props.sttPartialText
        ? "Recognizing"
        : "Listening";

  return (
    <div className="screen home-screen">
      <h1>Urdu → English Interpreter</h1>

      <div className="meeting-section">
        <div className="meeting-header">
          <span className="meeting-title">Meeting Mode</span>
          <span className={`status-pill status-${props.sessionStatus}`}>
            {SESSION_STATUS_LABELS[props.sessionStatus]}
          </span>
        </div>

        <div className="meeting-stages">
          <div className="pipeline-stage">
            <span className="stage-icon">{stageIcon(props.sessionStages.stt)}</span>
            <span className="stage-label">STT</span>
          </div>
          <div className="pipeline-stage">
            <span className="stage-icon">{stageIcon(props.sessionStages.translation)}</span>
            <span className="stage-label">Translation</span>
          </div>
          <div className="pipeline-stage">
            <span className="stage-icon">{stageIcon(props.sessionStages.tts)}</span>
            <span className="stage-label">TTS</span>
          </div>
          <div className="pipeline-stage">
            <span className="stage-icon">{stageIcon(props.sessionStages.audioOutput)}</span>
            <span className="stage-label">Audio</span>
          </div>
        </div>

        <div className="mic-actions">
          {meetingActive ? (
            <button
              className="stop-meeting-btn"
              onClick={props.onMeetingStop}
              disabled={meetingBusy}
            >
              Stop Meeting
            </button>
          ) : (
            <button
              className="start-meeting-btn"
              onClick={props.onMeetingStart}
              disabled={meetingBusy}
            >
              Start Meeting
            </button>
          )}
        </div>

        {props.sessionError && (
          <p className="error-text">{props.sessionError}</p>
        )}
      </div>

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
        audioOutputStatus={props.audioOutputStatus}
        audioOutputDevices={props.audioOutputDevices}
        audioOutputSelectedId={props.audioOutputSelectedId}
        onSelectAudioOutput={props.onSelectAudioOutput}
      />

      <PipelinePanel currentStage={currentStage} />

      <div className="field">
        <label>Input Language</label>
        <div className="pill">Urdu</div>
      </div>

      <div className="field">
        <label>Output Language</label>
        <div className="pill">English</div>
      </div>
    </div>
  );
}
