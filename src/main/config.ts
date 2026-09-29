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

import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Runtime configuration loading.
 *
 * The packaged app never ships `.env` or credentials. Configuration sources,
 * in ascending precedence:
 *   1. Extra development paths passed by the main entrypoint (the repository
 *      `.env` while developing).
 *   2. User-owned runtime config at `~/.urdu-english-interpreter/.env`
 *      (documented in the README; the packaged app reads only this).
 *   3. Process environment variables — dotenv never overrides them.
 */

export const USER_CONFIG_DIR = '.urdu-english-interpreter';
export const USER_CONFIG_FILE = '.env';

export function getUserConfigDir(): string {
  return path.join(os.homedir(), USER_CONFIG_DIR);
}

export function getUserConfigPath(): string {
  return path.join(getUserConfigDir(), USER_CONFIG_FILE);
}

function ensureUserConfigDir(): void {
  try {
    fs.mkdirSync(getUserConfigDir(), { recursive: true });
  } catch {
    // The directory is optional; the app runs fine without runtime config.
  }
}

export function loadRuntimeConfig(devPaths: string[] = []): void {
  for (const devPath of devPaths) {
    dotenv.config({ path: devPath, quiet: true });
  }
  ensureUserConfigDir();
  dotenv.config({ path: getUserConfigPath(), quiet: true });
}

export interface SttConfigStatus {
  ok: boolean;
  provider: string;
  message?: string;
}

export function sttProviderName(): string {
  const name = (process.env.STT_PROVIDER ?? 'azure').trim().toLowerCase();
  return name === '' ? 'azure' : name;
}

/**
 * Resolve the speech-to-text provider from the runtime environment and, when
 * it is not usable, produce a precise, actionable message that names the
 * exact config file the packaged app reads.
 */
export function describeSttConfig(): SttConfigStatus {
  const provider = sttProviderName();

  if (provider === 'mock') return { ok: true, provider };
  if (provider === 'whisper') return { ok: true, provider };

  if (provider === 'azure') {
    const key = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION;
    if (key && region) return { ok: true, provider };
    return {
      ok: false,
      provider,
      message:
        'No speech-to-text provider is configured. STT_PROVIDER defaults to azure, which requires ' +
        `AZURE_SPEECH_KEY and AZURE_SPEECH_REGION. Add them to ${getUserConfigPath()} (packaged app), ` +
        'to the repository .env (development), or export them in the environment before launching. ' +
        'Alternatively set STT_PROVIDER=whisper for local whisper.cpp or STT_PROVIDER=mock for development.',
    };
  }

  return {
    ok: false,
    provider,
    message: `Unknown STT_PROVIDER "${provider}". Use azure, whisper, or mock.`,
  };
}

export interface TranslationConfigStatus {
  ok: boolean;
  provider: string;
  message?: string;
}

/**
 * Resolve the provider selected by `createTranslationProvider()`: when
 * TRANSLATION_PROVIDER is unset the provider factory defaults to `mock`.
 * (Packaged builds pin the default to `azure` in the main entrypoint before
 * any provider is created, so this resolution matches the running app.)
 */
export function translationProviderName(): string {
  const name = (process.env.TRANSLATION_PROVIDER ?? 'mock').trim().toLowerCase();
  return name === '' ? 'mock' : name;
}

/**
 * Resolve the translation provider selected at runtime and, when it is not
 * usable (e.g. an azure provider without credentials), produce a precise,
 * actionable message that names the exact config file the packaged app reads.
 */
export function describeTranslationConfig(): TranslationConfigStatus {
  const provider = translationProviderName();

  if (provider === 'mock' || provider === 'mymemory') return { ok: true, provider };

  if (provider === 'azure') {
    const key = process.env.AZURE_TRANSLATOR_KEY;
    const region = process.env.AZURE_TRANSLATOR_REGION;
    if (key && region) return { ok: true, provider };
    return {
      ok: false,
      provider,
      message:
        'Translation is not configured. TRANSLATION_PROVIDER is azure, which requires ' +
        `AZURE_TRANSLATOR_KEY and AZURE_TRANSLATOR_REGION. Add them to ${getUserConfigPath()} ` +
        '(packaged app), to the repository .env (development), or export them in the environment ' +
        'before launching. Alternatively set TRANSLATION_PROVIDER=mymemory (free tier, rate limited) ' +
        'or TRANSLATION_PROVIDER=mock for development.',
    };
  }

  return {
    ok: false,
    provider,
    message: `Unknown TRANSLATION_PROVIDER "${provider}". Use azure, mymemory, or mock.`,
  };
}
