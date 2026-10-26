/*
 * Urdu English Interpreter
 * Copyright (C) 2026 Muhammad Hasnain Saeed
 * SPDX-License-Identifier: GPL-3.0-only
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CONVERSATION, normalizeConversationSettings } from '../packages/shared/conversation';
import { mergePreferences, parseStoredPreferences } from '../src/main/preferences/model';
import { validateConversationRouting } from '../src/renderer/audio/conversationRouting';

const devices = [
  { deviceId: 'mic', groupId: 'mic', kind: 'audioinput' as const, label: 'USB Microphone' },
  { deviceId: 'in-16', groupId: 'bus-16', kind: 'audioinput' as const, label: 'BlackHole 16ch' },
  { deviceId: 'in-2', groupId: 'bus-2', kind: 'audioinput' as const, label: 'BlackHole 2ch' },
  { deviceId: 'out-16', groupId: 'bus-16', kind: 'audiooutput' as const, label: 'BlackHole 16ch' },
  { deviceId: 'out-2', groupId: 'bus-2', kind: 'audiooutput' as const, label: 'BlackHole 2ch' },
  { deviceId: 'phones', groupId: 'phones', kind: 'audiooutput' as const, label: 'USB Headphones' },
];
const settings = {
  ...DEFAULT_CONVERSATION,
  incomingEnabled: true,
  incomingDeviceId: 'in-16',
  listeningDeviceId: 'phones',
};

test('two-way routing accepts separate buses and physical microphone/headphones', () => {
  assert.equal(validateConversationRouting(settings, devices, 'mic', 'out-2'), null);
});
test('same cable is rejected even though input and output ids differ', () => {
  assert.match(validateConversationRouting(settings, devices, 'mic', 'out-16')!, /different virtual cables/);
  const withoutGroups = devices.map((d) => ({ ...d, groupId: '' }));
  assert.match(
    validateConversationRouting(settings, withoutGroups, 'mic', 'out-16')!,
    /different virtual cables/,
  );
});
test('default, missing, virtual listening and physical client input fail clearly', () => {
  assert.match(validateConversationRouting(settings, devices, 'mic', 'default')!, /System Default/);
  assert.match(
    validateConversationRouting({ ...settings, incomingDeviceId: 'gone' }, devices, 'mic', 'out-2')!,
    /unavailable/,
  );
  assert.match(
    validateConversationRouting({ ...settings, listeningDeviceId: 'out-16' }, devices, 'mic', 'out-2')!,
    /physical headphones/,
  );
  assert.match(
    validateConversationRouting({ ...settings, incomingDeviceId: 'mic' }, devices, 'mic', 'out-2')!,
    /virtual audio cables/,
  );
  assert.match(validateConversationRouting(settings, devices, 'in-2', 'out-2')!, /physical microphone/);
});
test('one-way sessions retain existing routing flexibility', () => {
  assert.equal(validateConversationRouting(DEFAULT_CONVERSATION, [], null, 'default'), null);
});
test('language/device preferences survive round trip and invalid language ids normalize safely', () => {
  const conversation = {
    ...settings,
    sourceLanguage: 'tr',
    targetLanguage: 'ur',
    incomingSourceLanguage: 'en',
    incomingTargetLanguage: 'tr',
  };
  const merged = mergePreferences({ onboardingCompleted: true }, { conversation });
  assert.deepEqual(parseStoredPreferences(JSON.stringify(merged)).conversation, conversation);
  assert.deepEqual(
    normalizeConversationSettings({
      sourceLanguage: 'invented',
      incomingEnabled: 'yes',
      listeningDeviceId: 4,
    }),
    DEFAULT_CONVERSATION,
  );
  assert.deepEqual(normalizeConversationSettings(null), DEFAULT_CONVERSATION);
});
