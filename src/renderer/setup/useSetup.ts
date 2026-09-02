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
import type { AudioOutputDevice, PermissionStatus } from '@shared/index';
import { deriveSetupState, type OutputDeviceInfo, type SetupState } from './setupState';

export interface UseSetupDeps {
  micPermission: PermissionStatus;
  hasMicDevice: boolean;
  outputDevices: AudioOutputDevice[];
  selectedOutputDeviceId: string;
  refreshOutputDevices: () => Promise<void>;
  checkBlackHole: () => Promise<boolean>;
}

/**
 * First-launch onboarding probe. On mount (and whenever devices change) it
 * re-enumerates output devices and re-checks BlackHole through the main
 * process (HAL driver presence), then derives the setup step states.
 */
export function useSetup(deps: UseSetupDeps): {
  state: SetupState;
  probed: boolean;
  recheck: () => Promise<void>;
} {
  const [probed, setProbed] = useState(false);
  const [blackholeDetected, setBlackholeDetected] = useState(false);

  const probe = useCallback(async (): Promise<void> => {
    try {
      await deps.refreshOutputDevices();
    } catch {
      // Enumerate failures are surfaced through the derived state.
    }
    try {
      const found = await deps.checkBlackHole();
      setBlackholeDetected(found);
    } catch {
      setBlackholeDetected(false);
    }
    setProbed(true);
  }, [deps.refreshOutputDevices, deps.checkBlackHole]);

  useEffect(() => {
    let cancelled = false;
    void probe().then(() => {
      if (cancelled) return;
    });
    const onChange = () => {
      if (cancelled) return;
      void probe();
    };
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener('devicechange', onChange);
    };
  }, [probe]);

  const outputInfos: OutputDeviceInfo[] = deps.outputDevices.map((d) => ({
    id: d.id,
    label: d.label,
    isDefault: d.isDefault,
  }));

  const state = deriveSetupState({
    probed,
    micPermission: deps.micPermission,
    hasMicDevice: deps.hasMicDevice,
    outputDevices: outputInfos,
    selectedOutputDeviceId: deps.selectedOutputDeviceId,
    blackholeDetected,
  });

  return { state, probed, recheck: probe };
}
