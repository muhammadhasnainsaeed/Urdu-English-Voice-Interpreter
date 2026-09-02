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

import React from 'react';
import type { AudioOutputDevice } from '@shared/index';
import type { SetupState } from '../setup/setupState';
import SetupPanel from '../components/SetupPanel';
import { Button } from '../components/ui/button';

interface OnboardingScreenProps {
  setup: SetupState;
  outputDevices: AudioOutputDevice[];
  selectedOutputDeviceId: string;
  onSelectOutputDevice: (deviceId: string) => void;
  onRequestMicPermission: () => void;
  onOpenMicSettings: () => void;
  onOpenBlackHoleSite: () => void;
  onComplete: () => void;
}

/**
 * One-time first-launch experience. Shows the setup checks the app needs,
 * then a single clear call-to-action that persists onboarding so future
 * launches go straight to Home. Reachable again via Settings → Setup.
 */
export default function OnboardingScreen(props: OnboardingScreenProps) {
  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <div>
          <h1 className="m-0 text-lg font-semibold tracking-tight">Welcome</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Get your interpreter ready so you can speak Urdu and hear English in meetings.
          </p>
        </div>

        <SetupPanel
          state={props.setup}
          outputDevices={props.outputDevices}
          selectedOutputDeviceId={props.selectedOutputDeviceId}
          onSelectOutputDevice={props.onSelectOutputDevice}
          onRequestMicPermission={props.onRequestMicPermission}
          onOpenMicSettings={props.onOpenMicSettings}
          onOpenBlackHoleSite={props.onOpenBlackHoleSite}
          context="onboarding"
        />

        <div className="flex flex-col gap-2">
          <Button size="lg" onClick={props.onComplete} disabled={!props.setup.ready} className="w-full">
            Get Started
          </Button>
          <p className="m-0 text-center text-xs text-muted-foreground">
            {props.setup.ready
              ? 'Everything is ready — you can begin after this step.'
              : 'Finish the checks above to enable live interpretation.'}
          </p>
        </div>
      </div>
    </div>
  );
}
