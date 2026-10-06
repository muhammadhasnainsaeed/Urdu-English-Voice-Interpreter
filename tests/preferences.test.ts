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
 * Unit tests for the pure preferences parse/merge model.
 *
 * Run:  npx tsx --test tests/preferences.test.ts
 *
 * No Electron, no filesystem — only the validation rules the IPC layer uses.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_PREFERENCES, mergePreferences, parseStoredPreferences } from '../src/main/preferences/model';

/* ------------------------------------------------------------------ */
/*  parseStoredPreferences                                             */
/* ------------------------------------------------------------------ */

test('parses a complete stored payload', () => {
  const parsed = parseStoredPreferences(
    JSON.stringify({
      onboardingCompleted: true,
      ttsVoiceId: 'en-US-JennyNeural',
      micDeviceId: 'mic-abc',
      outputDeviceId: 'blackhole',
    }),
  );
  assert.deepEqual(parsed, {
    onboardingCompleted: true,
    ttsVoiceId: 'en-US-JennyNeural',
    micDeviceId: 'mic-abc',
    outputDeviceId: 'blackhole',
  });
});

test('legacy store without device ids loads with null device selections', () => {
  const parsed = parseStoredPreferences(
    JSON.stringify({ onboardingCompleted: true, ttsVoiceId: 'en-GB-SoniaNeural' }),
  );
  assert.equal(parsed.onboardingCompleted, true);
  assert.equal(parsed.ttsVoiceId, 'en-GB-SoniaNeural');
  assert.equal(parsed.micDeviceId, null);
  assert.equal(parsed.outputDeviceId, null);
});

test('legacy store without ttsVoiceId still loads', () => {
  const parsed = parseStoredPreferences(JSON.stringify({ onboardingCompleted: false }));
  assert.deepEqual(parsed, DEFAULT_PREFERENCES);
});

test('corrupt JSON degrades to defaults instead of throwing', () => {
  assert.deepEqual(parseStoredPreferences('{not json'), DEFAULT_PREFERENCES);
  assert.deepEqual(parseStoredPreferences(''), DEFAULT_PREFERENCES);
});

test('non-object payloads degrade to defaults', () => {
  assert.deepEqual(parseStoredPreferences('42'), DEFAULT_PREFERENCES);
  assert.deepEqual(parseStoredPreferences('null'), DEFAULT_PREFERENCES);
  assert.deepEqual(parseStoredPreferences('"string"'), DEFAULT_PREFERENCES);
  assert.deepEqual(parseStoredPreferences('[1,2,3]'), DEFAULT_PREFERENCES);
});

test('onboardingCompleted only accepts an explicit boolean true', () => {
  assert.equal(parseStoredPreferences('{"onboardingCompleted":true}').onboardingCompleted, true);
  assert.equal(parseStoredPreferences('{"onboardingCompleted":"yes"}').onboardingCompleted, false);
  assert.equal(parseStoredPreferences('{"onboardingCompleted":1}').onboardingCompleted, false);
});

test('invalid id types and blank strings normalize to null', () => {
  const parsed = parseStoredPreferences(
    JSON.stringify({
      ttsVoiceId: '   ',
      micDeviceId: 42,
      outputDeviceId: '',
    }),
  );
  assert.equal(parsed.ttsVoiceId, null);
  assert.equal(parsed.micDeviceId, null);
  assert.equal(parsed.outputDeviceId, null);
});

test('ids are trimmed on parse', () => {
  const parsed = parseStoredPreferences(
    JSON.stringify({ micDeviceId: '  mic-1  ', outputDeviceId: '\tout-1\n' }),
  );
  assert.equal(parsed.micDeviceId, 'mic-1');
  assert.equal(parsed.outputDeviceId, 'out-1');
});

/* ------------------------------------------------------------------ */
/*  mergePreferences                                                   */
/* ------------------------------------------------------------------ */

test('applies a valid partial patch while preserving other fields', () => {
  const current = {
    onboardingCompleted: true,
    ttsVoiceId: 'en-US-JennyNeural',
    micDeviceId: 'mic-1',
    outputDeviceId: 'default',
  };
  const next = mergePreferences(current, { micDeviceId: 'mic-2' });
  assert.deepEqual(next, {
    onboardingCompleted: true,
    ttsVoiceId: 'en-US-JennyNeural',
    micDeviceId: 'mic-2',
    outputDeviceId: 'default',
  });
  // Input is not mutated.
  assert.equal(current.micDeviceId, 'mic-1');
});

test('patch accepts null to clear a stored device selection', () => {
  const current = { ...DEFAULT_PREFERENCES, micDeviceId: 'mic-1', outputDeviceId: 'out-1' };
  const next = mergePreferences(current, { micDeviceId: null, outputDeviceId: null });
  assert.equal(next.micDeviceId, null);
  assert.equal(next.outputDeviceId, null);
});

test('onboardingCompleted ignores non-boolean values', () => {
  const current = { ...DEFAULT_PREFERENCES, onboardingCompleted: true };
  const next = mergePreferences(current, {
    onboardingCompleted: 'false' as unknown as boolean,
  });
  assert.equal(next.onboardingCompleted, true);
});

test('unknown fields in the patch are ignored', () => {
  const current = { ...DEFAULT_PREFERENCES };
  const next = mergePreferences(current, {
    evilField: 'x',
    __proto__: { polluted: true },
  } as unknown as Partial<typeof current>);
  assert.deepEqual(next, DEFAULT_PREFERENCES);
  assert.equal((next as Record<string, unknown>).evilField, undefined);
});

test('blank device id patch clears the selection', () => {
  const current = { ...DEFAULT_PREFERENCES, outputDeviceId: 'blackhole' };
  const next = mergePreferences(current, { outputDeviceId: '   ' });
  assert.equal(next.outputDeviceId, null);
});

test('non-string device id patch clears rather than corrupts', () => {
  const current = { ...DEFAULT_PREFERENCES, micDeviceId: 'mic-1' };
  const next = mergePreferences(current, {
    micDeviceId: 123 as unknown as string,
  });
  assert.equal(next.micDeviceId, null);
});

test('ttsVoiceId patch behaves like device ids', () => {
  const current = { ...DEFAULT_PREFERENCES, ttsVoiceId: 'en-US-JennyNeural' };
  assert.equal(mergePreferences(current, { ttsVoiceId: null }).ttsVoiceId, null);
  assert.equal(mergePreferences(current, { ttsVoiceId: ' en-US-GuyNeural ' }).ttsVoiceId, 'en-US-GuyNeural');
  assert.equal(mergePreferences(current, {}).ttsVoiceId, 'en-US-JennyNeural');
});
