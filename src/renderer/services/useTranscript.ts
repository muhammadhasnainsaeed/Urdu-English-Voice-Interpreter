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
import type { SaveTranscriptResult, TranscriptFormat } from '@shared/index';
import {
  appendSttFinal,
  applyTranslation,
  clearTranscript,
  createTranscript,
  hasContent,
  suggestedTranscriptFileName,
  toJson,
  toTxt,
  type TranscriptEntry,
  type TranscriptState,
} from '../transcript/transcriptModel';

/**
 * Live paired transcript (Urdu final → English translation) with export.
 *
 * Subscribes to the existing STT/translation event streams independently of
 * `useStt`/`useTranslation` (which keep the subtitle display), so the display
 * hooks stay untouched. All pairing/serialization logic lives in the pure
 * `transcriptModel`.
 */
export function useTranscript(): {
  entries: TranscriptEntry[];
  isEmpty: boolean;
  clear: () => void;
  exportTranscript: (format: TranscriptFormat) => Promise<SaveTranscriptResult>;
} {
  const [state, setState] = useState<TranscriptState>(createTranscript);

  useEffect(() => {
    return window.electron.onSttEvent((event) => {
      if (event.type === 'final') {
        const at = Date.now();
        setState((current) => appendSttFinal(current, event.text, at));
      }
    });
  }, []);

  useEffect(() => {
    return window.electron.onTranslationEvent((event) => {
      if (event.type === 'translation:text') {
        const at = Date.now();
        setState((current) =>
          applyTranslation(current, {
            english: event.english,
            interim: event.interim === true,
            atMs: at,
          }),
        );
      }
    });
  }, []);

  const clear = useCallback(() => {
    setState(clearTranscript());
  }, []);

  const exportTranscript = useCallback(
    async (format: TranscriptFormat): Promise<SaveTranscriptResult> => {
      const now = new Date();
      const content = format === 'txt' ? toTxt(state) : toJson(state, now);
      return window.electron.saveTranscript({
        format,
        content,
        suggestedName: suggestedTranscriptFileName(format, now),
      });
    },
    [state],
  );

  return {
    entries: state.entries,
    isEmpty: !hasContent(state),
    clear,
    exportTranscript,
  };
}
