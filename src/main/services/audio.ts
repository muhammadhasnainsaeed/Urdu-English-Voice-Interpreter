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

import { systemPreferences } from 'electron';
import type { PermissionStatus } from '@shared/index';

export function getMicrophonePermission(): PermissionStatus {
  const status = systemPreferences.getMediaAccessStatus('microphone');
  switch (status) {
    case 'granted':
    case 'denied':
    case 'restricted':
    case 'not-determined':
      return status;
    default:
      return 'unknown';
  }
}

export async function requestMicrophonePermission(): Promise<PermissionStatus> {
  try {
    const granted = await systemPreferences.askForMediaAccess('microphone');
    return granted ? 'granted' : 'denied';
  } catch {
    return 'unknown';
  }
}
