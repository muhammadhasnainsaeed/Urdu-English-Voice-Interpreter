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

import { ipcMain, shell } from "electron";
import type { OpenExternalResult } from "@shared/index";
import { isAllowedOpenExternalUrl } from "@shared/index";

/**
 * System helpers for the renderer — deliberately tiny and tightly scoped so
 * the renderer can never open arbitrary URLs. The allow-list lives in
 * packages/shared together with the renderer-facing link constants.
 */
export function registerSystemIpc() {
  ipcMain.handle(
    "system:open-external",
    async (_event, url: unknown): Promise<OpenExternalResult> => {
      if (typeof url !== "string" || !isAllowedOpenExternalUrl(url)) {
        return { ok: false, message: "Blocked: not an allowed link." };
      }
      try {
        await shell.openExternal(url);
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, message: `Could not open the link: ${msg}` };
      }
    }
  );
}