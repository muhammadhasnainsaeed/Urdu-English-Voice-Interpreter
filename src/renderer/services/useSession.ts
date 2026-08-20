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
