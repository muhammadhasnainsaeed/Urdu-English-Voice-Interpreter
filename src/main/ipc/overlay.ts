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

import { ipcMain } from 'electron';
import type { OverlayStatus } from '@shared/index';
import { closeOverlay, isOverlayOpen, toggleOverlay } from '../windows';

export function registerOverlayIpc(): void {
  ipcMain.handle('overlay:status', (): OverlayStatus => ({ open: isOverlayOpen() }));

  ipcMain.handle('overlay:toggle', (): OverlayStatus => ({ open: toggleOverlay() }));

  ipcMain.handle('overlay:close', (): OverlayStatus => {
    closeOverlay();
    return { open: false };
  });
}
