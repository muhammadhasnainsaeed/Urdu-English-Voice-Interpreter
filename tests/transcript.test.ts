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
 * Unit tests for the pure transcript model (pairing rules + TXT/JSON export).
 *
 * Run:  npx tsx --test tests/transcript.test.ts
 *
 * No React, no Electron, no network.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  appendSttFinal,
  applyTranslation,
  clearTranscript,
  createTranscript,
  entryEnglish,
  hasContent,
  suggestedTranscriptFileName,
  toJson,
  toJsonDocument,
  toTxt,
  type TranscriptState,
} from '../src/renderer/transcript/transcriptModel';
import {
  MAX_TRANSCRIPT_BYTES,
  sanitizeFileName,
  validateSaveRequest,
} from '../src/main/transcript/saveRequest';

/** Build a state from [urdu, english] pairs (english null = pending). */
function stateOf(pairs: Array<[string, string | null]>): TranscriptState {
  let state = createTranscript();
  for (const [urdu, english] of pairs) {
    state = appendSttFinal(state, urdu, 1_700_000_000_000);
    if (english !== null) {
      state = applyTranslation(state, { english, atMs: 1_700_000_001_000 });
    }
  }
  return state;
}

/* ------------------------------------------------------------------ */
/*  appendSttFinal                                                     */
/* ------------------------------------------------------------------ */

test('appends a new entry per Urdu final with stable ids', () => {
  let state = createTranscript();
  state = appendSttFinal(state, 'کیسے ہیں آپ', 1000);
  state = appendSttFinal(state, 'ٹھیک ہوں', 2000);
  assert.equal(state.entries.length, 2);
  assert.deepEqual(
    state.entries.map((e) => [e.id, e.urdu, e.english, e.interimEnglish]),
    [
      [1, 'کیسے ہیں آپ', null, null],
      [2, 'ٹھیک ہوں', null, null],
    ],
  );
  assert.equal(state.entries[0].atMs, 1000);
});

test('trims Urdu text and ignores empty finals', () => {
  let state = createTranscript();
  state = appendSttFinal(state, '   آواز سنائی دے رہی ہے   ', 1000);
  state = appendSttFinal(state, '    ', 2000);
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].urdu, 'آواز سنائی دے رہی ہے');
});

test('fills an English-only placeholder instead of pushing a duplicate', () => {
  let state = createTranscript();
  // Interim translation arrives before the STT final → placeholder.
  state = applyTranslation(state, { english: 'How are you', interim: true, atMs: 500 });
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].urdu, '');

  state = appendSttFinal(state, 'کیسے ہیں آپ', 1000);
  assert.equal(state.entries.length, 1, 'placeholder must be merged, not duplicated');
  assert.equal(state.entries[0].urdu, 'کیسے ہیں آپ');
  assert.equal(state.entries[0].interimEnglish, 'How are you');
  assert.equal(state.entries[0].english, null);
});

test('does not merge into a placeholder that already has its final English', () => {
  const state = stateOf([['کیسے ہیں آپ', 'How are you']]);
  const next = appendSttFinal(state, 'ٹھیک ہوں', 3000);
  assert.equal(next.entries.length, 2);
  assert.equal(next.entries[1].urdu, 'ٹھیک ہوں');
});

/* ------------------------------------------------------------------ */
/*  applyTranslation                                                   */
/* ------------------------------------------------------------------ */

test('final translation fills the first entry awaiting English', () => {
  let state = stateOf([['ایک', 'one']]);
  state = appendSttFinal(state, 'دو', 3000);
  state = applyTranslation(state, { english: 'two', atMs: 4000 });
  assert.equal(state.entries.length, 2);
  assert.equal(state.entries[1].english, 'two');
  assert.equal(state.entries[0].english, 'one');
});

test('interim claims the first unclaimed entry; its final replaces it', () => {
  let state = createTranscript();
  state = appendSttFinal(state, 'کیسے ہیں آپ', 1000);
  state = applyTranslation(state, { english: 'How are', interim: true, atMs: 1500 });
  assert.equal(state.entries[0].interimEnglish, 'How are');
  assert.equal(state.entries[0].english, null);

  state = applyTranslation(state, { english: 'How are you?', atMs: 2000 });
  assert.equal(state.entries[0].english, 'How are you?');
  assert.equal(state.entries[0].interimEnglish, null, 'final clears the interim');
});

