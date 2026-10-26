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

import type { AudioFormat, PlaybackTelemetryEvent } from '@shared/index';

export interface PlaybackChunk {
  data: ArrayBuffer;
  format: AudioFormat;
  playbackId?: number | null;
  streamStart?: boolean;
  streamEnd?: boolean;
}

interface PlaybackOptions {
  createContext?: () => AudioContext;
  onPlaybackEvent?: (event: PlaybackTelemetryEvent) => void;
  /** A small initial cushion absorbs IPC/network jitter without per-chunk gaps. */
  bufferSeconds?: number;
}

/**
 * Schedules PCM against the audio clock, rather than waiting for a JS `ended`
 * callback between chunks. One instance owns one independent output route.
 */
export class PcmPlaybackQueue {
  private context: AudioContext | null = null;
  private currentSinkId: string | null = null;
  private deviceId = '';
  private nextStartTime = 0;
  private generation = 0;
  private tail = Promise.resolve();
  private sources = new Set<AudioBufferSourceNode>();
  private carry: { bytes: Uint8Array; format: string; playbackId: number | null; start: boolean } | null =
    null;
  private lastPlayback: {
    source: AudioBufferSourceNode;
    ended: boolean;
    complete: boolean;
    bytes: number;
    playbackId: number | null;
    generation: number;
  } | null = null;
  private readonly createContext: () => AudioContext;
  private readonly onPlaybackEvent?: PlaybackOptions['onPlaybackEvent'];
  private readonly bufferSeconds: number;

  constructor(options: PlaybackOptions = {}) {
    // Keep the hardware sample rate. Each AudioBuffer retains its own format,
    // so a later chunk cannot change the rate of already queued audio.
    this.createContext = options.createContext ?? (() => new AudioContext({ latencyHint: 'interactive' }));
    this.onPlaybackEvent = options.onPlaybackEvent;
    this.bufferSeconds = options.bufferSeconds ?? 0.06;
  }

  enqueue(chunk: PlaybackChunk): Promise<void> {
    const generation = this.generation;
    const task = this.tail.then(() => this.schedule(chunk, generation));
    // One bad device/chunk must not leave the queue permanently rejected.
    this.tail = task.catch(() => {});
    return task;
  }

  /** Validate the route and unlock audio while Start Meeting has user activation. */
  prepare(): Promise<void> {
    const generation = this.generation;
    const task = this.tail.then(async () => {
      await this.ensureContext(generation);
    });
    this.tail = task.catch(() => {});
    return task;
  }

