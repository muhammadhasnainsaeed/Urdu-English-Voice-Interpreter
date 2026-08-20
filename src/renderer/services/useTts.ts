import { useCallback, useEffect, useRef, useState } from "react";
import type { TtsEvent, TtsStatus } from "@shared/index";

export function useTts() {
  const [status, setStatus] = useState<TtsStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [currentText, setCurrentText] = useState("");
  const statusRef = useRef<TtsStatus>("idle");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    return window.electron.onTtsEvent((event: TtsEvent) => {
      switch (event.type) {
        case "tts:started":
          setError(null);
          setProvider(event.provider ?? null);
          setStatus("active");
          break;
        case "tts:speaking":
          setCurrentText(event.text);
          break;
        case "tts:spoken":
          setCurrentText("");
          break;
        case "tts:error":
          setError(event.message);
          break;
        case "tts:stopped":
          setStatus("idle");
          setProvider(null);
          setCurrentText("");
          break;
      }
    });
  }, []);

  // Cleanup: stop TTS in main process if component unmounts while active
  useEffect(() => {
    return () => {
      if (statusRef.current === "active") {
        window.electron.stopTts().catch(() => undefined);
      }
    };
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus("starting");
    const result = await window.electron.startTts();
    if (!result.ok) {
      setError(result.message ?? "Could not start TTS.");
      setStatus("error");
    }
  }, []);

  const stop = useCallback(async () => {
    setStatus("idle");
    setProvider(null);
    setCurrentText("");
    await window.electron.stopTts();
  }, []);

  return {
    status,
    error,
    provider,
    currentText,
    start,
    stop,
  };
}
