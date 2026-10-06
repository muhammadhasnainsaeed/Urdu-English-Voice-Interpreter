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

import type { TranscriptFormat } from '@shared/index';

/**
 * Pure validation/sanitization for the transcript save IPC.
 *
 * The renderer is untrusted: it may send any payload, so the main process
 * validates shape, size, and filename before anything touches the dialog or
 * the filesystem. Kept electron-free so the rules are unit-testable.
 */

/** Upper bound for one export (UTF-8 bytes). */
export const MAX_TRANSCRIPT_BYTES = 5 * 1024 * 1024;

export interface ValidatedSaveRequest {
  format: TranscriptFormat;
  content: string;
  /** Safe basename (no directories, correct extension) for the dialog. */
  fileName: string;
}

export type ValidationResult = { ok: true; request: ValidatedSaveRequest } | { ok: false; message: string };

/**
 * Reduce a suggested name to a safe basename with the correct extension:
 * strips directories, control characters, and leading dots; falls back to a
 * default name; appends the format extension when missing.
 */
export function sanitizeFileName(suggested: unknown, format: TranscriptFormat): string {
  const ext = `.${format}`;
  let name = '';

  if (typeof suggested === 'string') {
    // Split on both separators regardless of platform — renderer input is
    // never trusted to use the host separator.
    const parts = suggested.split(/[\\/]/);
    name = parts[parts.length - 1] ?? '';
  }

  // Control chars (including NUL) and leading dots (hidden files).
  // Filtered by code point instead of a regex — control characters are
  // easier to audit (and lint) this way.
  let cleaned = '';
  for (const ch of name) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code !== 0x7f) cleaned += ch;
  }
  name = cleaned.replace(/^\.+/, '').trim();

  if (name === '') {
    name = `urdu-english-transcript${ext}`;
  } else if (!name.toLowerCase().endsWith(ext)) {
    name = `${name}${ext}`;
  }
  return name;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function validateSaveRequest(payload: unknown): ValidationResult {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { ok: false, message: 'Invalid transcript payload.' };
  }
  const record = payload as Record<string, unknown>;

  const format = record.format;
  if (format !== 'txt' && format !== 'json') {
    return { ok: false, message: 'Unsupported transcript format.' };
  }
  if (typeof record.content !== 'string') {
    return { ok: false, message: 'Transcript content must be a string.' };
  }
  const bytes = byteLength(record.content);
  if (bytes > MAX_TRANSCRIPT_BYTES) {
    return {
      ok: false,
      message: `Transcript is too large to export (${bytes} bytes, limit ${MAX_TRANSCRIPT_BYTES}).`,
    };
  }

  return {
    ok: true,
    request: {
      format,
      content: record.content,
      fileName: sanitizeFileName(record.suggestedName, format),
    },
  };
}
