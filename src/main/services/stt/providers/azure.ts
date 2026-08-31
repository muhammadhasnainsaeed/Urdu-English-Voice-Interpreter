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

import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import type { SttHandlers, SttProvider } from "../provider";

const AZURE_STT_DEBUG = process.env.PIPELINE_DEBUG === "1";

/**
 * Resolve the optional service segmentation silence timeout from
 * AZURE_STT_SEGMENTATION_SILENCE_MS. Official supported range is
 * 100–5000 ms (~500 ms default); see aka.ms/csspeech/timeouts.
 * Unset/empty → undefined (service default). Out-of-range values are
 * clamped with a warning; non-numeric values are ignored with a warning.
 */
export function resolveSegmentationSilenceMs(
  raw: string | undefined
): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    console.warn(
      `[CONFIG] AZURE_STT_SEGMENTATION_SILENCE_MS="${raw}" is not an integer — using service default`
    );
    return undefined;
  }
  const value = parseInt(trimmed, 10);
  if (value < 100 || value > 5000) {
    const clamped = Math.min(5000, Math.max(100, value));
    console.warn(
      `[CONFIG] AZURE_STT_SEGMENTATION_SILENCE_MS=${value} outside supported range 100–5000ms — clamped to ${clamped}`
    );
    return clamped;
  }
  return value;
}

function isNonEmpty(text: string | undefined): text is string {
  return typeof text === "string" && text.trim().length > 0;
}

/**
 * M9 diagnostics (PIPELINE_DEBUG only): recognizing-event cadence,
 * final events, and mic-audio chunk delivery timing. Never logs keys.
 */
function makeDiagnostics() {
  let recognizingCount = 0;
  let lastRecognizingAt = 0;
  const gaps: number[] = [];
  let chunkCount = 0;
  let lastChunkAt = 0;
  const chunkGaps: number[] = [];
  return {
    onRecognizing(text: string): void {
      if (!AZURE_STT_DEBUG) return;
      const now = Date.now();
      recognizingCount++;
      if (lastRecognizingAt > 0) gaps.push(now - lastRecognizingAt);
      const gap =
        lastRecognizingAt > 0 ? ` (+${now - lastRecognizingAt}ms)` : "";
      lastRecognizingAt = now;
      console.log(
        `[AZURE-STT] recognizing #${recognizingCount}${gap} text="${text.slice(0, 80)}"`
      );
    },
    onFinal(text: string): void {
      if (!AZURE_STT_DEBUG) return;
      const avg = gaps.length
        ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)
        : 0;
      console.log(
        `[AZURE-STT] recognized final after ${recognizingCount} partial(s)` +
          `${gaps.length ? ` (avg partial interval ${avg}ms)` : ""}` +
          ` text="${text.slice(0, 80)}"`
      );
      recognizingCount = 0;
      gaps.length = 0;
      lastRecognizingAt = 0;
    },
    onChunk(bytes: number): void {
      if (!AZURE_STT_DEBUG) return;
      const now = Date.now();
      chunkCount++;
      if (lastChunkAt > 0) chunkGaps.push(now - lastChunkAt);
      lastChunkAt = now;
      if (chunkCount % 100 === 0) {
        const avg = Math.round(
          chunkGaps.reduce((a, b) => a + b, 0) / chunkGaps.length
        );
        console.log(
          `[AZURE-STT] audio chunks=${chunkCount} avgInterval=${avg}ms bytes=${bytes}`
        );
      }
    },
    onStop(): void {
      if (!AZURE_STT_DEBUG || chunkCount === 0) return;
      const sorted = [...chunkGaps].sort((a, b) => a - b);
      const avg = Math.round(
        chunkGaps.reduce((a, b) => a + b, 0) / chunkGaps.length
      );
      console.log(
        `[AZURE-STT] session audio summary: chunks=${chunkCount}` +
          ` avgInterval=${avg}ms` +
          ` p50=${sorted[Math.floor(sorted.length / 2)] ?? 0}ms` +
          ` max=${sorted[sorted.length - 1] ?? 0}ms`
      );
    },
  };
}

export function createAzureSttProvider(
  key: string,
  region: string,
  language: string
): SttProvider {
  let recognizer: sdk.SpeechRecognizer | null = null;
  let pushStream: sdk.PushAudioInputStream | null = null;
  const diag = makeDiagnostics();

  return {
    name: "azure",

    async start(handlers: SttHandlers) {
      const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
      speechConfig.speechRecognitionLanguage = language;

      const segmentationSilenceMs = resolveSegmentationSilenceMs(
        process.env.AZURE_STT_SEGMENTATION_SILENCE_MS
      );
      if (segmentationSilenceMs !== undefined) {
        speechConfig.setProperty(
          sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs,
          String(segmentationSilenceMs)
        );
      }

      if (AZURE_STT_DEBUG) {
        // Startup config visibility for benchmarks. NEVER logs the API key.
        console.log(
          `[AZURE-STT] region="${region}" language="${language}" ` +
            `endpointId="${speechConfig.endpointId || "(none — standard model)"}" ` +
            `segmentationSilence=${segmentationSilenceMs ?? "(service default)"}ms`
        );
      }

      pushStream = sdk.AudioInputStream.createPushStream();
      const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
      recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

      recognizer.recognizing = (_sender, event) => {
        const text = event.result.text;
        diag.onRecognizing(text);
        if (isNonEmpty(text)) handlers.onPartial(text.trim());
      };

      // Service-side voice onset — used only for latency telemetry.
      recognizer.speechStartDetected = () => {
        handlers.onSpeechStart?.();
      };

      recognizer.recognized = (_sender, event) => {
        if (event.result.reason === sdk.ResultReason.RecognizedSpeech) {
          const text = event.result.text;
          if (isNonEmpty(text)) {
            diag.onFinal(text);
            handlers.onFinal(text.trim());
          }
        }
      };

      recognizer.canceled = (_sender, event) => {
        const reason = sdk.CancellationReason[event.reason];
        const details =
          event.errorDetails && event.errorDetails.trim() !== ""
            ? event.errorDetails.trim()
            : undefined;
        handlers.onError(
          details
            ? `Speech recognition canceled (${reason}): ${details}`
            : `Speech recognition canceled (${reason}).`
        );
        // Session ended; close the recognizer so a later start works.
        try {
          recognizer?.close();
        } catch {
          // ignore
        }
        recognizer = null;
        try {
          pushStream?.close();
        } catch {
          // ignore
        }
        pushStream = null;
      };

      await new Promise<void>((resolve, reject) => {
        recognizer!.startContinuousRecognitionAsync(() => resolve(), (err) =>
          reject(err)
        );
      });
    },

    pushAudio(buffer: ArrayBuffer) {
      if (pushStream) {
        diag.onChunk(buffer.byteLength);
        pushStream.write(buffer);
      }
    },

    async stop() {
      diag.onStop();
      const active = recognizer;
      recognizer = null;

      if (active) {
        await new Promise<void>((resolve) => {
          try {
            active.stopContinuousRecognitionAsync(() => {
              try {
                active.close();
              } catch {
                // ignore
              }
              resolve();
            });
          } catch {
            try {
              active.close();
            } catch {
              // ignore
            }
            resolve();
          }
        });
      }

      if (pushStream) {
        try {
          pushStream.close();
        } catch {
          // ignore
        }
        pushStream = null;
      }
    },
  };
}
