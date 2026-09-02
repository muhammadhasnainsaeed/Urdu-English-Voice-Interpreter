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
import type { AppPreferences } from '@shared/index';

export interface PreferencesApi {
  /** Persisted preferences, undefined until the initial read resolves. */
  preferences: AppPreferences | null;
  /** True once the initial persistence read has completed. */
  loaded: boolean;
  /** True when onboarding has been completed (persisted). */
  onboardingCompleted: boolean;
  /** Persist the given subset of preferences. */
  update: (patch: Partial<AppPreferences>) => Promise<boolean>;
  /** Mark onboarding as completed (persisted). */
  completeOnboarding: () => Promise<boolean>;
  /** Clear the onboarding flag so first-launch onboarding shows again. */
  resetOnboarding: () => Promise<boolean>;
}

/**
 * Loads the persisted app preferences (notably the onboarding flag) from the
 * main process on mount and provides a small update surface for the renderer.
 * The single source of truth for "has this user completed onboarding?" lives
 * on disk so it survives relaunches without any server, database, or auth.
 */
export function usePreferences(): PreferencesApi {
  const [preferences, setPreferences] = useState<AppPreferences | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void window.electron
      .getPreferences()
      .then((result) => {
        if (cancelled) return;
        if (result.ok && result.preferences) {
          setPreferences(result.preferences);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setPreferences({ onboardingCompleted: false });
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(async (patch: Partial<AppPreferences>): Promise<boolean> => {
    const result = await window.electron.setPreferences(patch);
    if (result.ok && result.preferences) {
      setPreferences(result.preferences);
      return true;
    }
    return false;
  }, []);

  const completeOnboarding = useCallback(async (): Promise<boolean> => {
    const result = await window.electron.setPreferences({ onboardingCompleted: true });
    if (result.ok && result.preferences) {
      setPreferences(result.preferences);
      return true;
    }
    return false;
  }, []);

  const resetOnboarding = useCallback(async (): Promise<boolean> => {
    const result = await window.electron.setPreferences({ onboardingCompleted: false });
    if (result.ok && result.preferences) {
      setPreferences(result.preferences);
      return true;
    }
    return false;
  }, []);

  return {
    preferences,
    loaded,
    onboardingCompleted: preferences?.onboardingCompleted ?? false,
    update,
    completeOnboarding,
    resetOnboarding,
  };
}
