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

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PcmPlaybackQueue, type PlaybackChunk } from '../src/renderer/audio/pcmPlayback';
import type { PlaybackTelemetryEvent } from '../packages/shared';

function fakeContext() {
  const sources: Array<{
    buffer: ReturnType<typeof createBuffer> | null;
    onended: (() => void) | null;
    when: number | null;
    stopped: boolean;
    disconnected: boolean;
    connect: () => void;
    disconnect: () => void;
    start: (when: number) => void;
    stop: () => void;
  }> = [];
  function createBuffer(channels: number, frames: number, sampleRate: number) {
    const planes = Array.from({ length: channels }, () => new Float32Array(frames));
    return { sampleRate, length: frames, getChannelData: (channel: number) => planes[channel] };
  }
  const context = {
    state: 'running',
    currentTime: 10,
    destination: {},
    sinkId: '',
    createBuffer,
    createBufferSource() {
      const source = {
        buffer: null as ReturnType<typeof createBuffer> | null,
        onended: null as (() => void) | null,
        when: null as number | null,
        stopped: false,
        disconnected: false,
        connect() {},
        disconnect() {
          this.disconnected = true;
        },
        start(when: number) {
          this.when = when;
        },
        stop() {
          this.stopped = true;
        },
      };
      sources.push(source);
      return source;
    },
    async setSinkId(id: string) {
      this.sinkId = id;
    },
    async resume() {
      this.state = 'running';
    },
    async close() {
      this.state = 'closed';
    },
  };
  return { context, sources, asAudioContext: () => context as unknown as AudioContext };
}

function chunk(overrides: Partial<PlaybackChunk> = {}): PlaybackChunk {
  return {
    data: new ArrayBuffer(4800), // 100ms mono @ 24kHz
    format: { sampleRate: 24000, bitsPerSample: 16, channels: 1 },
    playbackId: 7,
    ...overrides,
  };
}

test('stream chunks are scheduled contiguously before any ended callback', async () => {
  const fake = fakeContext();
  const events: PlaybackTelemetryEvent[] = [];
  const player = new PcmPlaybackQueue({
    createContext: fake.asAudioContext,
    onPlaybackEvent: (event) => events.push(event),
  });
  await Promise.all([
    player.enqueue(chunk({ streamStart: true, streamEnd: false })),
    player.enqueue(chunk({ streamStart: false, streamEnd: false })),
    player.enqueue(chunk({ streamStart: false, streamEnd: true })),
  ]);
  assert.equal(fake.sources.length, 3);
  assert.equal(fake.sources[0].when, 10.06);
  assert.equal(fake.sources[1].when, fake.sources[0].when! + 0.1);
  assert.equal(fake.sources[2].when, fake.sources[1].when! + 0.1);
  assert.deepEqual(
    events.map((event) => event.event),
    ['start'],
  );
  fake.sources[0].onended?.();
  fake.sources[1].onended?.();
  assert.equal(events.length, 1);
  fake.sources[2].onended?.();
  assert.deepEqual(
    events.map((event) => event.event),
    ['start', 'complete'],
  );
  assert.equal(events[1].playbackId, 7);
});

test('per-chunk sample rates remain correct without closing previous audio', async () => {
  const fake = fakeContext();
  let creations = 0;
  const player = new PcmPlaybackQueue({
    createContext: () => {
      creations += 1;
      return fake.asAudioContext();
    },
  });
  await Promise.all([
    player.enqueue(chunk()),
    player.enqueue(chunk({ format: { sampleRate: 48000, bitsPerSample: 16, channels: 1 } })),
  ]);
  assert.equal(creations, 1);
  assert.equal(fake.context.state, 'running');
  assert.deepEqual(
    fake.sources.map((source) => source.buffer?.sampleRate),
    [24000, 48000],
  );
  assert.equal(fake.sources[1].when, fake.sources[0].when! + 0.1);
});

test('PCM decoding retains samples and channel order at stream boundaries', async () => {
  const fake = fakeContext();
  const player = new PcmPlaybackQueue({ createContext: fake.asAudioContext });
  await player.enqueue(
    chunk({
      data: new Int16Array([-32768, 16384, 8192, -8192]).buffer,
      format: { sampleRate: 24000, bitsPerSample: 16, channels: 2 },
    }),
  );
  assert.deepEqual(Array.from(fake.sources[0].buffer!.getChannelData(0)), [-1, 0.25]);
  assert.deepEqual(Array.from(fake.sources[0].buffer!.getChannelData(1)), [0.5, -0.25]);
});

test('cancel stops every scheduled source and suppresses completion reports', async () => {
  const fake = fakeContext();
  const events: PlaybackTelemetryEvent[] = [];
  const player = new PcmPlaybackQueue({
    createContext: fake.asAudioContext,
    onPlaybackEvent: (event) => events.push(event),
  });
  await Promise.all([player.enqueue(chunk()), player.enqueue(chunk())]);
  const oldEnded = fake.sources.map((source) => source.onended);
  player.cancel();
  for (const source of fake.sources) {
    assert.equal(source.stopped, true);
    assert.equal(source.disconnected, true);
    assert.equal(source.onended, null);
  }
  oldEnded.forEach((ended) => ended?.());
  assert.equal(events.filter((event) => event.event === 'complete').length, 0);
  await player.enqueue(chunk());
  assert.equal(fake.sources[2].when, 10.06);
});

test('cancel during an asynchronous resume cannot restart stale audio', async () => {
  const fake = fakeContext();
  fake.context.state = 'suspended';
  let resumeEntered!: () => void;
  const entered = new Promise<void>((resolve) => (resumeEntered = resolve));
  let finishResume!: () => void;
  fake.context.resume = () => {
    resumeEntered();
    return new Promise<void>((resolve) => (finishResume = resolve));
  };
  const player = new PcmPlaybackQueue({ createContext: fake.asAudioContext });
  const pending = player.enqueue(chunk());
  await entered;
  player.cancel();
  finishResume();
  await pending;
  assert.equal(fake.sources.length, 0);
});

