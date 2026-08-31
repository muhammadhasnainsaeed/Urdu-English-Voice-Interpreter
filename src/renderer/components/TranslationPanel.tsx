import React from "react";
import type { TranslationStatus } from "@shared/index";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Alert } from "./ui/alert";
import { Separator } from "./ui/separator";

interface TranslationPanelProps {
  status: TranslationStatus;
  finalEnglish: string;
  error: string | null;
  provider: string | null;
  sttListening: boolean;
  onStart: () => void;
  onStop: () => void;
}

const STATUS_LABELS: Record<TranslationStatus, string> = {
  idle: "Off",
  starting: "Starting…",
  active: "Active",
  "rate-limited": "Rate-limited",
  error: "Error",
};

const PROVIDER_LABELS: Record<string, string> = {
  azure: "Azure",
  mymemory: "MyMemory",
  mock: "Mock (dev)",
};

export default function TranslationPanel({
  status,
  finalEnglish,
  error,
  provider,
  sttListening,
  onStart,
  onStop,
}: TranslationPanelProps) {
  const active = status === "active" || status === "starting";
  const canToggle = sttListening;

  const variant =
    status === "active"
      ? "success"
      : status === "error"
        ? "destructive"
        : status === "rate-limited" || status === "starting"
          ? "warning"
          : "muted";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between p-4 pb-2">
        <CardTitle className="text-[13px]">Translation</CardTitle>
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
        <div className="flex max-h-36 min-h-16 flex-col gap-2 overflow-y-auto rounded-md border p-3 text-[13px] leading-relaxed">
          {finalEnglish ? (
            <div className="text-foreground">{finalEnglish}</div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {active
                ? sttListening
                  ? "Translation active — waiting for speech…"
                  : "Start listening to see translations"
                : "Enable translation to see English output"}
            </div>
          )}
        </div>

        <Separator className="my-1" />

        <div className="flex items-center gap-2">
          {active ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onStop}
              disabled={status === "starting"}
            >
              Stop Translation
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={onStart}
              disabled={!canToggle}
              title={!canToggle ? "Start listening first" : undefined}
            >
              Start Translation
            </Button>
          )}
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}
      </CardContent>
    </Card>
  );
}
