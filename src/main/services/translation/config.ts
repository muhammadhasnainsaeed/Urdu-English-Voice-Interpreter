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

/**
 * Shared configuration parsing for translation reliability features.
 *
 * Kept in its own module so both the provider implementations and the
 * TranslationManager can use it without circular imports.
 */

/**
 * Parse a non-negative integer millisecond window from an env var.
 * Absent/empty → fallback. Non-numeric or negative → warn + fallback.
 * 0 is valid and disables the window (matches TTS_DEDUPE_WINDOW_MS convention).
 */
export function parseWindowMs(
  raw: string | undefined,
  envName: string,
  fallback: number
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    console.warn(
      `[CONFIG] ${envName}="${raw}" is not a non-negative integer — using ${fallback}ms`
    );
    return fallback;
  }
  return parseInt(trimmed, 10);
}
