import { useCallback, useEffect, useState } from "react";
import type { TranslationEvent, TranslationStatus } from "@shared/index";

export function useTranslation() {
  const [status, setStatus] = useState<TranslationStatus>("idle");
  const [finalEnglish, setFinalEnglish] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);

  useEffect(() => {
    return window.electron.onTranslationEvent((event: TranslationEvent) => {
      switch (event.type) {
        case "translation:started":
          setError(null);
          setProvider(event.provider ?? null);
          setStatus("active");
          break;
        case "translation:text":
          setFinalEnglish((prev) =>
            prev ? `${prev}\n${event.english}` : event.english
          );
          break;
        case "translation:error":
          setError(event.message);
          break;
        case "translation:stopped":
          setStatus("idle");
          setProvider(null);
          break;
      }
    });
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus("starting");
    const result = await window.electron.startTranslation();
    if (!result.ok) {
      setError(result.message ?? "Could not start translation.");
      setStatus("error");
    }
  }, []);

  const stop = useCallback(async () => {
    setStatus("idle");
    setProvider(null);
    await window.electron.stopTranslation();
  }, []);

  const clearHistory = useCallback(() => {
    setFinalEnglish("");
  }, []);

  return {
    status,
    finalEnglish,
    error,
    provider,
    start,
    stop,
    clearHistory,
  };
}
