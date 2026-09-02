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

import React, { useState } from 'react';
import {
  ArrowLeft,
  AudioLines,
  Gauge,
  Mic,
  Settings as SettingsIcon,
  Stethoscope,
  UserRound,
  Wrench,
} from 'lucide-react';
import type {
  ApplicationStatus,
  AudioDevice,
  AudioOutputDevice,
  AudioOutputStatus,
  PermissionStatus,
  SttStatus,
  TranslationStatus,
  TtsStatus,
} from '@shared/index';
import { Button } from '../components/ui/button';
import { Separator } from '../components/ui/separator';
import { cn } from '@/lib/utils';
import MicrophonePanel from '../components/MicrophonePanel';
import AudioOutputPanel from '../components/AudioOutputPanel';
import TtsPanel from '../components/TtsPanel';
import SttPanel from '../components/SttPanel';
import TranslationPanel from '../components/TranslationPanel';
import PipelinePanel from '../components/PipelinePanel';
import SetupPanel from '../components/SetupPanel';
import type { SetupState } from '../setup/setupState';
import { useTheme } from '../components/theme-provider';
import { useErrorHandling } from '../errors/ErrorProvider';

export type SettingsSectionId =
  'audio' | 'voice' | 'speech' | 'appearance' | 'performance' | 'diagnostics' | 'setup';

interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SECTIONS: SettingsSection[] = [
  { id: 'audio', label: 'Audio', icon: Mic },
  { id: 'voice', label: 'Voice', icon: UserRound },
  { id: 'speech', label: 'Speech & Translation', icon: AudioLines },
  { id: 'appearance', label: 'Appearance', icon: SettingsIcon },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'diagnostics', label: 'Diagnostics', icon: Stethoscope },
  { id: 'setup', label: 'Setup', icon: Wrench },
];

/* ---- Appearance section internals ---- */

const THEME_LABELS: Record<'light' | 'dark' | 'system', string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

/* ---- Diagnostics section internals ---- */

interface DiagnosticsItem {
  label: string;
  value: string;
}

