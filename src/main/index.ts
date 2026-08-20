import 'dotenv/config';
import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import type { ApplicationStatus } from '@shared/index';
import { registerAudioIpc } from './ipc/audio';
import { registerAudioOutputIpc, audioOutputManager } from './ipc/audio-output';
import { registerSttIpc } from './ipc/stt';
import { registerTranslationIpc, translationManager } from './ipc/translation';
import { registerTtsIpc, ttsManager } from './ipc/tts';
import { registerSessionIpc, sessionManager } from './ipc/session';

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
    (english) => ttsManager.onTranslationText(english)
  );
  registerTtsIpc(() => mainWindow, audioOutputManager);
  registerSessionIpc(() => mainWindow);
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
