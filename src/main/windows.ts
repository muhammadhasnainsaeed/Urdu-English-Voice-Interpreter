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

import { BrowserWindow, screen } from 'electron';
import * as path from 'node:path';

/**
 * Window registry + event routing for the main window and the floating
 * subtitle overlay.
 *
 * Routing rule (single source of truth): subtitle-relevant channels go to
 * EVERY live window; everything else (TTS, audio playback, telemetry,
 * overlay control) goes to the main window only, so the overlay can never
 * double-play audio or interfere with pipeline control.
 */

/** Channels every window receives (overlay renders captions from these). */
export const SUBTITLE_BROADCAST_CHANNELS: readonly string[] = [
  'stt:event',
  'translation:event',
  'session:event',
];

export function isSubtitleChannel(channel: string): boolean {
  return SUBTITLE_BROADCAST_CHANNELS.includes(channel);
}

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow;
}

export function isOverlayOpen(): boolean {
  return overlayWindow !== null && !overlayWindow.isDestroyed();
}

/** Send to every live window. */
export function broadcast(channel: string, payload: unknown): void {
  for (const win of [mainWindow, overlayWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

/**
 * Route one event: subtitle channels broadcast to all windows, everything
 * else targets the main window only.
 */
export function sendToRenderer(channel: string, payload: unknown): void {
  if (isSubtitleChannel(channel)) {
    broadcast(channel, payload);
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

/* ------------------------------------------------------------------ */
/*  Overlay geometry (pure — unit-tested)                              */
/* ------------------------------------------------------------------ */

export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayGeometry {
  width: number;
  height: number;
  x: number;
  y: number;
}

export const OVERLAY_DEFAULT_SIZE = { width: 460, height: 176 } as const;
/** Gap between the overlay's bottom edge and the work-area bottom (Dock). */
export const OVERLAY_BOTTOM_GAP = 16;

/**
 * Center the overlay horizontally and sit it just above the Dock, clamped
 * into the work area for very small displays.
 */
export function overlayGeometry(
  workArea: WorkArea,
  size: { width: number; height: number } = OVERLAY_DEFAULT_SIZE,
): OverlayGeometry {
  const width = Math.min(size.width, workArea.width);
  const height = Math.min(size.height, workArea.height);
  const x = workArea.x + Math.max(0, Math.round((workArea.width - width) / 2));
  const bottom = workArea.y + workArea.height - OVERLAY_BOTTOM_GAP;
  const y = workArea.y + Math.max(0, bottom - height - workArea.y);
  return { width, height, x, y };
}

/* ------------------------------------------------------------------ */
/*  Overlay window lifecycle                                           */
/* ------------------------------------------------------------------ */

function emitOverlayState(open: boolean): void {
  sendToRenderer('overlay:event', { type: 'overlay:state', open });
}

export function openOverlay(): boolean {
  if (isOverlayOpen()) return true;

  const geometry = overlayGeometry(screen.getPrimaryDisplay().workArea);
  const win = new BrowserWindow({
    ...geometry,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    // Non-activating: opening captions must never steal focus from the
    // meeting app. Mouse events still reach the window (drag + close).
    focusable: false,
    show: false,
    title: 'Urdu → English Interpreter — Captions',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  overlayWindow = win;
  win.on('closed', () => {
    if (overlayWindow === win) {
      overlayWindow = null;
      emitOverlayState(false);
    }
  });

  void win.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: 'overlay' });
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });

  emitOverlayState(true);
  return true;
}

export function closeOverlay(): boolean {
  if (!isOverlayOpen()) return false;
  const win = overlayWindow;
  overlayWindow = null;
  if (win && !win.isDestroyed()) {
    win.close();
  }
  emitOverlayState(false);
  return true;
}

/** Open when closed / close when open. Returns the resulting state. */
export function toggleOverlay(): boolean {
  return isOverlayOpen() ? (closeOverlay(), false) : openOverlay();
}
