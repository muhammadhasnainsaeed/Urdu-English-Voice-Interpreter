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
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info';

export interface ToastInput {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

export interface Toast extends Required<Pick<ToastInput, 'title' | 'description'>> {
  id: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (input: ToastInput) => void;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 6000;

const VARIANT_BORDER: Record<ToastVariant, string> = {
  default: '',
  success: 'border-emerald-500/40',
  error: 'border-destructive/60',
  warning: 'border-amber-500/50',
  info: 'border-primary/30',
};

function ToastIcon({ variant }: { variant: ToastVariant }) {
  switch (variant) {
    case 'success':
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />;
    case 'error':
      return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />;
    case 'info':
      return <Info className="h-4 w-4 shrink-0 text-primary" />;
    default:
      return null;
  }
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg',
        VARIANT_BORDER[toast.variant],
      )}
    >
      <ToastIcon variant={toast.variant} />
      <div className="min-w-0 flex-1">
        {toast.title && <p className="m-0 text-[13px] font-semibold leading-snug">{toast.title}</p>}
        {toast.description && (
          <p className="mt-0.5 m-0 text-xs leading-relaxed text-muted-foreground">{toast.description}</p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        className="h-6 w-6 shrink-0"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const timers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = React.useCallback(
    (input: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const duration = input.duration ?? DEFAULT_DURATION;
      const next: Toast = {
        id,
        title: input.title ?? '',
        description: input.description ?? '',
        variant: input.variant ?? 'default',
        duration,
      };
      setToasts((current) => [...current.slice(-4), next]);
      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  React.useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const value = React.useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
