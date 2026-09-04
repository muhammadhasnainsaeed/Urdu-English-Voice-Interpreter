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

import React, { useEffect, useState } from 'react';
import HomeScreen from './pages/HomeScreen';
import SettingsScreen from './pages/SettingsScreen';
import OnboardingScreen from './pages/OnboardingScreen';
import { useMicrophone } from './services/useMicrophone';
import { useStt } from './services/useStt';
import { useTranslation } from './services/useTranslation';
import { useTts } from './services/useTts';
import { useTtsVoices } from './services/useTtsVoices';
import { useAudioOutput } from './services/useAudioOutput';
import { useSession } from './services/useSession';
import { useSetup } from './setup/useSetup';
import { usePreferences } from './services/usePreferences';
import { useReportedErrors } from './errors/useReportedErrors';
import { RENDERER_OPEN_EXTERNAL_LINKS } from '@shared/index';

type View = 'loading' | 'onboarding' | 'home' | 'settings';

export default function App() {
  const microphone = useMicrophone();
  const stt = useStt();
  const translation = useTranslation();
  const tts = useTts();
  const ttsVoices = useTtsVoices();
  const audioOutput = useAudioOutput();
  const session = useSession();
  const preferences = usePreferences();

  const [view, setView] = useState<View>('loading');

  const setup = useSetup({
    micPermission: microphone.permission,
    hasMicDevice: microphone.devices.length > 0,
    outputDevices: audioOutput.devices,
    selectedOutputDeviceId: audioOutput.selectedDeviceId,
    refreshOutputDevices: audioOutput.refreshDevices,
    checkBlackHole: () => window.electron.detectBlackHole(),
  });

  // Route every pipeline error through the centralized error flow (toast +
  // Diagnostics registry). Persistent inline recovery UI in the panels stays.
  useReportedErrors([
    {
      category: 'permission',
      error: microphone.permission === 'granted' ? null : microphone.error,
      message: 'Microphone access is needed. Enable it in System Settings.',
      options: { severity: 'warning' },
    },
    {
      category: 'device',
      error: microphone.permission === 'granted' ? microphone.error : null,
      message: 'Microphone unavailable. Check your microphone or select another in Settings.',
      options: { toast: false },
    },
    {
      category: 'stt',
      error: stt.error,
      message: 'Speech recognition failed. Please try again.',
    },
    {
      category: 'translation',
      error: translation.error,
      message: 'Translation is temporarily unavailable. Please try again.',
    },
    {
      category: 'tts',
      error: tts.error,
      message: 'Speech playback failed. Please try again.',
    },
    {
      category: 'audio-output',
      error: audioOutput.error,
      message: 'Audio output failed. Check your output device in Settings.',
      options: { severity: 'warning' },
    },
    {
      category: 'session',
      error: session.error,
      message: 'Could not start the meeting. Please try again.',
    },
  ]);

  // Decide the initial screen once preferences have loaded.
  useEffect(() => {
    if (!preferences.loaded) return;
    setView(preferences.onboardingCompleted ? 'home' : 'onboarding');
  }, [preferences.loaded, preferences.onboardingCompleted]);

  const handleMeetingStart = async () => {
    const result = await session.start();
    if (!result.ok) return;

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

  const handleSelectVoice = async (voiceId: string) => {
    await preferences.update({ ttsVoiceId: voiceId });
  };

  const handleTestVoice = async () => {
    await window.electron.testTtsVoice();
  };

  const ttsVoiceId = preferences.preferences?.ttsVoiceId ?? null;

  const handleCompleteOnboarding = async () => {
    await preferences.completeOnboarding();
    setView('home');
  };

  const handleRunSetupAgain = async () => {
    await preferences.resetOnboarding();
    setView('onboarding');
  };

  const handleResetConfiguration = async () => {
    await preferences.resetOnboarding();
    setView('onboarding');
  };

  useEffect(() => {
    if (microphone.status !== 'listening' && stt.isActive) {
      stt.stop();
    }
  }, [microphone.status, stt.isActive, stt.stop]);

  // Session auto-stops mic + STT when session stops
  useEffect(() => {
    if (session.status === 'idle' || session.status === 'error') {
      if (stt.isActive) stt.stop();
      if (microphone.status === 'listening') microphone.stop();
    }
  }, [session.status, stt.isActive, stt.stop, microphone.status, microphone.stop]);

  if (!preferences.loaded || view === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const currentStage = !(session.status === 'active')
    ? 'Idle'
    : tts.currentText
      ? 'Speaking'
      : stt.partialText
        ? 'Recognizing'
        : 'Listening';

  if (view === 'onboarding') {
    return (
      <OnboardingScreen
        setup={setup.state}
        outputDevices={audioOutput.devices}
        selectedOutputDeviceId={audioOutput.selectedDeviceId}
        onSelectOutputDevice={audioOutput.selectDevice}
        onRequestMicPermission={async () => {
          const granted = await microphone.requestPermission();
          if (granted) {
            audioOutput.refreshDevices();
            setup.recheck();
          }
        }}
        onOpenMicSettings={() =>
          window.electron.openExternal(RENDERER_OPEN_EXTERNAL_LINKS.micPrivacySettings)
        }
        onOpenBlackHoleSite={() =>
          window.electron.openExternal(RENDERER_OPEN_EXTERNAL_LINKS.blackholeDownload)
        }
        onComplete={handleCompleteOnboarding}
      />
    );
  }

  if (view === 'home') {
    return (
      <HomeScreen
        userName={undefined}
        sessionStatus={session.status}
        sessionError={session.error}
        onMeetingStart={handleMeetingStart}
        onMeetingStop={handleMeetingStop}
        sttStatus={stt.status}
        sttPartialText={stt.partialText}
        sttFinalText={stt.finalText}
        sttError={stt.error}
        translationStatus={translation.status}
        finalEnglish={translation.finalEnglish}
        translationError={translation.error}
        onOpenSettings={() => setView('settings')}
      />
    );
  }

  // settings view
  return (
    <SettingsScreen
      onBack={() => setView('home')}
      onRunSetupAgain={handleRunSetupAgain}
      onResetConfiguration={handleResetConfiguration}
      setup={setup.state}
      onRequestMicPermission={async () => {
        const granted = await microphone.requestPermission();
        if (granted) {
          audioOutput.refreshDevices();
          setup.recheck();
        }
      }}
      onOpenMicSettings={() => window.electron.openExternal(RENDERER_OPEN_EXTERNAL_LINKS.micPrivacySettings)}
      onOpenBlackHoleSite={() => window.electron.openExternal(RENDERER_OPEN_EXTERNAL_LINKS.blackholeDownload)}
      permission={microphone.permission}
      micStatus={microphone.status}
      micDevices={microphone.devices}
      selectedDeviceId={microphone.selectedDeviceId}
      micError={microphone.error}
      onSelectMicrophone={microphone.selectDevice}
      audioOutputStatus={audioOutput.status}
      audioOutputDevices={audioOutput.devices}
      audioOutputSelectedId={audioOutput.selectedDeviceId}
      onSelectAudioOutput={audioOutput.selectDevice}
      ttsStatus={tts.status}
      ttsError={tts.error}
      ttsProvider={tts.provider}
      ttsCurrentText={tts.currentText}
      ttsVoices={ttsVoices.voices}
      ttsVoicesLoading={ttsVoices.loading}
      ttsDevelopment={ttsVoices.development}
      ttsVoiceId={ttsVoiceId}
      onSelectVoice={handleSelectVoice}
      onTestVoice={handleTestVoice}
      currentStage={currentStage}
    />
  );
}
