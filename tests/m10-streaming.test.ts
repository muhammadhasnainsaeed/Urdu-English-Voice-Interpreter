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

import assert from "node:assert/strict";
import { test } from "node:test";
import type { AudioChunk } from "../packages/shared/index";
import { TtsManager } from "../src/main/services/tts/manager";
import type { TtsProvider } from "../src/main/services/tts/provider";
import { pipelineTelemetry } from "../src/main/services/telemetry/pipeline-telemetry";

const format = { sampleRate: 24000, bitsPerSample: 16, channels: 1 };
const chunk = (value: number): AudioChunk => ({
  data: Uint8Array.from([value, 0]).buffer,
  format,
});

function outputRecorder() {
  const writes: Array<AudioChunk & { streamStart?: boolean; streamEnd?: boolean }> = [];
  return {
    writes,
    manager: {
      writeAudio: async (value: AudioChunk) => writes.push(value as typeof writes[number]),
      cancelPlayback: () => {},
    },
  };
}

test("streaming TTS forwards ordered chunks with one playback boundary", async () => {
  const output = outputRecorder();
  let spoken = false;
  const provider: TtsProvider = {
    name: "stream-mock",
    synthesize: async () => chunk(9),
    synthesizeStream: async (_text, onChunk) => {
      await onChunk(chunk(1), false);
      await onChunk(chunk(2), false);
      await onChunk(chunk(3), true);
    },
    stop: async () => {},
  };
  const tts = new TtsManager(0);
  await tts.start((event) => {
    if (event.type === "tts:spoken") spoken = true;
  }, output.manager as never, provider);

  tts.onTranslationText("hello");
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(output.writes.map((item) => new Uint8Array(item.data)[0]), [1, 2, 3]);
  assert.deepEqual(output.writes.map((item) => item.streamStart), [true, false, false]);
  assert.deepEqual(output.writes.map((item) => item.streamEnd), [false, false, true]);
  assert.equal(output.writes.every((item) => item.playbackId === 1), true);
  assert.equal(spoken, true);
  tts.stop();
});

