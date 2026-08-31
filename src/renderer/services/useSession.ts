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

import { useCallback, useEffect, useState } from "react";
import type {
  PipelineStageStatus,
  SessionEvent,
  SessionStatus,
} from "@shared/index";

const DEFAULT_STAGES: PipelineStageStatus = {
  stt: "idle",
  translation: "idle",
  tts: "idle",
  audioOutput: "idle",
};

export function useSession() {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [stages, setStages] = useState<PipelineStageStatus>(DEFAULT_STAGES);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return window.electron.onSessionEvent((event: SessionEvent) => {
      switch (event.type) {
        case "session:started":
          setError(null);
          setStatus("active");
          break;
        case "session:stopped":
          setStatus("idle");
          setStages(DEFAULT_STAGES);
          break;
        case "session:error":
          setError(event.message);
          setStatus("error");
          break;
        case "session:status":
          setStages(event.stages);
          break;
        case "session:stage":
          setStages((prev) => ({
            ...prev,
            [event.stage]: event.status,
          }));
          break;
      }
    });
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus("starting");
    const result = await window.electron.startSession();
    if (!result.ok) {
      setError(result.message ?? "Could not start session.");
      setStatus("error");
    }
    return result;
  }, []);

  const stop = useCallback(async () => {
    setStatus("stopping");
    await window.electron.stopSession();
  }, []);

  return {
    status,
    stages,
    error,
    start,
    stop,
  };
}
