import React, { useEffect } from "react";
import HomeScreen from "./pages/HomeScreen";
import { useMicrophone } from "./services/useMicrophone";
import { useStt } from "./services/useStt";
import "./styles/App.css";

export default function App() {
  const microphone = useMicrophone();
  const stt = useStt();

  const handleSttStart = async () => {
    const capture = await microphone.start();
    if (!capture.ok) return;
    if (capture.stream && capture.audioContext) {
      await stt.start(capture.stream, capture.audioContext);
    }
  };

  const handleSttStop = async () => {
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
      onSttStart={handleSttStart}
      onSttStop={handleSttStop}
    />
  );
}
