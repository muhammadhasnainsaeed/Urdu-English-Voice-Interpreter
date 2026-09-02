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

import * as React from 'react';
import { classifyInputError, type AppError, type ClassifyOptions, type ErrorCategory } from './errorModel';
import { ToastProvider, useToast } from './toast';

const MAX_HISTORY = 20;

export interface ReportOptions extends ClassifyOptions {
  /** Show a user-facing toast for this error (default true for severity >= warning). */
  toast?: boolean;
}

export interface ErrorHandling {
  /** Normalized error history for Diagnostics (most recent first). */
  errors: AppError[];
  /** Normalize, log, optionally toast, and record an error. */
  reportError: (category: ErrorCategory, raw: string | null | undefined, options?: ReportOptions) => AppError;
  /** Clear the Diagnostics error history. */
  clearErrors: () => void;
}

const ErrorContext = React.createContext<ErrorHandling | null>(null);

function InternalErrorProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [errors, setErrors] = React.useState<AppError[]>([]);

  const reportError = React.useCallback(
    (category: ErrorCategory, raw: string | null | undefined, options: ReportOptions = {}): AppError => {
      const normalized = classifyInputError(category, raw, options);

      // Diagnostics + development console trail.
      console.info(
        `[app-error] ${normalized.code} (${category}) — ${normalized.detail ?? normalized.message}`,
      );

      setErrors((current) => [normalized, ...current].slice(0, MAX_HISTORY));

      const showToast = options.toast ?? normalized.severity !== 'info';
      if (showToast) {
        toast({
          variant:
            normalized.severity === 'error'
              ? 'error'
              : normalized.severity === 'warning'
                ? 'warning'
                : 'info',
          title: normalized.message,
          description: normalized.category,
        });
      }
      return normalized;
    },
    [toast],
  );

  const clearErrors = React.useCallback(() => setErrors([]), []);

  const value = React.useMemo<ErrorHandling>(
    () => ({ errors, reportError, clearErrors }),
    [errors, reportError, clearErrors],
  );

  return <ErrorContext.Provider value={value}>{children}</ErrorContext.Provider>;
}

export function ErrorProvider({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <InternalErrorProvider>{children}</InternalErrorProvider>
    </ToastProvider>
  );
}

export function useErrorHandling(): ErrorHandling {
  const ctx = React.useContext(ErrorContext);
  if (!ctx) {
    throw new Error('useErrorHandling must be used within an ErrorProvider');
  }
  return ctx;
}
