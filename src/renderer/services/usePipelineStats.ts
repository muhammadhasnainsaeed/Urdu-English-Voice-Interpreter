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
