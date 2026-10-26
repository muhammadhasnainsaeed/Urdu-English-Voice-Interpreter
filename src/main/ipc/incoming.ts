/*
 * Urdu English Interpreter
 * Copyright (C) 2026 Muhammad Hasnain Saeed
 * SPDX-License-Identifier: GPL-3.0-only
 */
import { ipcMain } from 'electron';
import { normalizeConversationSettings } from '@shared/conversation';
import { loadPreferences } from './preferences';
import { incomingManager } from '../services/incoming';
import { getMainWindow, sendToRenderer } from '../windows';

export function registerIncomingIpc(): void {
  const isMain = (senderId: number) => getMainWindow()?.webContents.id === senderId;
  ipcMain.handle('incoming:start', (event) => {
    if (!isMain(event.sender.id))
      return { ok: false, message: 'Client translation belongs to the main window.' };
    return incomingManager.start(
      normalizeConversationSettings(loadPreferences().conversation),
      (payload) => sendToRenderer('incoming:event', payload),
      getMainWindow,
    );
  });
  ipcMain.handle('incoming:stop', async (event) => {
    if (isMain(event.sender.id)) await incomingManager.stop();
  });
  ipcMain.on('incoming:audio', (event, data: unknown) => {
    if (!isMain(event.sender.id)) return;
    if (data instanceof ArrayBuffer) incomingManager.pushAudio(data);
  });
  ipcMain.on('incoming:playback', (event, payload: import('@shared/index').PlaybackTelemetryEvent) => {
    if (isMain(event.sender.id) && payload && (payload.event === 'start' || payload.event === 'complete')) {
      incomingManager.reportPlayback(payload);
    }
  });
}