test('interim with no pending entry creates an English-only placeholder', () => {
  let state = createTranscript();
  state = applyTranslation(state, { english: 'Hello', interim: true, atMs: 100 });
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].urdu, '');
  assert.equal(state.entries[0].interimEnglish, 'Hello');
  assert.equal(hasContent(state), true);
});

test('final translation with no pending entry appends an English-only entry', () => {
  let state = createTranscript();
  state = applyTranslation(state, { english: 'Orphan', atMs: 100 });
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].urdu, '');
  assert.equal(state.entries[0].english, 'Orphan');
});

test('interleaved interim/final flow pairs each utterance correctly', () => {
  let state = createTranscript();
  // U1 interim translation before U1 final lands.
  state = applyTranslation(state, { english: 'How are', interim: true, atMs: 100 });
  // U1 STT final merges into the placeholder.
  state = appendSttFinal(state, 'کیسے ہیں آپ', 200);
  // U2 STT final pushes a second entry.
  state = appendSttFinal(state, 'میں ٹھیک ہوں', 300);
  // U1 final translation fills the FIRST pending entry (U1).
  state = applyTranslation(state, { english: 'How are you?', atMs: 400 });
  // U2 final translation fills U2.
  state = applyTranslation(state, { english: "I'm fine", atMs: 500 });

  assert.equal(state.entries.length, 2);
  assert.equal(state.entries[0].urdu, 'کیسے ہیں آپ');
  assert.equal(state.entries[0].english, 'How are you?');
  assert.equal(state.entries[1].urdu, 'میں ٹھیک ہوں');
  assert.equal(state.entries[1].english, "I'm fine");
});

test('empty or whitespace translation text is ignored', () => {
  const state = stateOf([['ہیلو', null]]);
  const next = applyTranslation(state, { english: '   ', atMs: 10 });
  assert.equal(next, state);
});

test('entryEnglish prefers the final over the interim', () => {
  const state = stateOf([['ہیلو', 'Hello']]);
  assert.equal(entryEnglish(state.entries[0]), 'Hello');
  const pending = appendSttFinal(createTranscript(), 'ہیلو', 1);
  const withInterim = applyTranslation(pending, { english: 'Hell', interim: true, atMs: 2 });
  assert.equal(entryEnglish(withInterim.entries[0]), 'Hell');
});

/* ------------------------------------------------------------------ */
/*  clear / hasContent                                                 */
/* ------------------------------------------------------------------ */

test('clearTranscript resets to an empty state with fresh ids', () => {
  const state = stateOf([['ہیلو', 'Hello']]);
  const cleared = clearTranscript();
  assert.equal(cleared.entries.length, 0);
  assert.equal(hasContent(state), true);
  assert.equal(hasContent(cleared), false);
  // Ids restart from 1 after a clear.
  const next = appendSttFinal(cleared, 'پھر سے', 10);
  assert.equal(next.entries[0].id, 1);
});

/* ------------------------------------------------------------------ */
/*  Export serializers                                                 */
/* ------------------------------------------------------------------ */

test('toTxt emits a timestamped Urdu/English line pair per entry', () => {
  const state = stateOf([['کیسے ہیں آپ', 'How are you?']]);
  const txt = toTxt(state);
  const lines = txt.split('\n').filter((l) => l !== '');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^\[\d{2}:\d{2}:\d{2}\] Urdu: کیسے ہیں آپ$/);
  assert.match(lines[1], /^\[\d{2}:\d{2}:\d{2}\] English: How are you\?$/);
  assert.ok(txt.endsWith('\n'));
});

test('toTxt skips entries with no content and falls back to interim English', () => {
  const state = stateOf([['ہیلو', null]]);
  const withInterim = applyTranslation(state, { english: 'Hell', interim: true, atMs: 5 });
  const txt = toTxt(withInterim);
  assert.ok(txt.includes('English: Hell'));

  const empty = toTxt(createTranscript());
  assert.equal(empty, '');
});

