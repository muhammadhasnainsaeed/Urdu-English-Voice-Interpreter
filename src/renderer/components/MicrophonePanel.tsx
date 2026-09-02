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
import type { ApplicationStatus, AudioDevice, PermissionStatus } from '@shared/index';
import AudioLevelMeter from './AudioLevelMeter';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { Alert } from './ui/alert';

interface MicrophonePanelProps {
  permission: PermissionStatus;
  status: ApplicationStatus;
  devices: AudioDevice[];
  selectedDeviceId: string | null;
  level: number;
  error: string | null;
  onSelectDevice: (deviceId: string) => void;
  onStart: () => void;
  onStop: () => void;
}

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  idle: 'Idle',
  'requesting-permission': 'Requesting…',
  ready: 'Ready',
  listening: 'Listening',
  processing: 'Processing',
  speaking: 'Speaking',
  error: 'Error',
};

function statusBadge(status: ApplicationStatus) {
  const variant =
    status === 'listening'
      ? 'success'
      : status === 'error'
        ? 'destructive'
        : status === 'requesting-permission'
          ? 'warning'
          : 'muted';
  return (
    <Badge variant={variant} dot>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export default function MicrophonePanel({
  permission,
  status,
  devices,
  selectedDeviceId,
  level,
  error,
  onSelectDevice,
  onStart,
  onStop,
}: MicrophonePanelProps) {
  const listening = status === 'listening';
  const startDisabled = status === 'requesting-permission';

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between p-4 pb-2">
        <CardTitle className="text-[13px]">Microphone</CardTitle>
        {statusBadge(status)}
      </CardHeader>

      <CardContent className="flex flex-col gap-2 p-4 pt-0">
        <div className="flex items-center gap-2">
          <Label htmlFor="mic-device" className="text-xs">
            Device
          </Label>
          <div className="min-w-0 grow">
            <Select value={selectedDeviceId ?? 'none'} onValueChange={onSelectDevice} disabled={listening}>
              <SelectTrigger id="mic-device" aria-label="Microphone device">
                <SelectValue placeholder="No microphone found" />
              </SelectTrigger>
              <SelectContent>
                {devices.length === 0 && (
                  <SelectItem value="none" disabled>
                    No microphone found
                  </SelectItem>
                )}
                {devices.map((d) => (
                  <SelectItem key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs">Input Level</Label>
          <div className="min-w-0 grow">
            <AudioLevelMeter level={level} />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          {listening ? (
            <Button variant="outline" size="sm" onClick={onStop}>
              Stop
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={onStart} disabled={startDisabled}>
              Start
            </Button>
          )}
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}

        {permission === 'denied' && (
          <Alert variant="warning">
            Enable microphone access in System Settings → Privacy &amp; Security → Microphone, then restart
            the app.
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
