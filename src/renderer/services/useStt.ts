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

import { useCallback, useEffect, useRef, useState } from "react";
import type { SttEvent, SttStatus } from "@shared/index";

const TARGET_SAMPLE_RATE = 16000;
const PROCESSING_RESET_MS = 350;

function createResampler(fromRate: number, toRate: number) {
  const ratio = fromRate / toRate;
  let tail = new Float32Array(0);

  return (input: Float32Array): Float32Array => {
    const combined = new Float32Array(tail.length + input.length);
    combined.set(tail);
    combined.set(input, tail.length);

    const outLength = Math.floor(combined.length / ratio);
    const output = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const pos = i * ratio;
      const index = Math.floor(pos);
      const frac = pos - index;
      const next =
        index + 1 < combined.length ? combined[index + 1] : combined[index];
      output[i] = combined[index] + (next - combined[index]) * frac;
    }

    tail = combined.slice(Math.floor(outLength * ratio));
    return output;
  };
}

function toInt16Pcm(float: Float32Array): ArrayBuffer {
  const pcm = new Int16Array(float.length);
  for (let i = 0; i < float.length; i++) {
    const s = Math.max(-1, Math.min(1, float[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm.buffer;
}

export function useStt() {
  const [status, setStatus] = useState<SttStatus>("idle");
  const [partialText, setPartialText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);

  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const statusRef = useRef<SttStatus>("idle");
  const processingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const isActive =
    status === "starting" || status === "listening" || status === "processing";

  const stopFeeding = useCallback(() => {
    const processor = processorRef.current;
    const source = sourceRef.current;
    const gain = gainNodeRef.current;

    if (processor) {
      processor.onaudioprocess = null;
      try {
        processor.disconnect();
      } catch {
        // ignore
      }
    }
    if (source) {
      try {
        source.disconnect();
      } catch {
        // ignore
      }
    }
    if (gain) {
      try {
        gain.disconnect();
      } catch {
        // ignore
      }
    }
    sourceRef.current = null;
    processorRef.current = null;
    gainNodeRef.current = null;
  }, []);

  const onEvent = useCallback((event: SttEvent) => {
    switch (event.type) {
      case "started":
        setError(null);
        setStatus("listening");
        break;
      case "partial":
        setPartialText(event.text);
        break;
      case "final":
        setPartialText("");
        setFinalText((prev) => (prev ? `${prev}\n` : "") + event.text);
        setStatus("processing");
        if (processingTimerRef.current) {
          window.clearTimeout(processingTimerRef.current);
        }
        processingTimerRef.current = window.setTimeout(() => {
          if (statusRef.current === "processing") {
            setStatus("listening");
          }
        }, PROCESSING_RESET_MS);
        break;
      case "error":
        setError(event.message);
        setStatus("error");
        stopFeeding();
        break;
      case "stopped":
        stopFeeding();
        setStatus("idle");
        setProvider(null);
        break;
    }
  }, [stopFeeding]);
  useEffect(() => {
    const unsubscribe = window.electron.onSttEvent(onEvent);
    return unsubscribe;
  }, [onEvent]);

  const start = useCallback(
    async (stream: MediaStream, audioContext: AudioContext): Promise<boolean> => {
      setError(null);
      setPartialText("");
      setStatus("starting");

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const gain = audioContext.createGain();
      gain.gain.value = 0;

      source.connect(processor);
      processor.connect(gain);
      gain.connect(audioContext.destination);

      const resampler = createResampler(
        audioContext.sampleRate,
        TARGET_SAMPLE_RATE
      );

      processor.onaudioprocess = (event) => {
        const activeStatus = statusRef.current;
        if (
          activeStatus !== "listening" &&
          activeStatus !== "processing" &&
          activeStatus !== "starting"
        ) {
          return;
        }
        const channel = event.inputBuffer.getChannelData(0);
        const resampled = resampler(channel);
        window.electron.sendSttAudio(toInt16Pcm(resampled));
      };

      sourceRef.current = source;
      processorRef.current = processor;
      gainNodeRef.current = gain;

      const result = await window.electron.startStt();
      if (!result.ok) {
        setError(
          result.message ?? "Could not start speech recognition."
        );
        setStatus("error");
        stopFeeding();
        return false;
      }
      setProvider(result.provider ?? null);
      return true;
    },
    [stopFeeding]
  );

  const stop = useCallback(async () => {
    if (statusRef.current === "idle") return;
    if (processingTimerRef.current) {
      window.clearTimeout(processingTimerRef.current);
      processingTimerRef.current = null;
    }
    setStatus("stopping");
    stopFeeding();
    try {
      await window.electron.stopStt();
    } finally {
      setStatus("idle");
    }
  }, [stopFeeding]);

  useEffect(() => {
    return () => {
      stopFeeding();
      window.electron.stopStt().catch(() => undefined);
    };
  }, [stopFeeding]);

  return {
    status,
    partialText,
    finalText,
    error,
    provider,
    isActive,
    start,
    stop,
  };
}
