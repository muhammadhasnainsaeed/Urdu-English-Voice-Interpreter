import React from "react";
import type { TtsStatus } from "@shared/index";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Alert } from "./ui/alert";

interface TtsPanelProps {
  status: TtsStatus;
  error: string | null;
  provider: string | null;
  currentText: string;
  translationActive: boolean;
  onStart: () => void;
  onStop: () => void;
}

const STATUS_LABELS: Record<TtsStatus, string> = {
  idle: "Off",
  starting: "Starting…",
  active: "Active",
  error: "Error",
};

const PROVIDER_LABELS: Record<string, string> = {
  azure: "Azure",
  say: "macOS Say",
  mock: "Mock (dev)",
};

export default function TtsPanel({
  status,
  error,
  provider,
  currentText,
  translationActive,
  onStart,
  onStop,
}: TtsPanelProps) {
  const active = status === "active" || status === "starting";
  const canToggle = translationActive;

  const variant =
    status === "active"
      ? "success"
      : status === "error"
        ? "destructive"
        : status === "starting"
          ? "warning"
          : "muted";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between p-4 pb-2">
        <CardTitle className="text-[13px]">Text-to-Speech</CardTitle>
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
        {currentText && (
          <div className="flex max-h-36 min-h-16 flex-col gap-2 overflow-y-auto rounded-md border p-3 text-[13px] leading-relaxed">
            <div className="text-foreground">{currentText}</div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {active ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onStop}
              disabled={status === "starting"}
            >
              Stop TTS
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={onStart}
              disabled={!canToggle}
              title={!canToggle ? "Start translation first" : undefined}
            >
              Start TTS
            </Button>
          )}
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}
      </CardContent>
    </Card>
  );
}
