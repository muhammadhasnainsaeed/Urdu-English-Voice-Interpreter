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

import { useCallback, useEffect, useState } from 'react';
import type { TranslationEvent, TranslationStatus } from '@shared/index';

export function useTranslation() {
  const [status, setStatus] = useState<TranslationStatus>('idle');
  const [finalEnglish, setFinalEnglish] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);

  useEffect(() => {
    return window.electron.onTranslationEvent((event: TranslationEvent) => {
      switch (event.type) {
        case 'translation:started':
          setError(null);
          setProvider(event.provider ?? null);
          setStatus('active');
          break;
        case 'translation:text':
          setFinalEnglish((prev) => (prev ? `${prev}\n${event.english}` : event.english));
          // Successful translation after rate-limit recovery returns the
          // provider state to active.
          setStatus((prev) => (prev === 'rate-limited' ? 'active' : prev));
          break;
        case 'translation:rate-limited':
          // Concise user-facing state; raw provider errors stay in logs.
          setError(event.message);
          setStatus('rate-limited');
          break;
        case 'translation:error':
          setError(event.message);
          break;
        case 'translation:stopped':
          setStatus('idle');
          setProvider(null);
          break;
      }
    });
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus('starting');
    const result = await window.electron.startTranslation();
    if (!result.ok) {
      setError(result.message ?? 'Could not start translation.');
      setStatus('error');
    }
  }, []);

  const stop = useCallback(async () => {
    setStatus('idle');
    setProvider(null);
    await window.electron.stopTranslation();
  }, []);

  const clearHistory = useCallback(() => {
    setFinalEnglish('');
  }, []);

  return {
    status,
    finalEnglish,
    error,
    provider,
    start,
    stop,
    clearHistory,
  };
}
