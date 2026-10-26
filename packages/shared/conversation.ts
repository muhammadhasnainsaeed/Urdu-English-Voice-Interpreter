/*
 * Urdu English Interpreter
 * Copyright (C) 2026 Muhammad Hasnain Saeed
 * SPDX-License-Identifier: GPL-3.0-only
 */
import type { ConversationSettings } from './index';
import { getLanguage } from './languages';

export const DEFAULT_CONVERSATION: ConversationSettings = {
  sourceLanguage: 'ur',
  targetLanguage: 'en',
  incomingEnabled: false,
  incomingSourceLanguage: 'en',
  incomingTargetLanguage: 'ur',
  incomingDeviceId: null,
  listeningDeviceId: null,
};

/** Normalize stored/IPC data without accepting arbitrary provider language ids. */
export function normalizeConversationSettings(value: unknown): ConversationSettings {
  const record =
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const language = (key: keyof ConversationSettings, fallback: string) =>
    getLanguage(typeof record[key] === 'string' ? (record[key] as string) : null)?.code ?? fallback;
  const device = (key: string) =>
    typeof record[key] === 'string' && record[key].trim() ? record[key].trim() : null;
  return {
    sourceLanguage: language('sourceLanguage', 'ur'),
    targetLanguage: language('targetLanguage', 'en'),
    incomingEnabled: record.incomingEnabled === true,
    incomingSourceLanguage: language('incomingSourceLanguage', 'en'),
    incomingTargetLanguage: language('incomingTargetLanguage', 'ur'),
    incomingDeviceId: device('incomingDeviceId'),
    listeningDeviceId: device('listeningDeviceId'),
  };
}
