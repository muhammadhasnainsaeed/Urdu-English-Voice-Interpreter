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
import { Captions, Download, Settings, Trash2 } from 'lucide-react';
import type {
  AudioDevice,
  ConversationSettings,
  SessionStatus,
  SttStatus,
  TranscriptFormat,
  TranslationStatus,
} from '@shared/index';
import { getLanguage } from '@shared/languages';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import ConversationControls from '../components/ConversationControls';
import { ThemeSelector } from '../components/theme-selector';

interface HomeScreenProps {
  userName?: string | null;
  /** Session / meeting state */
  sessionStatus: SessionStatus;
  sessionError: string | null;
  onMeetingStart: () => void;
  onMeetingStop: () => void;
  conversation: ConversationSettings;
  onConversationChange: (settings: ConversationSettings) => void;
  inputDevices: AudioDevice[];
  outputDevices: AudioDevice[];
  microphoneLevel: number;
  incomingStatus: SessionStatus;
  incomingOriginal: string;
  incomingTranslated: string;
  incomingError: string | null;
  /** STT / subtitle output */
  sttStatus: SttStatus;
  sttPartialText: string;
  sttFinalText: string;
  sttError: string | null;
  /** Translation / English output */
  translationStatus: TranslationStatus;
  finalEnglish: string;
  translationError: string | null;
  /** Paired transcript export / clear */
  transcriptEmpty: boolean;
  onExportTranscript: (format: TranscriptFormat) => void;
  onClearTranscript: () => void;
  /** Floating captions overlay */
  overlayOpen: boolean;
  onToggleOverlay: () => void;
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
  const sourceLanguage = getLanguage(props.conversation.sourceLanguage);
  const targetLanguage = getLanguage(props.conversation.targetLanguage);
  const incomingSource = getLanguage(props.conversation.incomingSourceLanguage);
  const incomingTarget = getLanguage(props.conversation.incomingTargetLanguage);
  const microphoneLevel = Number.isFinite(props.microphoneLevel)
    ? Math.max(0, Math.min(1, props.microphoneLevel))
    : 0;

