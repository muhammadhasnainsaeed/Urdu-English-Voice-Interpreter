import React from "react";
import SubtitleDisplay from "../components/SubtitleDisplay";
import StatusBar from "../components/StatusBar";
import { ApplicationStatus } from "@shared/index";

interface LiveTranslationScreenProps {
  urduText: string;
  englishText: string;
  status: ApplicationStatus;
  latency: number | null;
  onStop: () => void;
}

export default function LiveTranslationScreen({ 
  urduText, 
  englishText, 
  status, 
  latency, 
  onStop 
}: LiveTranslationScreenProps) {
  return (
    <div className="screen live-screen">
      <SubtitleDisplay label="Urdu" icon="🎤" text={urduText} lang="ur" />
      <SubtitleDisplay label="English" icon="🌍" text={englishText} lang="en" />

      <StatusBar status={status} latency={latency ?? undefined} />

      <button className="secondary-btn" onClick={onStop}>
        Stop
      </button>
    </div>
  );
}
