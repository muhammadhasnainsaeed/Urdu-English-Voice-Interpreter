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

/**
 * Shared microphone PCM tap.
 *
 * Taps a live `MediaStream` and delivers sequential, non-overlapping mono
 * Float32 frames to a callback. The primary path is an `AudioWorkletNode`
 * (the deprecated `ScriptProcessorNode` is only a feature-detected
 * fallback), so the deprecation warning is gone from the console while the
 * graph semantics stay identical:
 *
 *   source → tap → zero-gain → destination   (context keeps running, silent)
 *
 * Worklet blocks arrive every 128 frames; `FrameBatcher` regroups them to
 * the historical 4096-source-frame cadence before the callback runs, so
 * downstream consumers (resampler → Int16 → STT IPC) see the same chunking
 * they did with ScriptProcessorNode.
 *
 * Pure helpers (`createResampler`, `toInt16Pcm`, `FrameBatcher`) have no
 * DOM dependency and are unit-tested in `tests/pcm-tap.test.ts`.
 */

export const TARGET_SAMPLE_RATE = 16000;
export const DEFAULT_FLUSH_FRAMES = 4096;
export const WORKLET_PROCESSOR_NAME = 'pcm-capture-processor';
/** Resolved against the document base (`dist/renderer/index.html`). */
export const WORKLET_MODULE_URL = 'pcm-processor.js';

/** Linear-interpolation resampler with a carry-over tail buffer. */
export function createResampler(fromRate: number, toRate: number) {
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
      const next = index + 1 < combined.length ? combined[index + 1] : combined[index];
      output[i] = combined[index] + (next - combined[index]) * frac;
    }

    tail = combined.slice(Math.floor(outLength * ratio));
    return output;
  };
}

/** Float32 [-1,1] → little-endian Int16 PCM buffer (clamped). */
export function toInt16Pcm(float: Float32Array): ArrayBuffer {
  const pcm = new Int16Array(float.length);
  for (let i = 0; i < float.length; i++) {
    const s = Math.max(-1, Math.min(1, float[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm.buffer;
}

/**
 * Regroups small audio-thread blocks into batches of at least
 * `flushFrames` samples. Copies every block (input buffers are reused by
 * both the audio thread and ScriptProcessorNode).
 */
export class FrameBatcher {
  private readonly flushFrames: number;
  private chunks: Float32Array[] = [];
  private length = 0;

  constructor(flushFrames: number = DEFAULT_FLUSH_FRAMES) {
    this.flushFrames = Math.max(1, Math.floor(flushFrames));
  }

  /** Append a block; returns a batch once at least flushFrames are pending. */
  push(block: Float32Array): Float32Array | null {
    if (block.length > 0) {
      this.chunks.push(new Float32Array(block));
      this.length += block.length;
    }
    if (this.length < this.flushFrames) return null;
    return this.drain();
  }

  /** Return whatever is pending (non-empty), for end-of-tap flushes. */
  flush(): Float32Array | null {
    if (this.length === 0) return null;
    return this.drain();
  }

  private drain(): Float32Array {
    const out = new Float32Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];
    this.length = 0;
    return out;
  }
}

export interface PcmTap {
  /** Detach from the graph and stop delivering frames. Idempotent. */
  disconnect(): void;
}

export interface PcmTapOptions {
  /** Source frames per delivered batch (default 4096, the SP cadence). */
  flushFrames?: number;
}

/**
 * Connect `stream` to a silent sink and deliver batched mono Float32 frames.
 * Resolves once the graph is live (awaits `audioWorklet.addModule`).
 * Falls back to ScriptProcessorNode when the worklet is unavailable or the
 * module cannot load (e.g. CSP), logging a single warning.
 */
export async function createPcmTap(
  audioContext: AudioContext,
  stream: MediaStream,
  onFrames: (frames: Float32Array) => void,
  options: PcmTapOptions = {},
): Promise<PcmTap> {
  const flushFrames = options.flushFrames ?? DEFAULT_FLUSH_FRAMES;
  const batcher = new FrameBatcher(flushFrames);
  const emit = (block: Float32Array): void => {
    const batch = batcher.push(block);
    if (batch) onFrames(batch);
  };

  const source = audioContext.createMediaStreamSource(stream);
  const gain = audioContext.createGain();
  gain.gain.value = 0;

  let node: AudioWorkletNode | ScriptProcessorNode | null = null;
  let port: MessagePort | null = null;
  let fallback = false;

  if (audioContext.audioWorklet) {
    try {
      await audioContext.audioWorklet.addModule(WORKLET_MODULE_URL);
      const worklet = new AudioWorkletNode(audioContext, WORKLET_PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: 'explicit',
        outputChannelCount: [1],
      });
      worklet.port.onmessage = (event: MessageEvent) => {
        const data = event.data as Float32Array;
        if (data instanceof Float32Array) emit(data);
      };
      source.connect(worklet);
      worklet.connect(gain);
      node = worklet;
      port = worklet.port;
    } catch (err) {
      fallback = true;
      console.warn(
        '[audio] AudioWorklet unavailable — falling back to ScriptProcessorNode:',
        err instanceof Error ? err.message : err,
      );
    }
  } else {
    fallback = true;
  }

  if (!node) {
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => {
      emit(event.inputBuffer.getChannelData(0));
    };
    source.connect(processor);
    processor.connect(gain);
    node = processor;
  }

  gain.connect(audioContext.destination);
  if (fallback && typeof window !== 'undefined') {
    // Surface the degradation once for Diagnostics without failing the tap.
    console.info('[audio] capture running on the legacy ScriptProcessorNode path');
  }

  let disconnected = false;
  return {
    disconnect(): void {
      if (disconnected) return;
      disconnected = true;
      try {
        source.disconnect();
      } catch {
        // already disconnected
      }
      if (port) {
        port.onmessage = null;
      }
      try {
        node?.disconnect();
      } catch {
        // already disconnected
      }
      try {
        gain.disconnect();
      } catch {
        // already disconnected
      }
      node = null;
      port = null;
    },
  };
}
