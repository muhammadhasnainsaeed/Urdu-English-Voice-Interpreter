import { useEffect, useState } from "react";
import type {
  PipelineSummary,
  UtteranceTraceReport,
} from "@shared/index";

interface PipelineStats {
  lastUtterance: UtteranceTraceReport | null;
  summary: PipelineSummary | null;
}

/**
 * Subscribes to main-process pipeline telemetry. Events are only emitted
 * when PIPELINE_DEBUG=1, so this stays inert in normal usage.
 */
export function usePipelineStats(): PipelineStats {
  const [stats, setStats] = useState<PipelineStats>({
    lastUtterance: null,
    summary: null,
  });

  useEffect(() => {
    if (!window.electron.pipelineDebugEnabled) return;
    return window.electron.onPipelineEvent((event) => {
      if (event.type === "pipeline:utterance") {
        setStats((prev) => ({ ...prev, lastUtterance: event.utterance }));
      } else if (event.type === "pipeline:summary") {
        setStats((prev) => ({ ...prev, summary: event.summary }));
      }
    });
  }, []);

  return stats;
}