  cancel(): void {
    this.generation += 1;
    this.nextStartTime = 0;
    this.carry = null;
    this.lastPlayback = null;
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Sources may have just finished on the audio thread.
      }
      source.disconnect();
    }
    this.sources.clear();
  }

  async close(): Promise<void> {
    this.cancel();
    const context = this.context;
    this.context = null;
    this.currentSinkId = null;
    if (context && context.state !== 'closed') await context.close();
  }

  async selectDevice(deviceId: string): Promise<void> {
    const target = deviceId === 'default' ? '' : deviceId;
    if (target === this.deviceId) return;
    // Never let already scheduled speech leak into a newly selected route.
    this.cancel();
    this.deviceId = target;
    const generation = this.generation;
    await this.tail;
    if (generation !== this.generation || !this.context) return;
    await this.applySink(this.context);
  }

  private async applySink(context: AudioContext): Promise<void> {
    const target = this.deviceId;
    if (this.currentSinkId === target) return;
    if (typeof context.setSinkId !== 'function') {
      if (target) {
        throw new Error('This audio engine cannot target the selected output. Choose System Default.');
      }
      this.currentSinkId = '';
      return;
    }
    try {
      await context.setSinkId(target);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Could not use the selected audio output. Select an available device. ${detail}`);
    }
    this.currentSinkId = target;
  }

  private async ensureContext(generation: number): Promise<AudioContext | null> {
    if (generation !== this.generation) return null;
    if (!this.context || this.context.state === 'closed') {
      this.context = this.createContext();
      this.currentSinkId = null;
    }
    const context = this.context;
    try {
      await this.applySink(context);
      if (generation !== this.generation) return null;
      if (context.state === 'suspended') await context.resume();
    } catch (err) {
      // Closing an old context while routing/resuming can reject that work.
      // It is an intentional cancellation, not a new playback failure.
      if (generation !== this.generation) return null;
      throw err;
    }
    // Cancellation can happen while permission, routing, or resume is pending.
    if (generation !== this.generation || context !== this.context) return null;
    return context;
  }

  private async schedule(chunk: PlaybackChunk, generation: number): Promise<void> {
    if (generation !== this.generation) return;
    const { sampleRate, channels, bitsPerSample } = chunk.format;
    if (
      bitsPerSample !== 16 ||
      !Number.isInteger(channels) ||
      channels < 1 ||
      !Number.isFinite(sampleRate) ||
      sampleRate <= 0
    ) {
      throw new Error('Audio output received an invalid 16-bit PCM chunk.');
    }

    const playbackId = chunk.playbackId ?? null;
    const formatKey = `${sampleRate}/${channels}/${bitsPerSample}`;
    const carry = this.carry;
    this.carry = null;
    if (
      carry &&
      (chunk.streamStart !== false || carry.playbackId !== playbackId || carry.format !== formatKey)
    ) {
      throw new Error('Audio output received an incomplete PCM frame before a new stream.');
    }
    let bytes = new Uint8Array(chunk.data);
    if (carry) {
      const joined = new Uint8Array(carry.bytes.length + bytes.length);
      joined.set(carry.bytes);
      joined.set(bytes, carry.bytes.length);
      bytes = joined;
    }
    const start = carry?.start || chunk.streamStart !== false;
    const alignedLength = bytes.length - (bytes.length % (channels * 2));
    if (alignedLength !== bytes.length) {
      if (chunk.streamEnd !== false) {
        throw new Error('Audio output received an invalid 16-bit PCM chunk with an incomplete final frame.');
      }
      this.carry = {
        bytes: bytes.slice(alignedLength),
        format: formatKey,
        playbackId,
        start: start && alignedLength === 0,
      };
    }
    if (alignedLength === 0) {
      // Some streaming providers terminate with an empty end marker.
      if (
        chunk.streamEnd !== false &&
        this.lastPlayback?.playbackId === playbackId &&
        !this.lastPlayback.complete
      ) {
        const last = this.lastPlayback;
        last.complete = true;
        if (last.ended && last.generation === this.generation) {
          this.onPlaybackEvent?.({ event: 'complete', bytes: last.bytes, playbackId });
        }
      }
      return;
    }

    const context = await this.ensureContext(generation);
    if (!context) return;

    const frames = alignedLength / (channels * 2);
    const buffer = context.createBuffer(channels, frames, sampleRate);
    const pcm = new DataView(bytes.buffer, bytes.byteOffset, alignedLength);
    for (let channel = 0; channel < channels; channel += 1) {
      const samples = buffer.getChannelData(channel);
      for (let frame = 0; frame < frames; frame += 1) {
        samples[frame] = pcm.getInt16((frame * channels + channel) * 2, true) / 32768;
      }
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    this.sources.add(source);
    const playback = {
      source,
      ended: false,
      complete: chunk.streamEnd !== false,
      bytes: alignedLength,
      playbackId,
      generation,
    };
    this.lastPlayback = playback;
    source.onended = () => {
      playback.ended = true;
      this.sources.delete(source);
      source.disconnect();
      if (generation === this.generation && playback.complete) {
        this.onPlaybackEvent?.({
          event: 'complete',
          bytes: playback.bytes,
          playbackId,
        });
      }
    };

    // All chunks already available are scheduled before the first one ends.
    // Rebuffer only after an actual underrun, never at normal stream boundaries.
    const startTime =
      this.nextStartTime > context.currentTime
        ? this.nextStartTime
        : context.currentTime + this.bufferSeconds;
    try {
      source.start(startTime);
    } catch (err) {
      this.sources.delete(source);
      source.onended = null;
      source.disconnect();
      throw err;
    }
    this.nextStartTime = startTime + frames / sampleRate;
    if (start) {
      this.onPlaybackEvent?.({
        event: 'start',
        bytes: alignedLength,
        playbackId,
      });
    }
  }
}
