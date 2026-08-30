import React from "react";
import type { AudioOutputDevice } from "@shared/index";
import type { SetupState, SetupStepState } from "../setup/setupState";

interface SetupPanelProps {
  state: SetupState;
  outputDevices: AudioOutputDevice[];
  selectedOutputDeviceId: string;
  onSelectOutputDevice: (deviceId: string) => void;
  onRequestMicPermission: () => void;
  onOpenMicSettings: () => void;
  onOpenBlackHoleSite: () => void;
}

const STEP_GLYPH: Record<SetupStepState, string> = {
  checking: "\u25cb",
  ready: "\u2713",
  "action-required": "\u25cb",
  error: "\u2716",
};

export default function SetupPanel({
  state,
  outputDevices,
  selectedOutputDeviceId,
  onSelectOutputDevice,
  onRequestMicPermission,
  onOpenMicSettings,
  onOpenBlackHoleSite,
}: SetupPanelProps) {
  const everythingChecking =
    state.mic.state === "checking" &&
    state.output.state === "checking" &&
    state.blackhole.state === "checking";

  return (
    <section className="setup-panel">
      <div className="setup-title">Get set up</div>

      {/* Step 1: Microphone */}
      <div className={`setup-step setup-step-${state.mic.state}`}>
        <span className="setup-step-icon">{STEP_GLYPH[state.mic.state]}</span>
        <div className="setup-step-body">
          <div className="setup-step-title">Microphone</div>
          {state.mic.state === "checking" && (
            <p className="setup-step-sub">Checking microphone access…</p>
          )}
          {state.mic.state === "ready" && (
            <p className="setup-step-sub">
              The app can hear your Urdu speech.
            </p>
          )}
          {state.mic.state === "action-required" && (
            <>
              <p className="setup-step-sub">
                The app needs your microphone to hear your Urdu speech.
              </p>
              <button
                className="secondary-btn setup-step-action"
                onClick={onRequestMicPermission}
              >
                Allow Microphone
              </button>
            </>
          )}
          {state.mic.state === "error" &&
            state.mic.action === "open-settings" && (
              <>
                <p className="setup-step-sub">
                  Open System Settings → Privacy &amp; Security → Microphone,
                  switch “Urdu English Interpreter” on, then come back to this
                  app.
                </p>
                <button
                  className="secondary-btn setup-step-action"
                  onClick={onOpenMicSettings}
                >
                  Open System Settings
                </button>
              </>
            )}
          {state.mic.state === "error" && state.mic.action === "no-mic" && (
            <p className="setup-step-sub">
              No microphone found. Plug one in and restart the app.
            </p>
          )}
        </div>
      </div>

      {/* Step 2: Audio output */}
      <div className={`setup-step setup-step-${state.output.state}`}>
        <span className="setup-step-icon">
          {STEP_GLYPH[state.output.state]}
        </span>
        <div className="setup-step-body">
          <div className="setup-step-title">Audio output</div>
          {state.output.state === "checking" && (
            <p className="setup-step-sub">Checking audio output…</p>
          )}
          {state.output.state === "ready" && (
            <>
              <p className="setup-step-sub">
                Translations will play through “{state.output.selectedDeviceLabel ?? "the current device"}”.
              </p>
              <select
                className="device-select setup-output-select"
                value={selectedOutputDeviceId}
                onChange={(e) => onSelectOutputDevice(e.target.value)}
              >
                {outputDevices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </>
          )}
          {state.output.state === "error" && (
            <p className="setup-step-sub">
              No audio output available. Plug in speakers or headphones, then
              try again.
            </p>
          )}
        </div>
      </div>

      {/* Step 3: BlackHole */}
      <div className={`setup-step setup-step-${state.blackhole.state}`}>
        <span className="setup-step-icon">
          {STEP_GLYPH[state.blackhole.state]}
        </span>
        <div className="setup-step-body">
          <div className="setup-step-title">BlackHole (for meeting apps)</div>
          {state.blackhole.state === "checking" && (
            <p className="setup-step-sub">Checking for BlackHole…</p>
          )}
          {state.blackhole.state === "ready" && (
            <p className="setup-step-sub">
              BlackHole is installed — translated English audio can go straight
              into your meeting app.
            </p>
          )}
          {state.blackhole.state === "action-required" && (
            <>
              <p className="setup-step-sub">
                BlackHole is a free virtual microphone the app uses to send
                English audio into Zoom, Teams or Meet. You can still hear
                subtitles and translate without it.
              </p>
              <button
                className="secondary-btn setup-step-action"
                onClick={onOpenBlackHoleSite}
              >
                Open BlackHole download page
              </button>
            </>
          )}
        </div>
      </div>

      <div
        className={`setup-summary ${
          state.ready ? "setup-summary-ready" : ""
        }`}
      >
        {state.ready
          ? "Ready — press Start Meeting below."
          : everythingChecking
            ? "Checking your setup…"
            : "Finish the steps above, then press Start Meeting."}
      </div>
    </section>
  );
}