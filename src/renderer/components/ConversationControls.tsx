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

import React, { useId } from 'react';
import type { AudioDevice, ConversationSettings } from '@shared/index';
import { SUPPORTED_LANGUAGES } from '@shared/languages';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface ConversationControlsProps {
  settings: ConversationSettings;
  onChange: (settings: ConversationSettings) => void;
  inputDevices: AudioDevice[];
  outputDevices: AudioDevice[];
  disabled: boolean;
}

interface LanguageSelectProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}

function LanguageSelect({ id, label, value, onChange, disabled }: LanguageSelectProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_LANGUAGES.map((language) => (
            <SelectItem key={language.code} value={language.code}>
              {language.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface DeviceSelectProps {
  id: string;
  label: string;
  placeholder: string;
  value: string | null;
  devices: AudioDevice[];
  onChange: (value: string) => void;
  disabled: boolean;
}

function DeviceSelect({ id, label, placeholder, value, devices, onChange, disabled }: DeviceSelectProps) {
  // An explicit device keeps a changed system default from joining the two
  // audio paths. Keep unavailable saved selections visible until replaced.
  const explicitDevices = devices.filter(
    (device) => device.deviceId !== 'default' && device.deviceId !== 'communications',
  );
  const unavailable = value && !explicitDevices.some((device) => device.deviceId === value);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Select value={value ?? ''} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {unavailable && (
            <SelectItem value={value} disabled>
              Previously selected device (unavailable)
            </SelectItem>
          )}
          {explicitDevices.length === 0 && (
            <SelectItem value="__no_devices__" disabled>
              No devices available
            </SelectItem>
          )}
          {explicitDevices.map((device) => (
            <SelectItem key={device.deviceId} value={device.deviceId}>
              {device.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function ConversationControls({
  settings,
  onChange,
  inputDevices,
  outputDevices,
  disabled,
}: ConversationControlsProps) {
  const id = useId();
  const update = (patch: Partial<ConversationSettings>) => onChange({ ...settings, ...patch });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <LanguageSelect
          id={`${id}-source`}
          label="You speak"
          value={settings.sourceLanguage}
          onChange={(sourceLanguage) => update({ sourceLanguage })}
          disabled={disabled}
        />
        <LanguageSelect
          id={`${id}-target`}
          label="Client hears"
          value={settings.targetLanguage}
          onChange={(targetLanguage) => update({ targetLanguage })}
          disabled={disabled}
        />
      </div>

      <label htmlFor={`${id}-incoming`} className="flex items-center gap-2 text-sm font-medium">
        <input
          id={`${id}-incoming`}
          type="checkbox"
          checked={settings.incomingEnabled}
          disabled={disabled}
          onChange={(event) => update({ incomingEnabled: event.target.checked })}
          aria-describedby={`${id}-incoming-help`}
          className="h-4 w-4 shrink-0 accent-primary disabled:cursor-not-allowed disabled:opacity-50"
        />
        Translate client audio
      </label>
      <p id={`${id}-incoming-help`} className="m-0 text-xs leading-relaxed text-muted-foreground">
        {settings.incomingEnabled
          ? 'Both sides are translated using separate audio connections. Use headphones to keep your microphone clear.'
          : 'Turn this on to hear the client in your chosen language.'}
      </p>

      {settings.incomingEnabled && (
        <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
          <div className="grid grid-cols-2 gap-3">
            <LanguageSelect
              id={`${id}-incoming-source`}
              label="Client speaks"
              value={settings.incomingSourceLanguage}
              onChange={(incomingSourceLanguage) => update({ incomingSourceLanguage })}
              disabled={disabled}
            />
            <LanguageSelect
              id={`${id}-incoming-target`}
              label="You hear"
              value={settings.incomingTargetLanguage}
              onChange={(incomingTargetLanguage) => update({ incomingTargetLanguage })}
              disabled={disabled}
            />
          </div>
          <DeviceSelect
            id={`${id}-client-input`}
            label="Client audio input"
            placeholder="Select the client's virtual audio cable"
            value={settings.incomingDeviceId}
            devices={inputDevices}
            onChange={(incomingDeviceId) => update({ incomingDeviceId })}
            disabled={disabled}
          />
          <DeviceSelect
            id={`${id}-listening-output`}
            label="Your headphones"
            placeholder="Select your listening device"
            value={settings.listeningDeviceId}
            devices={outputDevices}
            onChange={(listeningDeviceId) => update({ listeningDeviceId })}
            disabled={disabled}
          />
          <ol className="m-0 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground">
            <li>Set the meeting speaker to a separate virtual cable, such as BlackHole 16ch.</li>
            <li>Select that same cable as Client audio input above.</li>
            <li>Keep the meeting microphone on the outgoing cable, such as BlackHole 2ch.</li>
          </ol>
          <p className="m-0 text-xs leading-relaxed text-muted-foreground">
            The two cables must be different. Client translations play through your headphones.
          </p>
        </div>
      )}
      {disabled && (
        <p className="m-0 text-xs text-muted-foreground">Stop the meeting to change languages or devices.</p>
      )}
    </div>
  );
}
