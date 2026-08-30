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