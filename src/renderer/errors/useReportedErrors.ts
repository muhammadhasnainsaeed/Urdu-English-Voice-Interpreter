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

import { useEffect, useRef } from 'react';
import { useErrorHandling, type ReportOptions } from './ErrorProvider';
import type { ErrorCategory } from './errorModel';

export interface ErrorStream {
  category: ErrorCategory;
  error: string | null;
  message?: string;
  options?: ReportOptions;
}

/**
 * Centralizes an array of error streams into the app-wide error flow. Each
 * stream fires exactly once per active error occurrence; a stream is reset
 * (so an identical later error can be re-reported) once its error clears.
 * This avoids spamming a toast on every render of a persistent error state.
 */
export function useReportedErrors(streams: ErrorStream[]): void {
  const { reportError } = useErrorHandling();
  const lastReported = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    for (const stream of streams) {
      const key = stream.category;
      const raw = stream.error?.trim() ?? '';

      if (!raw) {
        lastReported.current.delete(key);
        continue;
      }

      if (lastReported.current.get(key) === raw) continue;

      lastReported.current.set(key, raw);
      reportError(stream.category, raw, {
        message: stream.message,
        ...stream.options,
      });
    }
  }, [streams, reportError]);
}
