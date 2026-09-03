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

import { useEffect, useState } from 'react';
import type { TtsVoice } from '@shared/index';

export interface TtsVoicesApi {
  /** All voices for the current environment (dev includes macOS system voices). */
  voices: TtsVoice[];
  /** True while voices are being enumerated. */
  loading: boolean;
  /** True when running unpackaged (macOS system voices are available). */
  development: boolean;
}

/**
 * Loads the available TTS voices from the main process once on mount. The main
 * process decides which sources apply (Azure always; macOS system voices only
 * in development/unpackaged builds).
 */
export function useTtsVoices(): TtsVoicesApi {
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [development, setDevelopment] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.electron
      .getTtsVoices()
      .then((result) => {
        if (cancelled) return;
        setVoices(result.voices ?? []);
        setDevelopment(result.development ?? false);
      })
      .catch(() => {
        if (cancelled) return;
        setVoices([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { voices, loading, development };
}
