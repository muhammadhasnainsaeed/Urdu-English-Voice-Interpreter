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
import { useTranscript } from './services/useTranscript';
import { useReportedErrors } from './errors/useReportedErrors';
import { useToast } from './errors/toast';
import { RENDERER_OPEN_EXTERNAL_LINKS } from '@shared/index';
import type { TranscriptFormat } from '@shared/index';

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
  const transcript = useTranscript();
  const { toast } = useToast();

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
      message:
        stt.errorCode === 'not-configured'
          ? 'Speech-to-text is not configured. Check the Speech to Text card for details.'
          : 'Speech recognition failed. Please try again.',
      options: stt.errorCode === 'not-configured' ? { severity: 'warning' } : undefined,
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

  // Restore the persisted microphone/output selections exactly once, after
  // the initial preferences read. Automatic devicechange fallbacks keep their
  // existing behavior and never write back — only explicit user selections
  // are persisted (see handleSelectMicrophone / handleSelectOutputDevice).
  const devicesRestoredRef = React.useRef(false);
  useEffect(() => {
    if (!preferences.loaded || devicesRestoredRef.current) return;
    devicesRestoredRef.current = true;
    const micDeviceId = preferences.preferences?.micDeviceId ?? null;
    const outputDeviceId = preferences.preferences?.outputDeviceId ?? null;
    if (micDeviceId) microphone.selectDevice(micDeviceId);
    if (outputDeviceId) void audioOutput.selectDevice(outputDeviceId);
  }, [preferences.loaded, preferences.preferences, microphone.selectDevice, audioOutput.selectDevice]);

  const handleSelectMicrophone = async (deviceId: string) => {
    microphone.selectDevice(deviceId);
    await preferences.update({ micDeviceId: deviceId });
  };

  const handleSelectOutputDevice = async (deviceId: string) => {
    await audioOutput.selectDevice(deviceId);
    await preferences.update({ outputDeviceId: deviceId });
  };

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

  const handleExportTranscript = async (format: TranscriptFormat) => {
    const result = await transcript.exportTranscript(format);
    if (result.ok) {
      toast({
        variant: 'success',
        title: 'Transcript saved',
        description: result.path,
      });
    } else if (!result.canceled) {
      toast({
        variant: 'error',
        title: 'Export failed',
        description: result.message ?? 'Could not save the transcript.',
      });
    }
  };

  const handleClearTranscript = () => {
    transcript.clear();
    stt.clear();
    translation.clearHistory();
  };

  // Floating captions overlay: mirror the main-process window state so the
  // header toggle stays correct even when the overlay closes itself.
  const [overlayOpen, setOverlayOpen] = React.useState(false);
  useEffect(() => {
    let mounted = true;
    void window.electron.getOverlayStatus().then((status) => {
      if (mounted) setOverlayOpen(status.open);
    });
    const off = window.electron.onOverlayEvent((event) => setOverlayOpen(event.open));
    return () => {
      mounted = false;
      off();
    };
  }, []);

  const handleToggleOverlay = async () => {
    const status = await window.electron.toggleOverlay();
    setOverlayOpen(status.open);
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
        onSelectOutputDevice={handleSelectOutputDevice}
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
        transcriptEmpty={transcript.isEmpty}
        onExportTranscript={handleExportTranscript}
        onClearTranscript={handleClearTranscript}
        overlayOpen={overlayOpen}
        onToggleOverlay={() => void handleToggleOverlay()}
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
      onSelectMicrophone={handleSelectMicrophone}
      audioOutputStatus={audioOutput.status}
      audioOutputDevices={audioOutput.devices}
      audioOutputSelectedId={audioOutput.selectedDeviceId}
      onSelectAudioOutput={handleSelectOutputDevice}
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
