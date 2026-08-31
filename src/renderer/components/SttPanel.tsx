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
import type { SttStatus } from "@shared/index";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";

interface SttPanelProps {
  status: SttStatus;
  partialText: string;
  finalText: string;
  error: string | null;
  provider: string | null;
  onStart: () => void;
  onStop: () => void;
}

const STATUS_LABELS: Record<SttStatus, string> = {
  idle: "Idle",
  starting: "Starting…",
  listening: "Listening",
  processing: "Processing…",
  stopping: "Stopping…",
  error: "Error",
};

const PROVIDER_LABELS: Record<string, string> = {
  azure: "Azure",
  whisper: "Local Whisper",
  mock: "Mock (dev)",
};

export default function SttPanel({
  status,
  partialText,
  finalText,
  error,
  provider,
  onStart,
  onStop,
}: SttPanelProps) {
  const listening =
    status === "starting" ||
    status === "listening" ||
    status === "processing" ||
    status === "stopping";
  const startDisabled = status === "starting" || status === "stopping";

  const variant =
    status === "listening"
      ? "success"
      : status === "error"
        ? "destructive"
        : status === "starting" || status === "processing" || status === "stopping"
          ? "warning"
          : "muted";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between p-4 pb-2">
        <CardTitle className="text-[13px]">Speech Recognition</CardTitle>
        <div className="flex items-center gap-2">
          {provider && (
            <Badge variant="outline">{PROVIDER_LABELS[provider] ?? provider}</Badge>
          )}
          <Badge variant={variant} dot>
            {STATUS_LABELS[status]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-2 p-4 pt-0">
        <div
          className="textbox flex max-h-36 min-h-16 flex-col gap-2 overflow-y-auto rounded-md border p-3 text-[13px] leading-relaxed"
          dir="rtl"
        >
          {finalText ? (
            <div className="textbox-urdu text-foreground">{finalText}</div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {listening ? "Listening for Urdu speech…" : "No speech yet."}
            </div>
          )}
          {partialText && (
            <div className="textbox-urdu italic text-muted-foreground">
              {partialText}
            </div>
          )}
        </div>

        <Separator className="my-1" />

        <div className="flex items-center gap-2">
          {listening ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onStop}
              disabled={status === "stopping"}
            >
              Stop Listening
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={onStart}
              disabled={startDisabled}
            >
              Start Listening
            </Button>
          )}
        </div>

        {error && <p className="m-0 text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
