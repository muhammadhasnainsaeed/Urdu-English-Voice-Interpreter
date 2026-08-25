import React from "react";
import { usePipelineStats } from "../services/usePipelineStats";

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

  return (
    <div className="pipeline-panel">
      <div className="stt-header">
        <span className="stt-title">Pipeline Performance</span>
        <span className="status-pill status-starting">DEV</span>
      </div>

      <table className="pipeline-table">
        <tbody>
          <tr>
            <td>STT First Partial</td>
            <td>{fmt(ms?.sttFirstPartialMs ?? null)}</td>
          </tr>
          <tr>
            <td>STT Final</td>
            <td>{fmt(ms?.sttFinalMs ?? null)}</td>
          </tr>
          <tr>
            <td>Translation</td>
            <td>{fmt(ms?.translationMs ?? null)}</td>
          </tr>
          <tr>
            <td>TTS</td>
            <td>{fmt(ms?.ttsMs ?? null)}</td>
          </tr>
          <tr>
            <td>Audio Output</td>
            <td>{fmt(ms?.audioOutputMs ?? null)}</td>
          </tr>
          <tr className="pipeline-divider">
            <td colSpan={2} />
          </tr>
          <tr className="pipeline-e2e">
            <td>First Audio</td>
            <td>{fmt(ms?.firstAudioMs ?? null)}</td>
          </tr>
          <tr className="pipeline-e2e">
            <td>End-to-End</td>
            <td>{fmt(e2e?.lastMs ?? null)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mic-status-row">
        <span className="status-label">Current Stage:</span>{" "}
        <span className="status-value">{currentStage}</span>
      </div>

      <div className="pipeline-stats-grid">
        <span>Last: {fmt(e2e?.lastMs ?? null)}</span>
        <span>Average: {fmt(e2e?.avgMs ?? null)}</span>
        <span>Min: {fmt(e2e?.minMs ?? null)}</span>
        <span>Max: {fmt(e2e?.maxMs ?? null)}</span>
      </div>

      <div className="pipeline-footnote">
        window {summary?.windowSize ?? 0}/{summary?.windowCap ?? 20}
        {" · "}completed {summary?.completedCount ?? 0}
        {outcomeLabel ? ` · last: ${outcomeLabel}` : ""}
        {lastUtterance?.speechStartApprox
          ? " · speech start approximated"
          : ""}
      </div>
    </div>
  );
}