  return (
    <div className="home-screen flex h-full flex-col overflow-y-auto p-4">
      <header className="flex items-center justify-between gap-3 pb-4">
        <div className="min-w-0">
          <h1 className="m-0 truncate text-[15px] font-semibold tracking-tight">Meeting Interpreter</h1>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {props.userName ?? 'Real-time meeting interpreter'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant={props.overlayOpen ? 'default' : 'outline'}
            size="icon"
            aria-label="Toggle captions overlay"
            aria-pressed={props.overlayOpen}
            onClick={props.onToggleOverlay}
            className="h-7 w-7"
          >
            <Captions className="h-[15px] w-[15px]" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Export transcript"
                disabled={props.transcriptEmpty}
                className="h-7 w-7"
              >
                <Download className="h-[15px] w-[15px]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => props.onExportTranscript('txt')}>
                Transcript (.txt)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => props.onExportTranscript('json')}>
                Transcript (.json)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="icon"
            aria-label="Clear transcript"
            disabled={props.transcriptEmpty}
            onClick={props.onClearTranscript}
            className="h-7 w-7"
          >
            <Trash2 className="h-[15px] w-[15px]" />
          </Button>
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
        <Card data-demo="meeting-card">
          <CardHeader className="flex-row items-center justify-between p-4 pb-2">
            <CardTitle className="text-lg font-semibold">Meeting Mode</CardTitle>
            <Badge variant={sessionBadge.variant} dot>
              {sessionBadge.label}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-4 pt-1">
            {meetingActive ? (
              <div className="flex flex-col gap-1.5 rounded-md bg-muted/40 px-3 py-2">
                <span className="text-xs text-muted-foreground">Your microphone</span>
                <div
                  role="meter"
                  aria-label="Microphone level"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(microphoneLevel * 100)}
                  className="h-2 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${microphoneLevel * 100}%` }}
                  />
                </div>
              </div>
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

        {/* Outgoing speech and translation */}
        <Card data-demo="stt-card">
          <CardHeader className="flex-row items-center justify-between p-4 pb-2">
            <CardTitle className="text-[13px]">You · {sourceLanguage?.name ?? 'Speech'}</CardTitle>
            {sttStatusShown(props.sttStatus) && <Badge variant="outline">{STT_LABEL[props.sttStatus]}</Badge>}
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div
              className="flex max-h-40 min-h-[72px] flex-col gap-2 overflow-y-auto rounded-md border bg-muted/40 p-3 text-[15px] leading-relaxed"
              dir={sourceLanguage?.direction ?? 'auto'}
            >
              {props.sttFinalText ? (
                <div className="whitespace-pre-wrap text-foreground">{props.sttFinalText}</div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {props.sttStatus === 'listening' || props.sttStatus === 'processing'
                    ? `Listening for ${sourceLanguage?.name ?? 'your'} speech…`
                    : 'No speech yet.'}
                </div>
              )}
              {props.sttPartialText && (
                <div className="whitespace-pre-wrap italic text-muted-foreground">{props.sttPartialText}</div>
              )}
            </div>
            {props.sttError && <p className="mt-2 m-0 text-xs text-destructive">{props.sttError}</p>}
          </CardContent>
        </Card>

        <Card data-demo="translation-card">
          <CardHeader className="flex-row items-center justify-between p-4 pb-2">
            <CardTitle className="text-[13px]">
              Client hears · {targetLanguage?.name ?? 'Translation'}
            </CardTitle>
            {translationStatusShown(props.translationStatus) && (
              <Badge variant="outline">{TRANSLATION_LABEL[props.translationStatus]}</Badge>
            )}
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div
              className="flex max-h-40 min-h-[72px] flex-col gap-2 overflow-y-auto rounded-md border bg-muted/40 p-3 text-[15px] leading-relaxed"
              dir={targetLanguage?.direction ?? 'auto'}
            >
              {props.finalEnglish ? (
                <div className="whitespace-pre-wrap text-foreground">{props.finalEnglish}</div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {props.translationStatus === 'active'
                    ? 'Translation active — waiting for speech…'
                    : `${targetLanguage?.name ?? 'The'} translation will appear here.`}
                </div>
              )}
            </div>
            {props.translationError && (
              <p className="mt-2 m-0 text-xs text-destructive">{props.translationError}</p>
            )}
          </CardContent>
        </Card>
        {props.conversation.incomingEnabled && (
          <Card data-demo="incoming-card">
            <CardHeader className="flex-row items-center justify-between p-4 pb-2">
              <CardTitle className="text-[13px]">Client → You</CardTitle>
              <Badge variant={SESSION_BADGE[props.incomingStatus].variant} dot>
                {SESSION_BADGE[props.incomingStatus].label}
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 p-4 pt-0">
              <p className="m-0 text-xs font-medium text-muted-foreground">
                Client · {incomingSource?.name ?? 'Speech'}
              </p>
              <div
                dir={incomingSource?.direction ?? 'auto'}
                className="max-h-32 min-h-[48px] overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm leading-relaxed"
              >
                {props.incomingOriginal || (
                  <span className="text-xs text-muted-foreground">Client speech will appear here.</span>
                )}
              </div>
              <p className="mb-0 mt-1 text-xs font-medium text-muted-foreground">
                You hear · {incomingTarget?.name ?? 'Translation'}
              </p>
              <div
                dir={incomingTarget?.direction ?? 'auto'}
                className="max-h-40 min-h-[64px] overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-[15px] leading-relaxed"
              >
                {props.incomingTranslated || (
                  <span className="text-xs text-muted-foreground">Client translation will appear here.</span>
                )}
              </div>
              {props.incomingError && (
                <p className="m-0 text-xs text-destructive" role="alert">
                  {props.incomingError}
                </p>
              )}
            </CardContent>
          </Card>
        )}
        <Card data-demo="conversation-controls">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-[13px]">Languages &amp; audio</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <ConversationControls
              settings={props.conversation}
              onChange={props.onConversationChange}
              inputDevices={props.inputDevices}
              outputDevices={props.outputDevices}
              disabled={meetingActive || meetingBusy}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
