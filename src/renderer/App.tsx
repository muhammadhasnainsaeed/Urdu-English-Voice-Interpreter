/*
 * Urdu English Interpreter
 * Copyright (C) 2026 Muhammad Hasnain Saeed
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import React, { useEffect } from "react";
import HomeScreen from "./pages/HomeScreen";
import { useMicrophone } from "./services/useMicrophone";
import { useStt } from "./services/useStt";
import { useTranslation } from "./services/useTranslation";
import { useTts } from "./services/useTts";
import { useAudioOutput } from "./services/useAudioOutput";
import { useSession } from "./services/useSession";
import { useSetup } from "./setup/useSetup";
import { RENDERER_OPEN_EXTERNAL_LINKS } from "@shared/index";

export default function App() {
  const microphone = useMicrophone();
  const stt = useStt();
  const translation = useTranslation();
  const tts = useTts();
  const audioOutput = useAudioOutput();
  const session = useSession();

  const setup = useSetup({
    micPermission: microphone.permission,
    hasMicDevice: microphone.devices.length > 0,
    outputDevices: audioOutput.devices,
    selectedOutputDeviceId: audioOutput.selectedDeviceId,
    refreshOutputDevices: audioOutput.refreshDevices,
    checkBlackHole: () => window.electron.detectBlackHole(),
  });

  const handleSttStart = async () => {
    const capture = await microphone.start();
    if (!capture.ok) return;
    if (capture.stream && capture.audioContext) {
      await stt.start(capture.stream, capture.audioContext);
    }
  };

  const handleSttStop = async () => {
    try {
      if (tts.status === "active") {
        await tts.stop();
      }
    } finally {
      try {
        if (translation.status === "active") {
          await translation.stop();
        }
      } finally {
        try {
          await stt.stop();
        } finally {
          microphone.stop();
        }
      }
    }
  };

  const handleTtsStart = async () => {
    if (audioOutput.status !== "active") {
      await audioOutput.start();
    }
    await tts.start();
  };

  /** Unified meeting start: session + mic + STT */
  const handleMeetingStart = async () => {
    // Start session (audio output + TTS + translation)
    const result = await session.start();
    if (!result.ok) return;

    // Start mic + STT
    const capture = await microphone.start();
    if (!capture.ok) return;
    if (capture.stream && capture.audioContext) {
      await stt.start(capture.stream, capture.audioContext);
    }
  };

  /** Unified meeting stop: everything in reverse */
  const handleMeetingStop = async () => {
    try {
      await session.stop();
    } finally {
      try {
        await stt.stop();
      } finally {
        microphone.stop();
      }
    }
  };

  useEffect(() => {
    if (microphone.status !== "listening" && stt.isActive) {
      stt.stop();
    }
  }, [microphone.status, stt.isActive, stt.stop]);

  // Session auto-stops mic + STT when session stops
  useEffect(() => {
    if (session.status === "idle" || session.status === "error") {
      if (stt.isActive) stt.stop();
      if (microphone.status === "listening") microphone.stop();
    }
  }, [session.status, stt.isActive, stt.stop, microphone.status, microphone.stop]);

  return (
    <HomeScreen
      setup={setup.state}
      onRequestMicPermission={async () => {
        const granted = await microphone.requestPermission();
        if (granted) {
          audioOutput.refreshDevices();
          setup.recheck();
        }
      }}
      onOpenMicSettings={() =>
        window.electron.openExternal(
          RENDERER_OPEN_EXTERNAL_LINKS.micPrivacySettings
        )
      }
      onOpenBlackHoleSite={() =>
        window.electron.openExternal(
          RENDERER_OPEN_EXTERNAL_LINKS.blackholeDownload
        )
      }
      permission={microphone.permission}
      status={microphone.status}
      devices={microphone.devices}
      selectedDeviceId={microphone.selectedDeviceId}
      level={microphone.level}
      error={microphone.error}
      onSelectDevice={microphone.selectDevice}
      onStart={microphone.start}
      onStop={microphone.stop}
      sttStatus={stt.status}
      sttPartialText={stt.partialText}
      sttFinalText={stt.finalText}
      sttError={stt.error}
      sttProvider={stt.provider}
      onSttStart={handleSttStart}
      onSttStop={handleSttStop}
      translationStatus={translation.status}
      finalEnglish={translation.finalEnglish}
      translationError={translation.error}
      translationProvider={translation.provider}
      onTranslationStart={translation.start}
      onTranslationStop={translation.stop}
      ttsStatus={tts.status}
      ttsError={tts.error}
      ttsProvider={tts.provider}
      ttsCurrentText={tts.currentText}
      onTtsStart={handleTtsStart}
      onTtsStop={tts.stop}
      audioOutputStatus={audioOutput.status}
      audioOutputDevices={audioOutput.devices}
      audioOutputSelectedId={audioOutput.selectedDeviceId}
      onSelectAudioOutput={audioOutput.selectDevice}
      sessionStatus={session.status}
      sessionStages={session.stages}
      sessionError={session.error}
      onMeetingStart={handleMeetingStart}
      onMeetingStop={handleMeetingStop}
    />
  );
}
