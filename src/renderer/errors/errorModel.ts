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

export type ErrorCategory =
  | 'device'
  | 'permission'
  | 'stt'
  | 'translation'
  | 'tts'
  | 'audio-output'
  | 'session'
  | 'ipc'
  | 'config'
  | 'runtime';

export type ErrorSeverity = 'info' | 'warning' | 'error';

export interface AppError {
  /** Stable, human-readable category code used in Diagnostics. */
  code: string;
  /** Error source category. */
  category: ErrorCategory;
  /** User-safe message shown in toasts (no stack/provider/raw codes). */
  message: string;
  /** Technical/debug detail preserved for Diagnostics/logging. */
  detail: string | null;
  /** User-facing severity drives the toast variant. */
  severity: ErrorSeverity;
  /** Epoch ms when the error was normalized. */
  timestamp: number;
}

export interface ClassifyOptions {
  /** Curated, user-safe message. When omitted the category default is used. */
  message?: string;
  /** Technical/debug detail kept for Diagnostics (defaults to the raw input). */
  detail?: string | null;
  /** Override the severity instead of the category default. */
  severity?: ErrorSeverity;
}

interface CategoryInfo {
  code: string;
  message: string;
  severity: ErrorSeverity;
}

const CATEGORY_INFO: Record<ErrorCategory, CategoryInfo> = {
  device: {
    code: 'device/unavailable',
    message: 'A microphone or audio device is unavailable.',
    severity: 'error',
  },
  permission: {
    code: 'permission/microphone',
    message: 'Microphone access is needed. Enable it in Settings.',
    severity: 'warning',
  },
  stt: {
    code: 'stt/failed',
    message: 'Speech recognition failed. Please try again.',
    severity: 'error',
  },
  translation: {
    code: 'translation/unavailable',
    message: 'Translation is temporarily unavailable. Please try again.',
    severity: 'error',
  },
  tts: {
    code: 'tts/failed',
    message: 'Speech playback failed. Please try again.',
    severity: 'error',
  },
  'audio-output': {
    code: 'audio-output/failed',
    message: 'Audio output failed. Check your output device in Settings.',
    severity: 'error',
  },
  session: {
    code: 'session/failed',
    message: 'Could not start the meeting. Please try again.',
    severity: 'error',
  },
  ipc: {
    code: 'ipc/failed',
    message: 'Something went wrong in the app. Please try again.',
    severity: 'error',
  },
  config: {
    code: 'config/failed',
    message: 'Your configuration is incomplete.',
    severity: 'warning',
  },
  runtime: {
    code: 'runtime/error',
    message: 'Something unexpected happened. Please try again.',
    severity: 'error',
  },
};

/**
 * Normalize an arbitrary error into a stable, user-safe AppError. The raw
 * technical input is preserved on `detail` for Diagnostics/logging, but the
 * user-facing `message` is always the curated, non-technical category copy
 * (use `options.message` to provide a specific user-safe alternative). This
 * guarantees stack traces, provider names, and raw error codes never reach a
 * normal user.
 */
export function classifyInputError(
  category: ErrorCategory,
  raw: string | null | undefined,
  options: ClassifyOptions = {},
): AppError {
  const info = CATEGORY_INFO[category];
  const cleaned = raw?.trim();
  return {
    code: info.code,
    category,
    message: options.message ?? info.message,
    detail: options.detail === undefined ? cleaned || null : options.detail,
    severity: options.severity ?? info.severity,
    timestamp: Date.now(),
  };
}

export const ERROR_CATEGORIES: readonly ErrorCategory[] = Object.keys(
  CATEGORY_INFO,
) as unknown as ErrorCategory[];
