import React from "react";
import { usePipelineStats } from "../services/usePipelineStats";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";

function fmt(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

interface PipelinePanelProps {
  /** High-level live stage label derived from existing UI signals. */
  currentStage: string;
}

/**
 * Development-only pipeline performance overlay. Rendered only when
 * PIPELINE_DEBUG=1 (see App gate); shows per-phase latencies of the last
 * completed utterance plus rolling end-to-end statistics.
 */
export default function PipelinePanel({ currentStage }: PipelinePanelProps) {
  const enabled = window.electron.pipelineDebugEnabled;
  const { lastUtterance, summary } = usePipelineStats();

  if (!enabled) return null;

  const ms = lastUtterance?.ms;
  const e2e = summary?.e2e;
  const outcomeLabel =
    lastUtterance?.outcome === "completed"
      ? null
      : lastUtterance?.outcome.replace(/-/g, " ");

  const row = (label: string, value: string, highlight = false) => (
    <tr>
      <td className="py-0.5 pr-3 text-muted-foreground">{label}</td>
      <td
        className={
          highlight
            ? "py-0.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400"
            : "py-0.5 text-right tabular-nums text-foreground"
        }
      >
        {value}
      </td>
    </tr>
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between p-4 pb-2">
        <CardTitle className="text-[13px]">Pipeline Performance</CardTitle>
        <Badge variant="warning">DEV</Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-2 p-4 pt-0">
        <table className="w-full border-collapse">
          <tbody className="text-xs">
            {row("STT First Partial", fmt(ms?.sttFirstPartialMs ?? null))}
            {row("STT Final", fmt(ms?.sttFinalMs ?? null))}
            {row(
              "STT Partials",
              lastUtterance?.sttPartialCount !== undefined
                ? `${lastUtterance.sttPartialCount} event(s)`
                : "—"
            )}
            {row("Translation", fmt(ms?.translationMs ?? null))}
            {row("TTS", fmt(ms?.ttsMs ?? null))}
            {row("TTS First Chunk", fmt(ms?.ttsFirstChunkMs ?? null))}
            {row("Audio Output", fmt(ms?.audioOutputMs ?? null))}
            <tr>
              <td colSpan={2}>
                <div className="my-2 h-px bg-border" />
              </td>
            </tr>
            {row("First Audio", fmt(ms?.firstAudioMs ?? null), true)}
            {row("End-to-End", fmt(e2e?.lastMs ?? null), true)}
          </tbody>
        </table>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Current Stage:</span>
          <span className="font-medium">{currentStage}</span>
        </div>

        <div className="grid grid-cols-2 gap-y-0.5 gap-x-3 text-[11px] tabular-nums text-muted-foreground">
          <span>Last: {fmt(e2e?.lastMs ?? null)}</span>
          <span>Average: {fmt(e2e?.avgMs ?? null)}</span>
          <span>Min: {fmt(e2e?.minMs ?? null)}</span>
          <span>Max: {fmt(e2e?.maxMs ?? null)}</span>
        </div>

        <div className="text-[10px] text-muted-foreground/70">
          window {summary?.windowSize ?? 0}/{summary?.windowCap ?? 20}
          {" · "}completed {summary?.completedCount ?? 0}
          {outcomeLabel ? ` · last: ${outcomeLabel}` : ""}
          {lastUtterance?.speechStartApprox ? " · speech start approximated" : ""}
        </div>
      </CardContent>
    </Card>
  );
}
