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
import { Settings } from 'lucide-react';
import type { SessionStatus, SttStatus, TranslationStatus } from '@shared/index';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { LiveWaveform } from '../components/ui/live-waveform';
import { ThemeSelector } from '../components/theme-selector';

interface HomeScreenProps {
  userName?: string | null;
  /** Session / meeting state */
  sessionStatus: SessionStatus;
  sessionError: string | null;
  onMeetingStart: () => void;
  onMeetingStop: () => void;
  /** STT / subtitle output */
  sttStatus: SttStatus;
  sttPartialText: string;
  sttFinalText: string;
  sttError: string | null;
  /** Translation / English output */
  translationStatus: TranslationStatus;
  finalEnglish: string;
  translationError: string | null;
  /** Navigation */
  onOpenSettings: () => void;
}

const SESSION_BADGE: Record<
  SessionStatus,
  { variant: 'success' | 'destructive' | 'secondary' | 'warning'; label: string }
> = {
  idle: { variant: 'warning', label: 'Stopped' },
  starting: { variant: 'warning', label: 'Starting…' },
  active: { variant: 'success', label: 'Active' },
  stopping: { variant: 'warning', label: 'Stopping…' },
  error: { variant: 'destructive', label: 'Error' },
};

const STT_LABEL: Record<SttStatus, string> = {
  idle: 'Off',
  starting: 'Starting…',
  listening: 'Listening',
  processing: 'Processing…',
  stopping: 'Stopping…',
  error: 'Error',
};

const TRANSLATION_LABEL: Record<TranslationStatus, string> = {
  idle: 'Off',
  starting: 'Starting…',
  active: 'Active',
  'rate-limited': 'Rate-limited',
  error: 'Error',
};

/** True when a status badge is meaningful enough to show on Home. */
function sttStatusShown(status: SttStatus): boolean {
  return status !== 'idle';
}

function translationStatusShown(status: TranslationStatus): boolean {
  return status !== 'idle';
}

export default function HomeScreen(props: HomeScreenProps) {
  const meetingActive = props.sessionStatus === 'active';
  const meetingBusy = props.sessionStatus === 'starting' || props.sessionStatus === 'stopping';
  const sessionBadge = SESSION_BADGE[props.sessionStatus];

  return (
    <div className="home-screen flex h-full flex-col overflow-y-auto p-4">
      {/* Minimal header — identity + theme/settings, no configuration controls */}
      <header className="flex items-center justify-between gap-3 pb-4">
        <div className="min-w-0">
          <h1 className="m-0 truncate text-[15px] font-semibold tracking-tight">
            Urdu → English Interpreter
          </h1>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {props.userName ?? 'Real-time meeting interpreter'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeSelector />
          <Button
            variant="outline"
            size="icon"
            aria-label="Settings"
            onClick={props.onOpenSettings}
            className="h-7 w-7"
          >
            <Settings className="h-[15px] w-[15px]" />
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        {/* 1. Meeting Mode — primary/focal */}
        <Card>
          <CardHeader className="flex-row items-center justify-between p-4 pb-2">
            <CardTitle className="text-lg font-semibold">Meeting Mode</CardTitle>
            <Badge variant={sessionBadge.variant} dot>
              {sessionBadge.label}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-4 pt-1">
            {meetingActive ? (
              <LiveWaveform
                mode="static"
                active
                processing={false}
                height={72}
                barWidth={3}
                barGap={2}
                fadeEdges
                className="w-full"
              />
            ) : (
              <div className="flex h-9 w-full items-end justify-between gap-0.5 rounded-md bg-muted/40 px-3 py-2">
                <span className="text-[12px] font-medium text-muted-foreground">Ready to interpret</span>
                <span className="text-[12px] text-muted-foreground">Start meeting to begin</span>
              </div>
            )}
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

        {/* 2. Speech to Text — readable Urdu subtitle output */}
        <Card>
          <CardHeader className="flex-row items-center justify-between p-4 pb-2">
            <CardTitle className="text-[13px]">Speech to Text</CardTitle>
            {sttStatusShown(props.sttStatus) && <Badge variant="outline">{STT_LABEL[props.sttStatus]}</Badge>}
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div
              className="flex max-h-40 min-h-[72px] flex-col gap-2 overflow-y-auto rounded-md border bg-muted/40 p-3 text-[15px] leading-relaxed"
              dir="rtl"
            >
              {props.sttFinalText ? (
                <div className="textbox-urdu text-foreground">{props.sttFinalText}</div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {props.sttStatus === 'listening' || props.sttStatus === 'processing'
                    ? 'Listening for Urdu speech…'
                    : 'No speech yet.'}
                </div>
              )}
              {props.sttPartialText && (
                <div className="textbox-urdu italic text-muted-foreground">{props.sttPartialText}</div>
              )}
            </div>
            {props.sttError && <p className="mt-2 m-0 text-xs text-destructive">{props.sttError}</p>}
          </CardContent>
        </Card>

        {/* 3. Translation — readable English output */}
        <Card>
          <CardHeader className="flex-row items-center justify-between p-4 pb-2">
            <CardTitle className="text-[13px]">Translation</CardTitle>
            {translationStatusShown(props.translationStatus) && (
              <Badge variant="outline">{TRANSLATION_LABEL[props.translationStatus]}</Badge>
            )}
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex max-h-40 min-h-[72px] flex-col gap-2 overflow-y-auto rounded-md border bg-muted/40 p-3 text-[15px] leading-relaxed">
              {props.finalEnglish ? (
                <div className="text-foreground">{props.finalEnglish}</div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {props.translationStatus === 'active'
                    ? 'Translation active — waiting for speech…'
                    : 'English translation will appear here.'}
                </div>
              )}
            </div>
            {props.translationError && (
              <p className="mt-2 m-0 text-xs text-destructive">{props.translationError}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
