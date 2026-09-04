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
import type { TtsStatus, TtsVoice } from '@shared/index';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert } from './ui/alert';
import { Label } from './ui/label';
import VoicePicker from './VoicePicker';

interface TtsPanelProps {
  status: TtsStatus;
  error: string | null;
  provider: string | null;
  currentText: string;
  voices: TtsVoice[];
  voicesLoading: boolean;
  development: boolean;
  selectedVoiceId: string | null;
  onSelectVoice: (voiceId: string) => void;
  onTestVoice: () => void;
}

const STATUS_LABELS: Record<TtsStatus, string> = {
  idle: 'Off',
  starting: 'Starting…',
  active: 'Active',
  error: 'Error',
};

const PROVIDER_LABELS: Record<string, string> = {
  azure: 'Azure',
  say: 'macOS Say',
  mock: 'Mock (dev)',
};

export default function TtsPanel({
  status,
  error,
  provider,
  currentText,
  voices,
  voicesLoading,
  development,
  selectedVoiceId,
  onSelectVoice,
  onTestVoice,
}: TtsPanelProps) {
  const variant =
    status === 'active'
      ? 'success'
      : status === 'error'
        ? 'destructive'
        : status === 'starting'
          ? 'warning'
          : 'muted';

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between p-4 pb-2">
        <CardTitle className="text-[13px]">Text-to-Speech</CardTitle>
        <div className="flex items-center gap-2">
          {provider && <Badge variant="outline">{PROVIDER_LABELS[provider] ?? provider}</Badge>}
          <Badge variant={variant} dot>
            {STATUS_LABELS[status]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 p-4 pt-0">
        <div className="grid grid-cols-1 gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <Label className="flex items-center gap-1 text-xs text-muted-foreground">
              Voice
              {development && (
                <>
                  <span className="text-muted-foreground/60">·</span>
                  <span className="flex items-center gap-1 font-normal normal-case text-muted-foreground/70">
                    system voices available in dev
                  </span>
                </>
              )}
            </Label>
            <VoicePicker
              voices={voices}
              value={selectedVoiceId}
              onChange={onSelectVoice}
              disabled={voicesLoading}
              placeholder={voicesLoading ? 'Loading voices…' : 'Select a voice'}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onTestVoice} disabled={voicesLoading}>
            Test Voice
          </Button>
        </div>

        {currentText && (
          <div className="flex max-h-36 min-h-16 flex-col gap-2 overflow-y-auto rounded-md border p-3 text-[13px] leading-relaxed">
            <div className="text-foreground">{currentText}</div>
          </div>
        )}

        {error && <Alert variant="destructive">{error}</Alert>}
      </CardContent>
    </Card>
  );
}