test('toJsonDocument produces a parseable, versioned document', () => {
  const state = stateOf([['کیسے ہیں آپ', 'How are you?']]);
  const exportedAt = new Date('2026-10-05T12:00:00.000Z');
  const doc = toJsonDocument(state, exportedAt);

  assert.equal(doc.schema, 'urdu-english-transcript');
  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.exportedAt, '2026-10-05T12:00:00.000Z');
  assert.equal(doc.entryCount, 1);
  assert.equal(doc.entries[0].urdu, 'کیسے ہیں آپ');
  assert.equal(doc.entries[0].english, 'How are you?');
  assert.equal(doc.entries[0].interimEnglish, null);

  const roundTripped = JSON.parse(toJson(state, exportedAt));
  assert.deepEqual(roundTripped, doc);
});

test('toJson on an empty transcript is valid JSON with zero entries', () => {
  const doc = JSON.parse(toJson(createTranscript(), new Date('2026-10-05T00:00:00.000Z')));
  assert.equal(doc.entryCount, 0);
  assert.deepEqual(doc.entries, []);
});

/* ------------------------------------------------------------------ */
/*  File naming                                                        */
/* ------------------------------------------------------------------ */

test('suggestedTranscriptFileName uses a sortable timestamp and the format', () => {
  const when = new Date(2026, 9, 5, 14, 30, 59); // 2026-10-05 14:30:59 local
  assert.equal(suggestedTranscriptFileName('txt', when), 'urdu-english-transcript-2026-10-05-143059.txt');
  assert.equal(suggestedTranscriptFileName('json', when), 'urdu-english-transcript-2026-10-05-143059.json');
});

/* ------------------------------------------------------------------ */
/*  Main-process save request validation (src/main/transcript)         */
/* ------------------------------------------------------------------ */

test('validateSaveRequest accepts a well-formed txt request', () => {
  const result = validateSaveRequest({
    format: 'txt',
    content: 'line\n',
    suggestedName: 'notes.txt',
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.request.format, 'txt');
    assert.equal(result.request.content, 'line\n');
    assert.equal(result.request.fileName, 'notes.txt');
  }
});

test('validateSaveRequest rejects malformed payloads', () => {
  assert.equal(validateSaveRequest(null).ok, false);
  assert.equal(validateSaveRequest('text').ok, false);
  assert.equal(validateSaveRequest([]).ok, false);
  assert.equal(validateSaveRequest({ format: 'pdf', content: 'x' }).ok, false);
  assert.equal(validateSaveRequest({ format: 'txt', content: 42 }).ok, false);
  assert.equal(validateSaveRequest({ format: 'txt' }).ok, false);
});

test('validateSaveRequest rejects content over the size cap', () => {
  const huge = 'a'.repeat(MAX_TRANSCRIPT_BYTES + 1);
  const result = validateSaveRequest({ format: 'txt', content: huge, suggestedName: 'x.txt' });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.message.includes('too large'));
});

test('sanitizeFileName strips directories and control characters', () => {
  assert.equal(sanitizeFileName('/etc/passwd', 'txt'), 'passwd.txt');
  assert.equal(sanitizeFileName('..\\..\\evil.txt', 'txt'), 'evil.txt');
  assert.equal(sanitizeFileName('bad\u0000name.txt', 'txt'), 'badname.txt');
  assert.equal(sanitizeFileName('.hidden', 'json'), 'hidden.json');
  assert.equal(sanitizeFileName('', 'txt'), 'urdu-english-transcript.txt');
  assert.equal(sanitizeFileName(undefined, 'json'), 'urdu-english-transcript.json');
  assert.equal(sanitizeFileName(123 as unknown as string, 'txt'), 'urdu-english-transcript.txt');
});

test('sanitizeFileName enforces the requested extension', () => {
  assert.equal(sanitizeFileName('report', 'json'), 'report.json');
  assert.equal(sanitizeFileName('report.TXT', 'txt'), 'report.TXT');
  assert.equal(sanitizeFileName('report.txt', 'json'), 'report.txt.json');
});
