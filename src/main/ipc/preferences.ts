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

import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { AppPreferences, GetPreferencesResult, SetPreferencesResult } from '@shared/index';

/** Defaults used when no persisted preferences file exists yet. */
const DEFAULT_PREFERENCES: AppPreferences = {
  onboardingCompleted: false,
};

/**
 * Writes and reads a tiny JSON "preferences" store under the user-data
 * directory so first-launch onboarding survives relaunches. Kept dependency
 * free and deliberately small — it is not the app's config store.
 */
function preferencesFile(): string {
  return path.join(app.getPath('userData'), 'preferences.json');
}

function loadPreferences(): AppPreferences {
  try {
    const raw = fs.readFileSync(preferencesFile(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      onboardingCompleted:
        typeof parsed.onboardingCompleted === 'boolean' ? parsed.onboardingCompleted : false,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

function persistPreferences(preferences: AppPreferences): void {
  try {
    fs.mkdirSync(path.dirname(preferencesFile()), { recursive: true });
    fs.writeFileSync(preferencesFile(), JSON.stringify(preferences, null, 2), 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Avoid crashing the app if the store cannot be written. Errors are
    // surfaced to the renderer as a result.
    throw new Error(`Could not save preferences: ${msg}`);
  }
}

export function registerPreferencesIpc() {
  ipcMain.handle('preferences:get', (): GetPreferencesResult => {
    try {
      return { ok: true, preferences: loadPreferences() };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: msg };
    }
  });

  ipcMain.handle('preferences:set', (_event, patch: unknown): SetPreferencesResult => {
    if (typeof patch !== 'object' || patch === null) {
      return { ok: false, message: 'Invalid preferences payload.' };
    }
    const incoming = patch as Partial<AppPreferences>;
    try {
      const next = loadPreferences();
      if (typeof incoming.onboardingCompleted === 'boolean') {
        next.onboardingCompleted = incoming.onboardingCompleted;
      }
      persistPreferences(next);
      return { ok: true, preferences: next };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: msg };
    }
  });
}
