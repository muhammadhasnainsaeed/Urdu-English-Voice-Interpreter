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

import React from 'react';
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
} from '@shared/index';
import MicrophonePanel from '../components/MicrophonePanel';
import SetupPanel from '../components/SetupPanel';
import SttPanel from '../components/SttPanel';
import TranslationPanel from '../components/TranslationPanel';
import TtsPanel from '../components/TtsPanel';
import AudioOutputPanel from '../components/AudioOutputPanel';
import PipelinePanel from '../components/PipelinePanel';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { LiveWaveform } from '../components/ui/live-waveform';
import { ThemeSelector } from '../components/theme-selector';
import type { SetupState } from '../setup/setupState';

interface HomeScreenProps {
  setup: SetupState;
  onRequestMicPermission: () => void;
  onOpenMicSettings: () => void;
  onOpenBlackHoleSite: () => void;
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

const SESSION_BADGE: Record<
  SessionStatus,
  { variant: 'success' | 'warning' | 'destructive' | 'muted'; label: string }
> = {
  idle: { variant: 'muted', label: 'Ready' },
  starting: { variant: 'warning', label: 'Starting…' },
  active: { variant: 'success', label: 'Active' },
  stopping: { variant: 'warning', label: 'Stopping…' },
  error: { variant: 'destructive', label: 'Error' },
};

function stageBadge(s: string): 'success' | 'warning' | 'muted' {
  if (s === 'active' || s === 'listening') return 'success';
  if (s === 'starting' || s === 'stopping') return 'warning';
  return 'muted';
}

export default function HomeScreen(props: HomeScreenProps) {
  const meetingActive = props.sessionStatus === 'active';
  const meetingStarting = props.sessionStatus === 'starting';
  const meetingStopping = props.sessionStatus === 'stopping';
  const meetingBusy = meetingStarting || meetingStopping;

  const currentStage = !meetingActive
    ? 'Idle'
    : props.ttsCurrentText
      ? 'Speaking'
      : props.sttPartialText
        ? 'Recognizing'
        : 'Listening';

  // Meeting Mode waveform state — driven by session, not a separate copy.
  const activeListening = meetingActive;
  const processing = !meetingActive;

  const sessionBadge = SESSION_BADGE[props.sessionStatus];

  const stages: { key: keyof PipelineStageStatus; label: string }[] = [
    { key: 'stt', label: 'STT' },
    { key: 'translation', label: 'Translate' },
    { key: 'tts', label: 'TTS' },
    { key: 'audioOutput', label: 'Audio' },
  ];

  return (
    <div className="home-screen flex h-full flex-col gap-3 overflow-y-auto p-4">
      <header className="flex items-start justify-between gap-3 pb-1">
        <div>
          <h1 className="m-0 text-[15px] font-semibold tracking-tight">Urdu → English Voice Interpreter</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Real-time meeting interpreter</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={sessionBadge.variant} dot>
            {sessionBadge.label}
          </Badge>
          <ThemeSelector />
        </div>
      </header>

      <SetupPanel
        state={props.setup}
        outputDevices={props.audioOutputDevices}
        selectedOutputDeviceId={props.audioOutputSelectedId}
        onSelectOutputDevice={props.onSelectAudioOutput}
        onRequestMicPermission={props.onRequestMicPermission}
        onOpenMicSettings={props.onOpenMicSettings}
        onOpenBlackHoleSite={props.onOpenBlackHoleSite}
      />

      <Card>
        <CardHeader className=" p-4 pb-2">
          <CardTitle className="text-lg font-semibold mb-4">Meeting Mode</CardTitle>
          <div className="flex items-center gap-2">
            {stages.map((s) => (
              <Badge key={s.key} variant={stageBadge(props.sessionStages[s.key])} dot>
                {s.label}
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 p-4 pt-1">
          <LiveWaveform
            mode="static"
            active={activeListening}
            processing={processing}
            height={80}
            barWidth={3}
            barGap={2}
            fadeEdges
            className="w-full"
          />
          {meetingActive ? (
            <Button
              variant="destructive"
              size="lg"
              onClick={props.onMeetingStop}
              disabled={meetingBusy}
              className="w-full"
            >
              Stop Meeting
            </Button>
          ) : (
            <Button
              variant="default"
              size="lg"
              onClick={props.onMeetingStart}
              disabled={meetingBusy}
              className="w-full"
            >
              Start Meeting
            </Button>
          )}
          {props.sessionError && <p className="m-0 text-xs text-destructive">{props.sessionError}</p>}
        </CardContent>
      </Card>

      <Separator className="my-1" />

      <TranslationPanel
        status={props.translationStatus}
        finalEnglish={props.finalEnglish}
        error={props.translationError}
        provider={props.translationProvider}
        sttListening={props.sttStatus === 'listening' || props.sttStatus === 'processing'}
        onStart={props.onTranslationStart}
        onStop={props.onTranslationStop}
      />

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

      <TtsPanel
        status={props.ttsStatus}
        error={props.ttsError}
        provider={props.ttsProvider}
        currentText={props.ttsCurrentText}
        translationActive={props.translationStatus === 'active' || props.translationStatus === 'starting'}
        onStart={props.onTtsStart}
        onStop={props.onTtsStop}
      />

      <AudioOutputPanel
        status={props.audioOutputStatus}
        devices={props.audioOutputDevices}
        selectedDeviceId={props.audioOutputSelectedId}
        onSelect={props.onSelectAudioOutput}
      />

      <SttPanel
        status={props.sttStatus}
        partialText={props.sttPartialText}
        finalText={props.sttFinalText}
        error={props.sttError}
        provider={props.sttProvider}
        onStart={props.onSttStart}
        onStop={props.onSttStop}
      />

      <PipelinePanel currentStage={currentStage} />
    </div>
  );
}
