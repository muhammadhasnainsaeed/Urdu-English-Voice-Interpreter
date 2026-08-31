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

import React from "react";
import type { AudioOutputDevice } from "@shared/index";
import type { SetupState, SetupStepState } from "../setup/setupState";
import { Card, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { cn } from "@/lib/utils";

interface SetupPanelProps {
  state: SetupState;
  outputDevices: AudioOutputDevice[];
  selectedOutputDeviceId: string;
  onSelectOutputDevice: (deviceId: string) => void;
  onRequestMicPermission: () => void;
  onOpenMicSettings: () => void;
  onOpenBlackHoleSite: () => void;
}

const STEP_GLYPH: Record<SetupStepState, string> = {
  checking: "\u2026",
  ready: "\u2713",
  "action-required": "!",
  error: "\u2715",
};

const STATUS_LABEL: Record<SetupStepState, string> = {
  checking: "Checking",
  ready: "Ready",
  "action-required": "Needs action",
  error: "Blocked",
};

const ICON_STYLE: Record<
  SetupStepState,
  string
> = {
  ready: "border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  error: "border-transparent bg-destructive/15 text-destructive",
  "action-required": "border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400",
  checking: "border-dashed",
};

function StepBadge({ state }: { state: SetupStepState }) {
  const variant =
    state === "ready"
      ? ("success" as const)
      : state === "error"
        ? ("destructive" as const)
        : state === "action-required"
          ? ("warning" as const)
          : ("muted" as const);
  return <Badge variant={variant}>{STATUS_LABEL[state]}</Badge>;
}

function StepRow({
  state,
  name,
  detail,
  children,
}: {
  state: SetupStepState;
  name: string;
  detail: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold text-muted-foreground",
          ICON_STYLE[state]
        )}
        aria-hidden
      >
        {STEP_GLYPH[state]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-h-5 items-center gap-2">
          <span className="text-[13px] font-medium">{name}</span>
          <span className="grow" />
          <StepBadge state={state} />
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>
        {children}
      </div>
    </div>
  );
}

function MicStep({
  state,
  onRequestPermission,
  onOpenSettings,
}: {
  state: SetupState["mic"];
  onRequestPermission: () => void;
  onOpenSettings: () => void;
}) {
  let detail: React.ReactNode = null;
  let detailText = "";

  switch (state.action) {
    case "request-permission":
      detailText = "The app needs microphone access to hear your Urdu speech.";
      detail = (
        <div className="mt-2">
          <Button variant="outline" size="sm" onClick={onRequestPermission}>
            Allow Microphone
          </Button>
        </div>
      );
      break;
    case "open-settings":
      detailText =
        "Enable “Urdu English Interpreter” in System Settings → Privacy & Security → Microphone.";
      detail = (
        <div className="mt-2">
          <Button variant="outline" size="sm" onClick={onOpenSettings}>
            Open System Settings
          </Button>
        </div>
      );
      break;
    case "no-mic":
      detailText = "No microphone found. Plug one in and restart the app.";
      break;
    case "none":
      detailText = "The app can hear your Urdu speech.";
      break;
  }

  return (
    <StepRow state={state.state} name="Microphone" detail={detailText}>
      {detail}
    </StepRow>
  );
}

function OutputStep({
  state,
  devices,
  selectedId,
  onSelect,
}: {
  state: SetupState["output"];
  devices: AudioOutputDevice[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  let detail = "";
  if (state.state === "checking") detail = "Checking audio output…";
  else if (state.state === "error")
    detail = "No audio output available. Connect speakers or headphones.";
  else if (state.selectedDeviceLabel)
    detail = `Translations play through “${state.selectedDeviceLabel}”.`;
  else detail = "Translations play through the selected device.";

  return (
    <StepRow state={state.state} name="Audio Output" detail={detail}>
      {state.state === "ready" && (
        <div className="mt-2 flex items-center gap-2">
          <Label htmlFor="setup-output" className="text-xs">
            Device
          </Label>
          <div className="grow">
            <Select
              value={selectedId}
              onValueChange={onSelect}
              disabled={devices.length === 0}
            >
              <SelectTrigger id="setup-output" aria-label="Audio output device">
                <SelectValue placeholder="No output device" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </StepRow>
  );
}

function BlackHoleStep({
  state,
  onOpenSite,
}: {
  state: SetupState["blackhole"];
  onOpenSite: () => void;
}) {
  let detail = "Installed — English audio can route into your meeting app.";
  if (state.state === "checking") detail = "Checking for BlackHole…";
  if (state.state === "action-required")
    detail =
      "BlackHole (free) is how the app sends English audio into Zoom, Teams, or Meet. Translation still works locally without it.";

  return (
    <StepRow state={state.state} name="BlackHole" detail={detail}>
      {state.state === "action-required" && (
        <div className="mt-2">
          <Button variant="outline" size="sm" onClick={onOpenSite}>
            Open BlackHole download page
          </Button>
        </div>
      )}
    </StepRow>
  );
}

export default function SetupPanel({
  state,
  outputDevices,
  selectedOutputDeviceId,
  onSelectOutputDevice,
  onRequestMicPermission,
  onOpenMicSettings,
  onOpenBlackHoleSite,
}: SetupPanelProps) {
  const everythingChecking =
    state.mic.state === "checking" &&
    state.output.state === "checking" &&
    state.blackhole.state === "checking";

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-[13px]">Get Ready</CardTitle>
        <CardDescription className="text-xs">
          Complete these checks before starting a meeting.
        </CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-3 px-4 pb-2">
        <MicStep
          state={state.mic}
          onRequestPermission={onRequestMicPermission}
          onOpenSettings={onOpenMicSettings}
        />
        <Separator />
        <OutputStep
          state={state.output}
          devices={outputDevices}
          selectedId={selectedOutputDeviceId}
          onSelect={onSelectOutputDevice}
        />
        <Separator />
        <BlackHoleStep state={state.blackhole} onOpenSite={onOpenBlackHoleSite} />
      </div>

      <Separator className="mt-2" />

      <div className="px-4 py-3">
        {state.ready ? (
          <div className="flex items-center gap-2 text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">
            <Badge variant="success" dot>
              Ready
            </Badge>
            Press Start Meeting below.
          </div>
        ) : (
          <div className="text-[13px] text-muted-foreground">
            {everythingChecking
              ? "Checking your setup…"
              : "Complete the required setup above, then press Start Meeting."}
          </div>
        )}
      </div>
    </Card>
  );
}
