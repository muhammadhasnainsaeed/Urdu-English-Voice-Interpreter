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

import { app, BrowserWindow, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { ApplicationStatus, PipelineEvent, PlaybackTelemetryEvent } from '@shared/index';
import { describeSttConfig, describeTranslationConfig, getUserConfigPath, loadRuntimeConfig } from './config';
import { registerAudioIpc } from './ipc/audio';
import { registerAudioOutputIpc, audioOutputManager } from './ipc/audio-output';
import { registerSttIpc } from './ipc/stt';
import { registerTranslationIpc, translationManager } from './ipc/translation';
import { registerTtsIpc, ttsManager } from './ipc/tts';
import { registerSessionIpc, sessionManager } from './ipc/session';
import { registerSystemIpc } from './ipc/system';
import { registerPreferencesIpc } from './ipc/preferences';
import { resolveTtsProviderName } from './services/tts/voices';
import { pipelineTelemetry } from './services/telemetry/pipeline-telemetry';

// Configuration loading.
//
// Development: the repository `.env` (resolved via app.getAppPath(), which is
// the repo root when running unpackaged).
// Production: the packaged app never contains `.env` / credentials. If the
// user supplies a runtime config, it is loaded from the user-owned path
// `~/.urdu-english-interpreter/.env` (documented). Shell environment
// variables always take precedence and are never overridden by dotenv.
loadRuntimeConfig([path.join(app.getAppPath(), '.env')]);

// Production defaults to the real Azure providers (consistent across the
// pipeline: STT azure, translation azure, TTS azure); development defaults to
// mock so a first run works with no credentials. Users override these with
// STT_PROVIDER / TRANSLATION_PROVIDER / TTS_PROVIDER in the runtime config.
if (app.isPackaged && !process.env.TRANSLATION_PROVIDER) {
  process.env.TRANSLATION_PROVIDER = 'azure';
}
if (app.isPackaged && !process.env.TTS_PROVIDER) {
  process.env.TTS_PROVIDER = 'azure';
}

let mainWindow: BrowserWindow | null = null;

/**
 * Development-only renderer hot reload. Polls the renderer output files
 * (index.html, bundle.js, tailwind.css) and reloads the window when esbuild /
 * Tailwind write new contents — so renderer-only edits appear without a full
 * app restart. Polling is used instead of fs.watch because macOS FSEvents can
 * silently drop rapid in-place rewrites, and esbuild only rewrites a bundle
 * when its content actually changed.
 */
function watchRendererSources(window: BrowserWindow) {
  const rendererDir = path.join(__dirname, '../renderer');
  const targets = [
    path.join(rendererDir, 'index.html'),
    path.join(rendererDir, 'bundle.js'),
    path.join(rendererDir, 'tailwind.css'),
  ];
  const mtimes = new Map<string, number>();
  let reloadTimer: NodeJS.Timeout | null = null;

  for (const file of targets) {
    try {
      mtimes.set(file, fs.statSync(file).mtimeMs);
    } catch {
      mtimes.set(file, 0);
    }
  }

  const poll = () => {
    if (reloadTimer || window.isDestroyed()) return;
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      let changed = false;
      for (const file of targets) {
        let mtime = 0;
        try {
          mtime = fs.statSync(file).mtimeMs;
        } catch {
          mtime = 0;
        }
        if (mtime !== mtimes.get(file)) {
          mtimes.set(file, mtime);
          if (mtime > 0) changed = true;
        }
      }
      if (changed && !window.isDestroyed()) {
        console.log('[dev] renderer bundle/CSS changed — reloading window');
        window.webContents.reload();
      }
    }, 150);
  };

  const interval = setInterval(poll, 350);
  window.on('closed', () => clearInterval(interval));
}

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
    watchRendererSources(mainWindow);
  }
}

app.whenReady().then(() => {
  registerAudioIpc();
  registerAudioOutputIpc(() => mainWindow);
  registerSttIpc(
    () => mainWindow,
    (text, isFinal) => translationManager.onSttText(text, isFinal),
  );
  registerTranslationIpc(
    () => mainWindow,
    (english, interim) => ttsManager.onTranslationText(english, interim),
  );
  registerTtsIpc(() => mainWindow, audioOutputManager);
  registerSessionIpc(() => mainWindow);
  registerSystemIpc();
  registerPreferencesIpc();

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

  // Packaged-app startup diagnostics: surface where runtime config is read
  // from and whether speech-to-text is usable, so first-run failures are
  // diagnosable from the terminal even before the UI is interacted with.
  if (app.isPackaged) {
    const configPath = getUserConfigPath();
    console.log(
      `[CONFIG] runtime config: ${configPath}${fs.existsSync(configPath) ? '' : ' (not found — optional)'}`,
    );
    const stt = describeSttConfig();
    if (stt.ok) {
      console.log(`[CONFIG] speech-to-text provider: ${stt.provider}`);
    } else {
      console.log(`[CONFIG] speech-to-text not ready: ${stt.message}`);
    }
    console.log(`[CONFIG] text-to-speech provider: ${resolveTtsProviderName()}`);
    const translation = describeTranslationConfig();
    if (translation.ok) {
      console.log(`[CONFIG] translation provider: ${translation.provider}`);
    } else {
      console.log(`[CONFIG] translation not ready: ${translation.message}`);
    }
  }

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
