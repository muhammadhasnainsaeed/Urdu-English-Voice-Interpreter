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

import type { AppPreferences } from '@shared/index';

/**
 * Pure preferences parsing/merging helpers.
 *
 * Kept free of `electron` and `fs` so the store's validation rules are unit
 * -testable without an app instance (mirrors `src/main/config.ts`). The IPC
 * layer owns reading/writing the file; this module owns what a valid stored
 * preference or patch looks like.
 */

export const DEFAULT_PREFERENCES: AppPreferences = {
  onboardingCompleted: false,
  ttsVoiceId: null,
  micDeviceId: null,
  outputDeviceId: null,
};

/**
 * Normalize a device/voice id candidate: non-empty trimmed strings pass
 * through, everything else (undefined/null/number/blank) becomes null.
 */
function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Parse a raw stored JSON payload into a complete, validated preferences
 * object. Never throws — malformed input degrades to the defaults so a
 * corrupt store cannot break startup.
 */
export function parseStoredPreferences(raw: string): AppPreferences {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ...DEFAULT_PREFERENCES };
  }
  const record = parsed as Record<string, unknown>;
  return {
    onboardingCompleted: record.onboardingCompleted === true,
    ttsVoiceId: normalizeId(record.ttsVoiceId),
    micDeviceId: normalizeId(record.micDeviceId),
    outputDeviceId: normalizeId(record.outputDeviceId),
  };
}

/**
 * Apply a partial patch to the current preferences. Only recognized fields
 * with valid types are applied — unknown keys and invalid values are ignored
 * so a tampered renderer payload cannot corrupt the store.
 *
 * Device ids and the voice id accept `null` to clear the stored selection.
 */
export function mergePreferences(current: AppPreferences, patch: Partial<AppPreferences>): AppPreferences {
  const next: AppPreferences = { ...current };

  if (typeof patch.onboardingCompleted === 'boolean') {
    next.onboardingCompleted = patch.onboardingCompleted;
  }
  if (patch.ttsVoiceId !== undefined) {
    next.ttsVoiceId = normalizeId(patch.ttsVoiceId);
  }
  if (patch.micDeviceId !== undefined) {
    next.micDeviceId = normalizeId(patch.micDeviceId);
  }
  if (patch.outputDeviceId !== undefined) {
    next.outputDeviceId = normalizeId(patch.outputDeviceId);
  }
  return next;
}
