import React from "react";
import HomeScreen from "./pages/HomeScreen";
import { useMicrophone } from "./services/useMicrophone";
import "./styles/App.css";

export default function App() {
  const microphone = useMicrophone();

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
    />
  );
}
