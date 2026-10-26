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
 * Pure transcript model: two independent translation histories with TXT/JSON export.
 *
 * Deliberately free of React, Electron, and the DOM so every pairing rule and
 * serializer is unit-testable. The `useTranscript` hook is a thin subscriber
 * over these functions.
 *
 * Pairing rules (the main-process translation queue serializes requests, so
 * finals arrive in order):
 *  - An STT final pushes an entry — unless the newest entry is still an
 *    English-only placeholder (created by an interim translation that raced
 *    its final), in which case the Urdu fills that placeholder.
 *  - A final translation fills the FIRST entry whose `english` is null
 *    (its own utterance, possibly carrying an interim).
 *  - An interim translation claims the FIRST entry with both `english` and
 *    `interimEnglish` null; if nothing is claimable (interim before any
 *    final), it creates an English-only placeholder.
 */

import type { TranscriptFormat } from '@shared/index';
import { getLanguage } from '@shared/languages';

export type { TranscriptFormat };

export type TranscriptDirection = 'outgoing' | 'incoming';

export interface TranscriptMetadata {
  direction?: TranscriptDirection;
  sourceLanguage?: string;
  targetLanguage?: string;
}

export interface TranscriptEntry {
  /** Monotonic id, stable across a session (never reused after clear). */
  id: number;
  /** Epoch ms anchoring the utterance (STT final, or interim claim time). */
  atMs: number;
  /** Original speech. Legacy field name retained for existing JSON consumers. */
  urdu: string;
  /** Final translation. Legacy field name retained for existing JSON consumers. */
  english: string | null;
  /** Provisional English awaiting its final; overwritten by the final. */
  interimEnglish: string | null;
  direction: TranscriptDirection;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface TranscriptState {
  entries: TranscriptEntry[];
  nextId: number;
}

export function createTranscript(): TranscriptState {
  return { entries: [], nextId: 1 };
}

export function hasContent(state: TranscriptState): boolean {
  return state.entries.some((e) => e.urdu !== '' || e.english !== null || e.interimEnglish !== null);
}

function metadataWithDefaults(metadata: TranscriptMetadata): Required<TranscriptMetadata> {
  const direction = metadata.direction ?? 'outgoing';
  return {
    direction,
    sourceLanguage: metadata.sourceLanguage ?? (direction === 'incoming' ? 'en' : 'ur'),
    targetLanguage: metadata.targetLanguage ?? (direction === 'incoming' ? 'ur' : 'en'),
  };
}

/** Append speech; merges only with a pending placeholder in the same direction. */
export function appendSttFinal(
  state: TranscriptState,
  text: string,
  atMs: number,
  metadata: TranscriptMetadata = {},
): TranscriptState {
  const urdu = text.trim();
  if (urdu === '') return state;

  const entries = state.entries.slice();
  const resolved = metadataWithDefaults(metadata);
  let lastIndex = entries.length - 1;
  while (lastIndex >= 0 && entries[lastIndex].direction !== resolved.direction) lastIndex -= 1;
  const last = entries[lastIndex];
  if (last && last.urdu === '' && last.english === null) {
    // A placeholder can already know its language from an interim result.
    entries[lastIndex] = { ...last, urdu };
    return { entries, nextId: state.nextId };
  }

  entries.push({
    id: state.nextId,
    atMs,
    urdu,
    english: null,
    interimEnglish: null,
    ...resolved,
  });
  return { entries, nextId: state.nextId + 1 };
}

/** Apply a translation result (final or interim) using the pairing rules. */
export function applyTranslation(
  state: TranscriptState,
  update: TranscriptMetadata & { english: string; sourceText?: string; interim?: boolean; atMs?: number },
): TranscriptState {
  const english = update.english.trim();
  if (english === '') return state;
  const atMs = update.atMs ?? Date.now();

  const entries = state.entries.slice();
  const metadata = metadataWithDefaults(update);
  const sourceText = update.sourceText?.trim();
  const matchesDirection = (entry: TranscriptEntry) => entry.direction === metadata.direction;
  const mergeMetadata = (entry: TranscriptEntry): TranscriptEntry => ({
    ...entry,
    direction: metadata.direction,
    sourceLanguage: update.sourceLanguage ?? entry.sourceLanguage,
    targetLanguage: update.targetLanguage ?? entry.targetLanguage,
  });
  const pendingIndex = (interim: boolean): number => {
    const claimable = (entry: TranscriptEntry) =>
      matchesDirection(entry) && entry.english === null && (!interim || entry.interimEnglish === null);
    if (!sourceText) return entries.findIndex(claimable);
    const exact = entries.findIndex((entry) => claimable(entry) && entry.urdu === sourceText);
    if (exact >= 0) return exact;
    // Never consume another utterance after an earlier translation failed.
    return entries.findIndex((entry) => claimable(entry) && entry.urdu === '');
  };

  if (update.interim === true) {
    const target = pendingIndex(true);
    if (target >= 0) {
      entries[target] = { ...mergeMetadata(entries[target]), interimEnglish: english };
    } else {
      entries.push({
        id: state.nextId,
        atMs,
        urdu: '',
        english: null,
        interimEnglish: english,
        ...metadata,
      });
      return { entries, nextId: state.nextId + 1 };
    }
    return { entries, nextId: state.nextId };
  }

  const target = pendingIndex(false);
  if (target >= 0) {
    entries[target] = {
      ...mergeMetadata(entries[target]),
      urdu: entries[target].urdu || sourceText || '',
      english,
      interimEnglish: null,
    };
    return { entries, nextId: state.nextId };
  }

  entries.push({
    id: state.nextId,
    atMs,
    urdu: sourceText ?? '',
    english,
    interimEnglish: null,
    ...metadata,
  });
  return { entries, nextId: state.nextId + 1 };
}

export function clearTranscript(): TranscriptState {
  return createTranscript();
}

/** Best available English for display/export (final beats interim). */
export function entryEnglish(entry: TranscriptEntry): string | null {
  return entry.english ?? entry.interimEnglish;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function formatClock(atMs: number): string {
  const d = new Date(atMs);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** `urdu-english-transcript-2026-10-05-143059.txt` (local time). */
export function suggestedTranscriptFileName(format: TranscriptFormat, now: Date): string {
  const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  return `urdu-english-transcript-${date}-${time}.${format}`;
}

/** Paired transcript as plain text: one timestamped line pair per entry. */
export function toTxt(state: TranscriptState): string {
  const lines: string[] = [];
  for (const entry of state.entries) {
    const english = entryEnglish(entry);
    if (entry.urdu === '' && english === null) continue;
    const stamp = `[${formatClock(entry.atMs)}]`;
    const source = getLanguage(entry.sourceLanguage)?.name ?? entry.sourceLanguage;
    const target = getLanguage(entry.targetLanguage)?.name ?? entry.targetLanguage;
    const speaker = entry.direction === 'incoming' ? 'Client · ' : '';
    if (entry.urdu !== '') lines.push(`${stamp} ${speaker}${source}: ${entry.urdu}`);
    if (english !== null) lines.push(`${stamp} ${speaker}${target}: ${english}`);
  }
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

export interface TranscriptJsonDocument {
  schema: 'urdu-english-transcript';
  schemaVersion: 1;
  exportedAt: string;
  entryCount: number;
  entries: Array<{
    id: number;
    at: string;
    urdu: string;
    english: string | null;
    interimEnglish: string | null;
    direction: TranscriptDirection;
    sourceLanguage: string;
    targetLanguage: string;
  }>;
}

/** Structured transcript document (schemaVersion bumps on breaking changes). */
export function toJsonDocument(state: TranscriptState, exportedAt: Date): TranscriptJsonDocument {
  return {
    schema: 'urdu-english-transcript',
    schemaVersion: 1,
    exportedAt: exportedAt.toISOString(),
    entryCount: state.entries.length,
    entries: state.entries.map((entry) => ({
      id: entry.id,
      at: new Date(entry.atMs).toISOString(),
      urdu: entry.urdu,
      english: entry.english,
      interimEnglish: entry.interimEnglish,
      direction: entry.direction,
      sourceLanguage: entry.sourceLanguage,
      targetLanguage: entry.targetLanguage,
    })),
  };
}

export function toJson(state: TranscriptState, exportedAt: Date): string {
  return `${JSON.stringify(toJsonDocument(state, exportedAt), null, 2)}\n`;
}