test("streaming TTS is preempted and stale chunks stop forwarding", async () => {
  const output = outputRecorder();
  let resolveOld: (() => void) | null = null;
  const provider: TtsProvider = {
    name: "stream-mock",
    synthesize: async () => chunk(9),
    synthesizeStream: async (text, onChunk, signal) => {
      await onChunk(chunk(text === "old" ? 1 : 2), true);
      if (text !== "old") return;
      await new Promise<void>((resolve, reject) => {
        resolveOld = resolve;
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    },
    stop: async () => {},
  };
  const tts = new TtsManager(0);
  await tts.start(() => {}, output.manager as never, provider);
  tts.onTranslationText("old");
  await new Promise((resolve) => setTimeout(resolve, 10));
  tts.onTranslationText("new");
  resolveOld?.();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.deepEqual(output.writes.map((item) => new Uint8Array(item.data)[0]), [1, 2]);
  tts.stop();
});

test("legacy provider without streaming uses one complete chunk", async () => {
  const output = outputRecorder();
  const provider: TtsProvider = {
    name: "legacy-mock",
    synthesize: async () => chunk(7),
    stop: async () => {},
  };
  const tts = new TtsManager(0);
  await tts.start(() => {}, output.manager as never, provider);
  tts.onTranslationText("legacy");
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(output.writes.length, 1);
  assert.equal(output.writes[0].streamStart, true);
  assert.equal(output.writes[0].streamEnd, true);
  tts.stop();
});

test("stopping the session aborts an active stream and forwards nothing after stop", async () => {
  const output = outputRecorder();
  const spoken: string[] = [];
  let streamAborted = false;
  const provider: TtsProvider = {
    name: "stream-mock",
    synthesize: async () => chunk(9),
    synthesizeStream: async (_text, onChunk, signal) => {
      // Emit the first chunk while the session is still active.
      await onChunk(chunk(1), false);
      // Stay open until aborted by a session stop. If stop() fails to abort
      // the stream, this promise never settles and streamAborted stays false.
      return new Promise((_, reject) => {
        signal?.addEventListener(
          "abort",
          () => {
            streamAborted = true;
            reject(signal.reason);
          },
          { once: true }
        );
      });
    },
    stop: async () => {},
  };
  const tts = new TtsManager(0);
  await tts.start((event) => {
    if (event.type === "tts:spoken") spoken.push(event.text);
  }, output.manager as never, provider);
  tts.onTranslationText("before-stop");
  await new Promise((resolve) => setTimeout(resolve, 10));

  // First chunk was forwarded while the manager was still active.
  assert.deepEqual(output.writes.map((item) => new Uint8Array(item.data)[0]), [1]);

  // Session stop aborts the in-flight stream...
  tts.stop();
  assert.equal(streamAborted, true, "stop() must abort the active synthesizeStream");

  // ...and forwards nothing after stop. A subsequent utterance must not be
  // synthesized or written once the session is stopped.
  const writesAtStop = output.writes.length;
  tts.onTranslationText("after-stop");
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(output.writes.length, writesAtStop, "no chunks may be written after session stop");
  assert.deepEqual(spoken, [], "no tts:spoken events after session stop");
  tts.stop();
});

/**
 * Interim→final replacement during streaming. The single FIFO telemetry
 * trace per STT-final is shared between an utterance's interim and final
 * translations. When a final arrives while the interim stream is still
 * in-flight, the trace must be preserved and adopted by the final so the
 * final is telemetry-attributed as "completed" — instead of being drained
 * as "tts-interrupted" (which would lose the final result).
 */
test("interim→final streaming replacement keeps the final telemetry-attributed", async () => {
  // Start from a clean telemetry slate.
  pipelineTelemetry.resetPipeline();

  const output = outputRecorder();
  const provider: TtsProvider = {
    name: "stream-mock",
    synthesize: async () => chunk(9),
    synthesizeStream: async (text, onChunk, signal) => {
      if (text === "interim text") {
        // Interim emits its first chunk, then stays in-flight until the
        // final arrives and aborts it.
        await onChunk(chunk(1), false);
        await new Promise<void>((_, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      } else {
        // Final streams and finishes.
        await onChunk(chunk(2), true);
      }
    },
    stop: async () => {},
  };
  const tts = new TtsManager(0);
  await tts.start(() => {}, output.manager as never, provider);

  // Create the single shared FIFO trace (STT final → translation).
  pipelineTelemetry.onSttFinal("براہ کرم توجہ سے سنیں");
  pipelineTelemetry.beginTranslation();
  pipelineTelemetry.endTranslationSuccess("interim text");
  // The interim translation now owns the trace (now in awaitingTts).

  // Interim TTS begins synthesizing (in-flight, interim).
  tts.onTranslationText("interim text", true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(output.writes.length, 1, "interim first chunk written");
  assert.equal(0, output.writes[0].playbackId, "interim chunk uses playbackId 0");

  // Final TTS replaces the active interim stream for the same utterance.
  tts.onTranslationText("final text", false);
  await new Promise((resolve) => setTimeout(resolve, 30));

  // The final must have synthesized and written a (non-interim) chunk.
  const finalWrites = output.writes.filter(
    (w) => w.playbackId !== 0 && new Uint8Array(w.data)[0] === 2
  );
  assert.equal(finalWrites.length, 1, "final synthesized one chunk");
  const finalPlaybackId = finalWrites[0].playbackId as number;
  assert.ok(finalPlaybackId > 0, "final uses a non-zero playbackId");

  // Drive playback lifecycle for the final so its trace can complete.
  pipelineTelemetry.reportPlayback({
    event: "start",
    bytes: 2,
    playbackId: finalPlaybackId,
  });
  pipelineTelemetry.reportPlayback({
    event: "complete",
    bytes: 2,
    playbackId: finalPlaybackId,
  });

  // The final must be attributed as a completed utterance (completedCount
  // increments only on "completed" outcomes). The interim must NOT have been
  // drained as an interrupted final result.
  assert.equal(
    pipelineTelemetry.getSummary().completedCount,
    1,
    "final must be telemetry-attributed as completed after replacing an active interim stream"
  );

  tts.stop();
});
