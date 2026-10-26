/*
 * Urdu English Interpreter
 * Copyright (C) 2026 Muhammad Hasnain Saeed
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AudioChunk, TtsEvent } from '../packages/shared/index';
import { TtsManager } from '../src/main/services/tts/manager';
import type { TtsProvider } from '../src/main/services/tts/provider';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const chunk = (value: number): AudioChunk => ({
  data: Uint8Array.from([value, 0]).buffer,
  format: { sampleRate: 24000, channels: 1, bitsPerSample: 16 },
});

function outputRecorder() {
  const writes: AudioChunk[] = [];
  let canceled = 0;
  return {
    writes,
    get canceled() {
      return canceled;
    },
    manager: {
      writeAudio: async (value: AudioChunk) => {
        writes.push(value);
      },
      cancelPlayback: () => {
        canceled++;
      },
    },
  };
}

test('conversation queue preserves both rapid final sentences and never cancels the first stream', async () => {
  const output = outputRecorder();
  const firstChunk = deferred();
  const finishFirst = deferred();
  const finished = deferred();
  const events: TtsEvent[] = [];
  const provider: TtsProvider = {
    name: 'fixture',
    synthesize: async () => chunk(9),
    synthesizeStream: async (text, onChunk, signal) => {
      await onChunk(chunk(text === 'first sentence' ? 1 : 3), false);
      if (text === 'first sentence') {
        firstChunk.resolve();
        await finishFirst.promise;
        assert.equal(signal?.aborted, false);
      }
      await onChunk(chunk(text === 'first sentence' ? 2 : 4), true);
    },
    stop: async () => {},
  };
  const manager = new TtsManager(0, false, 'queue');
  await manager.start(
    (event) => {
      events.push(event);
      if (event.type === 'tts:spoken' && event.text === 'second sentence') finished.resolve();
    },
    output.manager as never,
    provider,
  );
  try {
    manager.onTranslationText('first sentence');
    await firstChunk.promise;
    manager.onTranslationText('second sentence');
    assert.equal(manager.queueLength, 1);
    assert.equal(output.canceled, 0);
    finishFirst.resolve();
    await finished.promise;
    assert.deepEqual(
      output.writes.map((item) => new Uint8Array(item.data)[0]),
      [1, 2, 3, 4],
    );
    assert.deepEqual(
      output.writes.map((item) => item.playbackId),
      [1, 1, 2, 2],
    );
    assert.equal(
      events.some((event) => event.type === 'tts:interrupted'),
      false,
    );
    assert.equal(output.canceled, 0);
  } finally {
    finishFirst.resolve();
    manager.stop();
  }
});

test('conversation backlog overflow reports an error and retains every accepted sentence in order', async () => {
  const output = outputRecorder();
  const releaseFirst = deferred();
  const drained = deferred();
  const spoken: string[] = [];
  const errors: string[] = [];
  const provider: TtsProvider = {
    name: 'fixture',
    synthesize: async (text) => {
      if (text === 'sentence 0') await releaseFirst.promise;
      return chunk(Number(text.split(' ')[1]));
    },
    stop: async () => {},
  };
  const manager = new TtsManager(0, false, 'queue');
  await manager.start(
    (event) => {
      if (event.type === 'tts:error') errors.push(event.message);
      if (event.type === 'tts:spoken') {
        spoken.push(event.text);
        if (spoken.length === 21) drained.resolve();
      }
    },
    output.manager as never,
    provider,
  );
  try {
    manager.onTranslationText('sentence 0');
    for (let i = 1; i <= 21; i++) manager.onTranslationText(`sentence ${i}`);
    assert.equal(manager.queueLength, 20);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /not played.*captions/);
    releaseFirst.resolve();
    await drained.promise;
    assert.deepEqual(
      spoken,
      Array.from({ length: 21 }, (_, i) => `sentence ${i}`),
    );
    assert.equal(output.canceled, 0);
  } finally {
    releaseFirst.resolve();
    manager.stop();
  }
});

test('a legacy synthesis that ignores abort cannot write into a restarted session', async () => {
  const oldOutput = outputRecorder();
  const newOutput = outputRecorder();
  const finishOld = deferred();
  const finishNew = deferred();
  const newSpoken = deferred();
  const legacy = (gate: ReturnType<typeof deferred>, value: number): TtsProvider => ({
    name: 'legacy-fixture',
    synthesize: async () => {
      await gate.promise;
      return chunk(value);
    },
    stop: async () => {},
  });
  const manager = new TtsManager(0, false, 'queue');
  await manager.start(() => {}, oldOutput.manager as never, legacy(finishOld, 1));
  manager.onTranslationText('old sentence');
  manager.stop();
  await manager.start(
    (event) => {
      if (event.type === 'tts:spoken') newSpoken.resolve();
    },
    newOutput.manager as never,
    legacy(finishNew, 2),
  );
  try {
    manager.onTranslationText('new sentence');
    finishOld.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(manager.isSpeaking, true);
    assert.equal(oldOutput.writes.length, 0);
    assert.equal(newOutput.writes.length, 0);
    finishNew.resolve();
    await newSpoken.promise;
    assert.deepEqual(
      newOutput.writes.map((item) => new Uint8Array(item.data)[0]),
      [2],
    );
  } finally {
    finishOld.resolve();
    finishNew.resolve();
    manager.stop();
  }
});

test('conversation backlog includes already scheduled speech and completion frees capacity', async () => {
  const output = outputRecorder();
  const errors: string[] = [];
  const manager = new TtsManager(0, false, 'queue');
  await manager.start(
    (event) => {
      if (event.type === 'tts:error') errors.push(event.message);
    },
    output.manager as never,
    {
      name: 'fast-fixture',
      synthesize: async () => chunk(1),
      stop: async () => {},
    },
  );
  try {
    for (let i = 0; i < 21; i++) {
      manager.onTranslationText(`sentence ${i}`);
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(manager.queueLength, 0, 'synthesis queue drained, renderer still has all speech');
    manager.onTranslationText('too much scheduled speech');
    assert.equal(errors.length, 1);
    assert.equal(output.writes.length, 21);
    manager.handlePlaybackLifecycle({ event: 'complete', playbackId: output.writes[0].playbackId, bytes: 2 });
    manager.onTranslationText('capacity restored');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(output.writes.length, 22);
  } finally {
    manager.stop();
  }
});
