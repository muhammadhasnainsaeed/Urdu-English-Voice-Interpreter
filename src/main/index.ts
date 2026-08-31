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

import * as dotenv from "dotenv";
import { app, BrowserWindow, ipcMain } from "electron";
import * as os from "os";
import * as path from "path";
import type { ApplicationStatus, PipelineEvent, PlaybackTelemetryEvent } from '@shared/index';
import { registerAudioIpc } from './ipc/audio';
import { registerAudioOutputIpc, audioOutputManager } from './ipc/audio-output';
import { registerSttIpc } from './ipc/stt';
import { registerTranslationIpc, translationManager } from './ipc/translation';
import { registerTtsIpc, ttsManager } from './ipc/tts';
import { registerSessionIpc, sessionManager } from './ipc/session';
import { registerSystemIpc } from './ipc/system';
import { pipelineTelemetry } from './services/telemetry/pipeline-telemetry';

// Configuration loading.
//
// Development: `.env` in the current working directory (repository root).
// Production: the packaged app never contains `.env` / credentials. If the
// user supplies a runtime config, it is loaded from the user-owned path
// `~/.urdu-english-interpreter/.env` (documented). Shell environment
// variables always take precedence and are never overridden by dotenv.
dotenv.config();
dotenv.config({ path: path.join(os.homedir(), ".urdu-english-interpreter", ".env"), quiet: true });

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 680,
    minWidth: 420,
    minHeight: 560,
    title: 'Urdu → English Interpreter',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  registerAudioIpc();
  registerAudioOutputIpc(() => mainWindow);
  registerSttIpc(
    () => mainWindow,
    (text, isFinal) => translationManager.onSttText(text, isFinal)
  );
  registerTranslationIpc(
    () => mainWindow,
    (english, interim) => ttsManager.onTranslationText(english, interim)
  );
  registerTtsIpc(() => mainWindow, audioOutputManager);
  registerSessionIpc(() => mainWindow);
  registerSystemIpc();

  // Pipeline telemetry (development-only): forward events to the renderer
  // and accept playback lifecycle reports for output latency timing.
  pipelineTelemetry.setListener((event: PipelineEvent) => {
    const win = mainWindow;
    if (win && !win.isDestroyed()) {
      win.webContents.send('pipeline:event', event);
    }
  });
  ipcMain.on('telemetry:playback', (_event, payload: PlaybackTelemetryEvent) => {
    ttsManager.handlePlaybackLifecycle(payload);
    if (
      payload &&
      (payload.event === 'start' || payload.event === 'complete') &&
      typeof payload.bytes === 'number'
    ) {
      pipelineTelemetry.reportPlayback(payload);
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Graceful shutdown — stop all services before quitting
app.on('before-quit', () => {
  sessionManager.emergencyStop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Basic IPC handlers for Milestone 1
ipcMain.handle('get-app-status', (): ApplicationStatus => 'idle');
