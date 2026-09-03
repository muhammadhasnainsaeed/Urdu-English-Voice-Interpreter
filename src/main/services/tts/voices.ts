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

import { execFile } from 'child_process';
import type { TtsVoice, VoiceGender } from '@shared/index';

/**
 * Curated catalog of real, documented Azure Neural voices. These are well-known
 * English neural voices whose locale + gender are published by Microsoft — no
 * invented ids or gender mappings. The full Azure catalog is not enumerable
 * statically, so the app exposes this curated subset; provider ids stay
 * provider-specific and are passed through to the Azure TTS provider verbatim.
 */
const AZURE_VOICES: Array<{ id: string; gender: Exclude<VoiceGender, 'unknown'>; name: string }> = [
  { id: 'en-US-JennyNeural', gender: 'female', name: 'Jenny (US)' },
  { id: 'en-US-AriaNeural', gender: 'female', name: 'Aria (US)' },
  { id: 'en-US-JaneNeural', gender: 'female', name: 'Jane (US)' },
  { id: 'en-US-MichelleNeural', gender: 'female', name: 'Michelle (US)' },
  { id: 'en-US-NancyNeural', gender: 'female', name: 'Nancy (US)' },
  { id: 'en-US-SaraNeural', gender: 'female', name: 'Sara (US)' },
  { id: 'en-US-GuyNeural', gender: 'male', name: 'Guy (US)' },
  { id: 'en-US-ChristopherNeural', gender: 'male', name: 'Christopher (US)' },
  { id: 'en-US-EricNeural', gender: 'male', name: 'Eric (US)' },
  { id: 'en-US-RogerNeural', gender: 'male', name: 'Roger (US)' },
  { id: 'en-US-SteffanNeural', gender: 'male', name: 'Steffan (US)' },
  { id: 'en-US-TonyNeural', gender: 'male', name: 'Tony (US)' },
  { id: 'en-GB-SoniaNeural', gender: 'female', name: 'Sonia (GB)' },
  { id: 'en-GB-LibbyNeural', gender: 'female', name: 'Libby (GB)' },
  { id: 'en-GB-RyanNeural', gender: 'male', name: 'Ryan (GB)' },
  { id: 'en-GB-ThomasNeural', gender: 'male', name: 'Thomas (GB)' },
  { id: 'en-AU-NatashaNeural', gender: 'female', name: 'Natasha (AU)' },
  { id: 'en-AU-WilliamNeural', gender: 'male', name: 'William (AU)' },
  { id: 'en-IN-NeerjaNeural', gender: 'female', name: 'Neerja (IN)' },
  { id: 'en-IN-PrabhatNeural', gender: 'male', name: 'Prabhat (IN)' },
  { id: 'en-CA-ClaraNeural', gender: 'female', name: 'Clara (CA)' },
  { id: 'en-CA-LiamNeural', gender: 'male', name: 'Liam (CA)' },
];

/**
 * Derive the country/region from an Azure voice id's locale prefix
 * (`en-US-JennyNeural` → "US", `en-IN-PrabhatNeural` → "IN").
 */
export function countryFromAzureId(id: string): string {
  const match = /^en-([A-Z]{2})-/.exec(id);
  return match ? match[1] : 'unknown';
}

/** The app's safe default voice id (also the historical env/baked default). */
export const DEFAULT_TTS_VOICE_ID = 'en-US-JennyNeural';

/** Real Azure voice ids that can be passed to the Azure provider verbatim. */
export const AZURE_VOICE_IDS: readonly string[] = AZURE_VOICES.map((v) => v.id);

/**
 * Parse the output of `say -v '\?'`. Each line is:
 *   Name  Locale  #  <sample phrase>
 * Voice names may contain multiple words and parenthetical qualifiers (e.g.
 * "Bad News", "Eddy (English)"), so we locate the locale token (`xx_YY`) right
 * before the `#` and treat everything before it as the name. When no locale
 * token is present, the whole segment before `#` is the name.
 */
export function parseSayVoices(output: string): TtsVoice[] {
  const voices: TtsVoice[] = [];
  const seen = new Set<string>();
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const hashIndex = line.indexOf('#');
    const head = (hashIndex >= 0 ? line.slice(0, hashIndex) : line).trim();
    if (!head) continue;

    const tokens = head.split(/\s+/);
    const localeIndex = tokens.findIndex((token) => /^[a-z]{2}_[A-Z]{2}$/.test(token));
    const name = localeIndex >= 0 ? tokens.slice(0, localeIndex).join(' ').trim() : tokens.join(' ').trim();

    if (!name || seen.has(name)) continue;
    seen.add(name);

    // macOS `say` does not advertise gender, so this cannot be known reliably.
    // Country is derived from the region portion of the locale token (xx_YY).
    const country =
      localeIndex >= 0 && /^[a-z]{2}_([A-Z]{2})$/.exec(tokens[localeIndex])
        ? tokens[localeIndex].slice(3)
        : 'unknown';
    voices.push({ id: name, name, gender: 'unknown', source: 'system', country });
  }
  return voices;
}

function runSayList(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('say', ['-v', '?'], { encoding: 'utf8', maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stdout);
    });
  });
}

/** List all voices for the current environment. */
export async function listVoices(
  development: boolean,
): Promise<{ voices: TtsVoice[]; development: boolean }> {
  const voices: TtsVoice[] = AZURE_VOICES.map((v) => ({
    id: v.id,
    name: v.name,
    gender: v.gender,
    source: 'azure',
    country: countryFromAzureId(v.id),
  }));

  if (development) {
    try {
      const system = await runSayList();
      voices.push(...parseSayVoices(system));
    } catch {
      // macOS `say` enumeration failed — Azures voices still enumerated.
    }
  }

  return { voices, development };
}

/**
 * Resolve a persisted voice id into a safe voice id for the current
 * environment. A stale macOS system voice persisted in dev must never flow
 * into a production build, so in production only known Azure ids are accepted
 * (anything else — including dev system voices — falls back to the default).
 * In development the stored id is passed through so dev/testing system voices
 * work, but an unknown id still falls back to the Azure default.
 */
export function normalizeSelectedVoiceId(storedId: string | null | undefined, development: boolean): string {
  const raw = storedId?.trim();
  if (!raw) return DEFAULT_TTS_VOICE_ID;
  if (development) {
    // Accept any non-empty id in dev (azure or a macOS system voice).
    return raw;
  }
  // Production: only curated Azure ids are allowed.
  return AZURE_VOICE_IDS.includes(raw) ? raw : DEFAULT_TTS_VOICE_ID;
}

/**
 * True when `id` is one of the curated Azure voice ids. A non-empty id that is
 * NOT an Azure id is a macOS system voice (dev-only), which must be synthesized
 * by the macOS `say` provider rather than Azure.
 */
export function voiceIsAzure(id: string | null | undefined): boolean {
  return !!id && AZURE_VOICE_IDS.includes(id);
}
