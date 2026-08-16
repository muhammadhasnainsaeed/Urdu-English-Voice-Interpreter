import React from "react";

interface HomeScreenProps {
  onStart: () => void;
  error: string | null;
}

export default function HomeScreen({ onStart, error }: HomeScreenProps) {
  return (
    <div className="screen home-screen">
      <h1>Urdu → English Interpreter</h1>

      <div className="device-select-container">
        <div className="device-field">
          <label>Microphone</label>
          <select className="device-select" disabled>
            <option>Default Microphone</option>
          </select>
        </div>

        <div className="device-field">
          <label>Output</label>
          <select className="device-select" disabled>
            <option>BlackHole 2ch (Not Detected)</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label>Input Language</label>
        <div className="pill">Urdu</div>
      </div>

      <div className="field">
        <label>Output Language</label>
        <div className="pill">English</div>
      </div>

      <button className="primary-btn" onClick={onStart}>
        Start Translation
      </button>

      {error && <p className="error-text">{error}</p>}

      <p className="hint">
        Milestone 1: UI Shell. Microphone and BlackHole detection will be implemented in future milestones.
      </p>
    </div>
  );
}