test('a rejected requested sink never plays through system default', async () => {
  const fake = fakeContext();
  fake.context.setSinkId = async () => {
    throw new Error('device missing');
  };
  const player = new PcmPlaybackQueue({ createContext: fake.asAudioContext });
  await player.selectDevice('blackhole');
  await assert.rejects(player.enqueue(chunk()), /Could not use the selected audio output/);
  assert.equal(fake.sources.length, 0);
});

test('unavailable sink targeting is explicit; default playback still works', async () => {
  const fake = fakeContext();
  Object.defineProperty(fake.context, 'setSinkId', { value: undefined });
  const player = new PcmPlaybackQueue({ createContext: fake.asAudioContext });
  await player.selectDevice('blackhole');
  await assert.rejects(player.enqueue(chunk()), /cannot target/);
  assert.equal(fake.sources.length, 0);
  await player.selectDevice('default');
  await player.enqueue(chunk());
  assert.equal(fake.sources.length, 1);
});

test('changing a device cancels scheduled audio and targets the chosen route', async () => {
  const fake = fakeContext();
  const player = new PcmPlaybackQueue({ createContext: fake.asAudioContext });
  await player.enqueue(chunk());
  await player.selectDevice('blackhole');
  assert.equal(fake.sources[0].stopped, true);
  assert.equal(fake.context.sinkId, 'blackhole');
  await player.enqueue(chunk());
  assert.equal(fake.sources[1].when, 10.06);
});

test('underrun adds a fresh small cushion instead of scheduling in the past', async () => {
  const fake = fakeContext();
  const player = new PcmPlaybackQueue({ createContext: fake.asAudioContext });
  await player.enqueue(chunk());
  fake.context.currentTime = 20;
  await player.enqueue(chunk());
  assert.equal(fake.sources[1].when, 20.06);
});

test('invalid PCM rejects cleanly and does not poison subsequent playback', async () => {
  const fake = fakeContext();
  const player = new PcmPlaybackQueue({ createContext: fake.asAudioContext });
  await assert.rejects(player.enqueue(chunk({ data: new ArrayBuffer(3) })), /invalid 16-bit PCM/);
  await player.enqueue(chunk());
  assert.equal(fake.sources.length, 1);
});

test('PCM samples split between stream packets retain their original values', async () => {
  const fake = fakeContext();
  const events: PlaybackTelemetryEvent[] = [];
  const player = new PcmPlaybackQueue({
    createContext: fake.asAudioContext,
    onPlaybackEvent: (event) => events.push(event),
  });
  const bytes = new Uint8Array(new Int16Array([16384, -8192, -32768]).buffer);
  await player.enqueue(chunk({ data: bytes.slice(0, 1).buffer, streamStart: true, streamEnd: false }));
  assert.equal(fake.sources.length, 0);
  await player.enqueue(chunk({ data: bytes.slice(1, 5).buffer, streamStart: false, streamEnd: false }));
  await player.enqueue(chunk({ data: bytes.slice(5).buffer, streamStart: false, streamEnd: true }));
  assert.deepEqual(Array.from(fake.sources[0].buffer!.getChannelData(0)), [0.5, -0.25]);
  assert.deepEqual(Array.from(fake.sources[1].buffer!.getChannelData(0)), [-1]);
  assert.equal(events.filter((event) => event.event === 'start').length, 1);
  fake.sources[0].onended?.();
  fake.sources[1].onended?.();
  assert.equal(events.filter((event) => event.event === 'complete').length, 1);
});

test('an empty stream end marker completes only after its scheduled audio ends', async () => {
  const fake = fakeContext();
  const events: PlaybackTelemetryEvent[] = [];
  const player = new PcmPlaybackQueue({
    createContext: fake.asAudioContext,
    onPlaybackEvent: (event) => events.push(event),
  });
  await player.enqueue(chunk({ streamStart: true, streamEnd: false }));
  await player.enqueue(chunk({ data: new ArrayBuffer(0), streamStart: false, streamEnd: true }));
  assert.deepEqual(
    events.map((event) => event.event),
    ['start'],
  );
  fake.sources[0].onended?.();
  assert.deepEqual(
    events.map((event) => event.event),
    ['start', 'complete'],
  );
});

test('prepare validates the requested output before any PCM is received', async () => {
  const fake = fakeContext();
  const player = new PcmPlaybackQueue({ createContext: fake.asAudioContext });
  await player.selectDevice('headphones');
  await player.prepare();
  assert.equal(fake.context.sinkId, 'headphones');
  assert.equal(fake.sources.length, 0);
});

test('close invalidates pending routing and future audio uses a new context', async () => {
  const old = fakeContext();
  const fresh = fakeContext();
  let routeEntered!: () => void;
  const entered = new Promise<void>((resolve) => (routeEntered = resolve));
  let finishRoute!: () => void;
  old.context.setSinkId = () => {
    routeEntered();
    return new Promise<void>((resolve) => (finishRoute = resolve));
  };
  let creations = 0;
  const player = new PcmPlaybackQueue({
    createContext: () => (creations++ === 0 ? old.asAudioContext() : fresh.asAudioContext()),
  });
  const pending = player.enqueue(chunk());
  await entered;
  await player.close();
  finishRoute();
  await pending;
  assert.equal(old.sources.length, 0);
  assert.equal(old.context.state, 'closed');
  await player.enqueue(chunk());
  assert.equal(fresh.sources.length, 1);
});