function DiagnosticsView({ items }: { items: DiagnosticsItem[] }) {
  return (
    <div className="flex flex-col gap-1 text-[13px]">
      {items.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 py-1">
          <span className="text-muted-foreground">{row.label}</span>
          <span className="font-medium tabular-nums">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

interface SettingsScreenProps {
  onBack: () => void;
  onRunSetupAgain: () => void;
  onResetConfiguration: () => void;
  setup: SetupState;
  onRequestMicPermission: () => void;
  onOpenMicSettings: () => void;
  onOpenBlackHoleSite: () => void;
  permission: PermissionStatus;
  micStatus: ApplicationStatus;
  micDevices: AudioDevice[];
  selectedDeviceId: string | null;
  level: number;
  micError: string | null;
  onSelectMicrophone: (deviceId: string) => void;
  onMicStart: () => void;
  onMicStop: () => void;
  audioOutputStatus: AudioOutputStatus;
  audioOutputDevices: AudioOutputDevice[];
  audioOutputSelectedId: string;
  onSelectAudioOutput: (deviceId: string) => void;
  onSttStart: () => void;
  onSttStop: () => void;
  sttStatus: SttStatus;
  sttPartialText: string;
  sttFinalText: string;
  sttError: string | null;
  sttProvider: string | null;
  onTranslationStart: () => void;
  onTranslationStop: () => void;
  translationStatus: TranslationStatus;
  finalEnglish: string;
  translationError: string | null;
  translationProvider: string | null;
  onTtsStart: () => void;
  onTtsStop: () => void;
  ttsStatus: TtsStatus;
  ttsError: string | null;
  ttsProvider: string | null;
  ttsCurrentText: string;
  currentStage: string;
  onDeviceTest: () => void;
}

export default function SettingsScreen(props: SettingsScreenProps) {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('audio');
  const { theme, setTheme } = useTheme();
  const active = SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0];
  const { errors } = useErrorHandling();

  return (
    <div className="flex h-full flex-col">
      {/* Settings header */}
      <header className="flex items-center justify-between gap-3 p-4 pb-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Back" onClick={props.onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="m-0 text-[15px] font-semibold tracking-tight">Settings</h1>
        </div>
      </header>

      <Separator />

      <div className="flex min-h-0 flex-1">
        {/* Left sidebar */}
        <aside className="flex w-44 shrink-0 flex-col gap-1 overflow-y-auto border-r p-2">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = section.id === activeSection;
            return (
              <Button
                key={section.id}
                variant="ghost"
                aria-pressed={isActive}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  'h-9 justify-start gap-2 rounded-md px-3 text-[13px] font-normal',
                  isActive && 'bg-accent text-accent-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{section.label}</span>
              </Button>
            );
          })}
        </aside>

        {/* Content */}
        <main
          className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4"
          aria-label={`${active.label} settings`}
        >
          {activeSection === 'audio' && (
            <div className="flex flex-col gap-3">
              <SectionHeading
                title="Audio"
                description="Choose where to capture your voice and where English audio plays."
              />
              <MicrophonePanel
                permission={props.permission}
                status={props.micStatus}
                devices={props.micDevices}
                selectedDeviceId={props.selectedDeviceId}
                level={props.level}
                error={props.micError}
                onSelectDevice={props.onSelectMicrophone}
                onStart={props.onMicStart}
                onStop={props.onMicStop}
              />
              <AudioOutputPanel
                status={props.audioOutputStatus}
                devices={props.audioOutputDevices}
                selectedDeviceId={props.audioOutputSelectedId}
                onSelect={props.onSelectAudioOutput}
              />
            </div>
          )}

          {activeSection === 'voice' && (
            <div className="flex flex-col gap-3">
              <SectionHeading
                title="Voice"
                description="Choose the English voice used to speak translations aloud."
              />
              <TtsPanel
                status={props.ttsStatus}
                error={props.ttsError}
                provider={props.ttsProvider}
                currentText={props.ttsCurrentText}
                translationActive={
                  props.translationStatus === 'active' || props.translationStatus === 'starting'
                }
                onStart={props.onTtsStart}
                onStop={props.onTtsStop}
              />
            </div>
          )}

          {activeSection === 'speech' && (
            <div className="flex flex-col gap-3">
              <SectionHeading
                title="Speech & Translation"
                description="Configure how your Urdu speech is recognized and translated."
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
              <TranslationPanel
                status={props.translationStatus}
                finalEnglish={props.finalEnglish}
                error={props.translationError}
                provider={props.translationProvider}
                sttListening={props.sttStatus === 'listening' || props.sttStatus === 'processing'}
                onStart={props.onTranslationStart}
                onStop={props.onTranslationStop}
              />
            </div>
          )}

          {activeSection === 'appearance' && (
            <div className="flex flex-col gap-3">
              <SectionHeading title="Appearance" description="Choose how the app looks." />
              <div className="flex flex-col gap-2">
                {(['light', 'dark', 'system'] as const).map((option) => {
                  const isActive = theme === option;
                  return (
                    <Button
                      key={option}
                      variant="outline"
                      aria-pressed={isActive}
                      onClick={() => setTheme(option)}
                      className={cn(
                        'justify-between font-normal',
                        isActive && 'bg-accent text-accent-foreground',
                      )}
                    >
                      <span>{THEME_LABELS[option]}</span>
                      {isActive && <span className="text-xs font-medium">Current</span>}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {activeSection === 'performance' && (
            <div className="flex flex-col gap-3">
              <SectionHeading
                title="Performance"
                description="Pipeline benchmarks and latency information."
              />
              <PipelinePanel currentStage={props.currentStage} />
            </div>
          )}

          {activeSection === 'diagnostics' && (
            <div className="flex flex-col gap-3">
              <SectionHeading title="Diagnostics" description="Technical status for troubleshooting." />
              <DiagnosticsView
                items={[
                  { label: 'Microphone status', value: props.micStatus },
                  { label: 'Speech-to-text', value: props.sttStatus },
                  { label: 'Translation', value: props.translationStatus },
                  { label: 'Text-to-speech', value: props.ttsStatus },
                  { label: 'Audio output', value: props.audioOutputStatus },
                  { label: 'Current stage', value: props.currentStage },
                ]}
              />
              {errors.length > 0 && (
                <>
                  <Separator className="my-1" />
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Recent errors
                  </p>
                  <DiagnosticsView
                    items={errors.slice(0, 6).map((err) => ({
                      label: err.code,
                      value: err.detail ?? err.message,
                    }))}
                  />
                </>
              )}
              <Button variant="secondary" size="sm" onClick={props.onDeviceTest}>
                Test my microphone
              </Button>
            </div>
          )}

          {activeSection === 'setup' && (
            <div className="flex flex-col gap-3">
              <SectionHeading
                title="Setup"
                description="Review your setup or run first-launch setup again."
              />
              <SetupPanel
                state={props.setup}
                outputDevices={props.audioOutputDevices}
                selectedOutputDeviceId={props.audioOutputSelectedId}
                onSelectOutputDevice={props.onSelectAudioOutput}
                onRequestMicPermission={props.onRequestMicPermission}
                onOpenMicSettings={props.onOpenMicSettings}
                onOpenBlackHoleSite={props.onOpenBlackHoleSite}
                context="settings"
              />
              <Separator className="my-1" />
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={props.onRunSetupAgain}>
                  Run Setup Again
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={props.onResetConfiguration}
                  className="justify-start text-destructive"
                >
                  Reset configuration
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-1">
      <h2 className="m-0 text-base font-semibold">{title}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      <Separator className="mt-3" />
    </div>
  );
}
