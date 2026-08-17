import React, { useEffect } from "react";
import HomeScreen from "./pages/HomeScreen";
import { useMicrophone } from "./services/useMicrophone";
import { useStt } from "./services/useStt";
import { useTranslation } from "./services/useTranslation";
import { useTts } from "./services/useTts";
import "./styles/App.css";

export default function App() {
  const microphone = useMicrophone();
  const stt = useStt();
  const translation = useTranslation();
  const tts = useTts();

  const handleSttStart = async () => {
    const capture = await microphone.start();
    if (!capture.ok) return;
    if (capture.stream && capture.audioContext) {
      await stt.start(capture.stream, capture.audioContext);
    }
  };

  const handleSttStop = async () => {
    if (tts.status === "active") {
      await tts.stop();
    }
    if (translation.status === "active") {
      await translation.stop();
    }
    await stt.stop();
    microphone.stop();
  };

  useEffect(() => {
    if (microphone.status !== "listening" && stt.isActive) {
      stt.stop();
    }
  }, [microphone.status, stt.isActive, stt.stop]);

  return (
    <HomeScreen
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
      onTtsStart={tts.start}
      onTtsStop={tts.stop}
    />
  );
}
