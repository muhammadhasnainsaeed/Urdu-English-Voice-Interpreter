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
 * Unit tests for the runtime config helpers (STT provider resolution).
 *
 * Run:  npx tsx --test tests/config.test.ts
 */

import assert from 'node:assert/strict';
import { sep } from 'node:path';
import { test } from 'node:test';
import {
  USER_CONFIG_DIR,
  USER_CONFIG_FILE,
  describeSttConfig,
  getUserConfigDir,
  getUserConfigPath,
  sttProviderName,
} from '../src/main/config';

test('defaults to azure when STT_PROVIDER is unset', () => {
  delete process.env.STT_PROVIDER;
  delete process.env.AZURE_SPEECH_KEY;
  delete process.env.AZURE_SPEECH_REGION;
  assert.equal(sttProviderName(), 'azure');
  const status = describeSttConfig();
  assert.equal(status.ok, false);
  assert.equal(status.provider, 'azure');
  assert.ok(status.message.includes(getUserConfigPath()));
});

test('treats empty or whitespace STT_PROVIDER as azure default', () => {
  process.env.STT_PROVIDER = '   ';
  assert.equal(sttProviderName(), 'azure');
});

test('azure is usable when key and region are present', () => {
  process.env.STT_PROVIDER = 'azure';
  process.env.AZURE_SPEECH_KEY = 'key';
  process.env.AZURE_SPEECH_REGION = 'eastus';
  const status = describeSttConfig();
  assert.deepEqual(status, { ok: true, provider: 'azure' });
});

test('azure with only a key is not configured', () => {
  process.env.STT_PROVIDER = 'azure';
  process.env.AZURE_SPEECH_KEY = 'key';
  delete process.env.AZURE_SPEECH_REGION;
  const status = describeSttConfig();
  assert.equal(status.ok, false);
  assert.ok(status.message.includes('AZURE_SPEECH_REGION'));
});

test('azure with only a region is not configured', () => {
  process.env.STT_PROVIDER = 'azure';
  delete process.env.AZURE_SPEECH_KEY;
  process.env.AZURE_SPEECH_REGION = 'eastus';
  const status = describeSttConfig();
  assert.equal(status.ok, false);
  assert.ok(status.message.includes('AZURE_SPEECH_KEY'));
});

test('mock is always usable', () => {
  process.env.STT_PROVIDER = 'mock';
  delete process.env.AZURE_SPEECH_KEY;
  delete process.env.AZURE_SPEECH_REGION;
  assert.deepEqual(describeSttConfig(), { ok: true, provider: 'mock' });
});

test('whisper is considered configured (assets checked at start)', () => {
  process.env.STT_PROVIDER = 'whisper';
  assert.deepEqual(describeSttConfig(), { ok: true, provider: 'whisper' });
});

test('provider name is normalized (trim + lowercase)', () => {
  process.env.STT_PROVIDER = '  MOCK  ';
  assert.equal(sttProviderName(), 'mock');
});

test('unknown provider produces an actionable message', () => {
  process.env.STT_PROVIDER = 'bogus';
  const status = describeSttConfig();
  assert.equal(status.ok, false);
  assert.equal(status.provider, 'bogus');
  assert.ok(status.message.includes('bogus'));
  assert.ok(status.message.includes('azure'));
  assert.ok(status.message.includes('whisper'));
  assert.ok(status.message.includes('mock'));
});

test('runtime config path helpers point into the user home', () => {
  assert.ok(getUserConfigDir().endsWith(`${sep}${USER_CONFIG_DIR}`));
  assert.equal(getUserConfigPath(), `${getUserConfigDir()}${sep}${USER_CONFIG_FILE}`);
});
