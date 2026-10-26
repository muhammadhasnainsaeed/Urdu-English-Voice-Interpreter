/*
 * Urdu English Interpreter
 * Copyright (C) 2026 Muhammad Hasnain Saeed
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import type { BrowserWindow } from 'electron';
import type { AudioChunk, ConversationSettings, IncomingEvent, SttEvent } from '../packages/shared/index';
import { IncomingManager } from '../src/main/services/incoming';
import { AudioOutputManager } from '../src/main/services/audio-output/manager';
import { SttSession, sttSession } from '../src/main/services/stt/manager';

const SETTINGS: ConversationSettings = {
  sourceLanguage: 'ur',
  targetLanguage: 'tr',
  incomingEnabled: true,
  incomingSourceLanguage: 'tr',
  incomingTargetLanguage: 'ur',
  incomingDeviceId: 'client-cable',
  listeningDeviceId: 'headphones',
};

async function withMockEnvironment(run: () => Promise<void>): Promise<void> {
  const values: Record<string, string> = {
    STT_PROVIDER: 'mock',
    TRANSLATION_PROVIDER: 'mock',
    TTS_PROVIDER: 'mock',
    PARTIAL_TRANSLATION_ENABLED: 'false',
    STT_FINAL_DEDUPE_WINDOW_MS: '0',
    TTS_DEDUPE_WINDOW_MS: '0',
  };
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function createWindow() {
  const sent: Array<{ channel: string; data?: unknown }> = [];
  const window = {
    isDestroyed: () => false,
    webContents: {
      send(channel: string, data?: unknown) {
        sent.push({ channel, data });
      },
    },
  } as unknown as BrowserWindow;
  return { sent, getWindow: () => window };
}

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, message);
    await delay(10);
  }
}

test('incoming startup requires explicit capture and listening routes', async () => {
  await withMockEnvironment(async () => {
    const manager = new IncomingManager();
    const { sent, getWindow } = createWindow();
    const events: IncomingEvent[] = [];
    try {
      for (const patch of [
        { incomingEnabled: false },
        { incomingDeviceId: null },
        { listeningDeviceId: null },
      ]) {
        const result = await manager.start(
          { ...SETTINGS, ...patch },
          (event) => events.push(event),
          getWindow,
        );
        assert.equal(result.ok, false);
      }
      assert.deepEqual(sent, []);
      assert.deepEqual(events, []);
    } finally {
      await manager.stop();
    }
  });
});

test('mock client speech reaches only incoming captions and incoming audio channels', async () => {
  await withMockEnvironment(async () => {
    const manager = new IncomingManager();
    const { sent, getWindow } = createWindow();
    const events: IncomingEvent[] = [];
    try {
      const result = await manager.start(SETTINGS, (event) => events.push(event), getWindow);
      assert.deepEqual(result, {
        ok: true,
        sttProvider: 'mock',
        translationProvider: 'mock',
        ttsProvider: 'mock',
      });
      manager.pushAudio(new ArrayBuffer(320));
      await waitFor(
        () => sent.some((item) => item.channel === 'incoming-output:audio'),
        'Client PCM never reached its output',
      );

      assert.ok(
        events.some(
          (event) =>
            event.type === 'incoming:stt' &&
            event.event.type === 'final' &&
            event.event.text === 'Sesinizi duyabiliyorum',
        ),
      );
      const translation = events.find(
        (event) => event.type === 'incoming:translation' && event.event.type === 'translation:text',
      );
      assert.ok(
        translation?.type === 'incoming:translation' && translation.event.type === 'translation:text',
      );
      assert.equal(translation.event.sourceLanguage, 'tr');
      assert.equal(translation.event.targetLanguage, 'ur');
      assert.match(translation.event.english, /^\[Mock Urdu\]/);
      assert.ok(sent.every((item) => item.channel.startsWith('incoming-output:')));

      const audio = sent.find((item) => item.channel === 'incoming-output:audio')?.data as AudioChunk;
      assert.ok(audio.data instanceof ArrayBuffer);
      assert.equal(audio.data.byteLength, 9_600);
      assert.deepEqual(audio.format, { sampleRate: 24_000, bitsPerSample: 16, channels: 1 });
      assert.ok(events.some((event) => event.type === 'incoming:status' && event.status === 'active'));
    } finally {
      await manager.stop();
    }
    assert.equal(sent.at(-1)?.channel, 'incoming-output:stop');
    assert.deepEqual(events.at(-1), { type: 'incoming:status', status: 'idle' });
  });
});

test('stop cancels in-flight mock recognition and a fresh start can translate again', async () => {
  await withMockEnvironment(async () => {
    const manager = new IncomingManager();
    const { sent, getWindow } = createWindow();
    const events: IncomingEvent[] = [];
    const emit = (event: IncomingEvent) => events.push(event);
    try {
      assert.equal((await manager.start(SETTINGS, emit, getWindow)).ok, true);
      manager.pushAudio(new ArrayBuffer(320));
      assert.ok(events.some((event) => event.type === 'incoming:stt' && event.event.type === 'partial'));
      await manager.stop();
      const stoppedCount = events.length;
      const sentCount = sent.length;
      manager.pushAudio(new ArrayBuffer(320));
      await delay(500);
      assert.equal(events.length, stoppedCount, 'Stopped recognition emitted a late caption');
      assert.equal(sent.length, sentCount, 'Stopped pipeline emitted late audio');

      assert.equal((await manager.start(SETTINGS, emit, getWindow)).ok, true);
      manager.pushAudio(new ArrayBuffer(320));
      await waitFor(
        () => sent.some((item) => item.channel === 'incoming-output:audio'),
        'Restarted client pipeline did not produce audio',
      );
      assert.equal(sent.filter((item) => item.channel === 'incoming-output:start').length, 2);
    } finally {
      await manager.stop();
    }
  });
});

test('startup failure rolls back output and permits recovery with configured providers', async () => {
  await withMockEnvironment(async () => {
    const manager = new IncomingManager();
    const { sent, getWindow } = createWindow();
    const events: IncomingEvent[] = [];
    const emit = (event: IncomingEvent) => events.push(event);
    try {
      process.env.TTS_PROVIDER = 'unconfigured-provider';
      const failed = await manager.start(SETTINGS, emit, getWindow);
      assert.equal(failed.ok, false);
      assert.match(failed.message ?? '', /No TTS provider/);
      assert.deepEqual(
        sent.map((item) => item.channel),
        ['incoming-output:start', 'incoming-output:stop'],
      );
      assert.ok(events.some((event) => event.type === 'incoming:error'));
      assert.deepEqual(events.at(-1), { type: 'incoming:status', status: 'error' });

      process.env.TTS_PROVIDER = 'mock';
      assert.equal((await manager.start(SETTINGS, emit, getWindow)).ok, true);
      manager.pushAudio(new ArrayBuffer(320));
      await waitFor(
        () => sent.some((item) => item.channel === 'incoming-output:audio'),
        'Pipeline did not recover after failed startup',
      );
    } finally {
      await manager.stop();
    }
  });
});

test('stop aborts mock synthesis before it can emit late client audio', async () => {
  await withMockEnvironment(async () => {
    const manager = new IncomingManager();
    const { sent, getWindow } = createWindow();
    const events: IncomingEvent[] = [];
    try {
      assert.equal((await manager.start(SETTINGS, (event) => events.push(event), getWindow)).ok, true);
      manager.pushAudio(new ArrayBuffer(320));
      await waitFor(
        () =>
          events.some(
            (event) => event.type === 'incoming:translation' && event.event.type === 'translation:text',
          ),
        'Client translation never reached synthesis',
      );
      await manager.stop();
      await delay(300);
      assert.ok(!sent.some((item) => item.channel === 'incoming-output:audio'));
      assert.equal(sent.at(-1)?.channel, 'incoming-output:stop');
      assert.deepEqual(events.at(-1), { type: 'incoming:status', status: 'idle' });
    } finally {
      await manager.stop();
    }
  });
});

test('stop during startup prevents a late active session and allows restart', async (t) => {
  await withMockEnvironment(async () => {
    const manager = new IncomingManager();
    const { sent, getWindow } = createWindow();
    const events: IncomingEvent[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const originalStart = AudioOutputManager.prototype.start;
    const delayedStart = t.mock.method(
      AudioOutputManager.prototype,
      'start',
      async function (this: AudioOutputManager, ...args: Parameters<typeof originalStart>) {
        const result = await originalStart.apply(this, args);
        await gate;
        return result;
      },
    );
    try {
      const starting = manager.start(SETTINGS, (event) => events.push(event), getWindow);
      assert.equal(sent[0]?.channel, 'incoming-output:start');
      const stopping = manager.stop();
      release();
      const canceled = await starting;
      await stopping;
      assert.equal(canceled.ok, false);
      assert.match(canceled.message ?? '', /canceled/);
      assert.ok(!events.some((event) => event.type === 'incoming:status' && event.status === 'active'));
      assert.deepEqual(events.at(-1), { type: 'incoming:status', status: 'idle' });
      assert.ok(!sent.some((item) => item.channel === 'incoming-output:audio'));

      delayedStart.mock.restore();
      assert.equal((await manager.start(SETTINGS, (event) => events.push(event), getWindow)).ok, true);
    } finally {
      release();
      delayedStart.mock.restore();
      await manager.stop();
    }
  });
});

test('incoming stop leaves the outgoing recognizer and speaker output running', async () => {
  await withMockEnvironment(async () => {
    const manager = new IncomingManager();
    const outgoingOutput = new AudioOutputManager();
    const incomingWindow = createWindow();
    const outgoingWindow = createWindow();
    const outgoingEvents: SttEvent[] = [];
    try {
      assert.equal((await sttSession.start((event) => outgoingEvents.push(event), 'tr-TR')).ok, true);
      assert.equal((await outgoingOutput.start(() => {}, outgoingWindow.getWindow)).ok, true);
      assert.equal((await manager.start(SETTINGS, () => {}, incomingWindow.getWindow)).ok, true);
      await manager.stop();

      assert.equal(sttSession.active, true);
      assert.equal(outgoingOutput.isActive, true);
      sttSession.pushAudio(new ArrayBuffer(320));
      await waitFor(
        () => outgoingEvents.some((event) => event.type === 'final'),
        'Incoming stop also stopped outgoing recognition',
      );
      await outgoingOutput.writeAudio({
        data: new ArrayBuffer(320),
        format: { sampleRate: 16_000, bitsPerSample: 16, channels: 1 },
      });
      assert.ok(outgoingWindow.sent.some((item) => item.channel === 'audio-output:audio'));
      assert.ok(!outgoingWindow.sent.some((item) => item.channel === 'audio-output:stop'));
      assert.ok(incomingWindow.sent.every((item) => item.channel.startsWith('incoming-output:')));
    } finally {
      await manager.stop();
      await sttSession.stop();
      outgoingOutput.stop();
    }
  });
});

test('concurrent stops share cleanup and cannot stop a restarted incoming pipeline', async (t) => {
  await withMockEnvironment(async () => {
    const manager = new IncomingManager();
    const { sent, getWindow } = createWindow();
    const events: IncomingEvent[] = [];
    const emit = (event: IncomingEvent) => events.push(event);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const cleanupEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const originalStop = SttSession.prototype.stop;
    let delayedOnce = false;
    const delayedStop = t.mock.method(SttSession.prototype, 'stop', async function (this: SttSession) {
      await originalStop.call(this);
      // Detach the old recognizer, then hold its asynchronous shutdown. A
      // second cleanup used to see no recognizer and incorrectly finish first.
      if (!delayedOnce) {
        delayedOnce = true;
        entered();
        await gate;
      }
    });
    const pending: Promise<void>[] = [];
    try {
      assert.equal((await manager.start(SETTINGS, emit, getWindow)).ok, true);
      const firstStop = manager.stop();
      pending.push(firstStop);
      await cleanupEntered;
      const secondStop = manager.stop();
      pending.push(secondStop);
      assert.equal(secondStop, firstStop, 'Concurrent stops must await the same cleanup');

      let secondFinished = false;
      void secondStop.then(() => {
        secondFinished = true;
      });
      await delay(0);
      assert.equal(secondFinished, false, 'A second stop bypassed the pending recognizer shutdown');
      const prematureRestart = await manager.start(SETTINGS, emit, getWindow);
      assert.equal(prematureRestart.ok, false, 'Restart was allowed before every stop finished');
      assert.deepEqual(events.at(-1), { type: 'incoming:status', status: 'stopping' });

      release();
      await Promise.all(pending);
      delayedStop.mock.restore();
      assert.equal(sent.filter((item) => item.channel === 'incoming-output:stop').length, 1);
      assert.deepEqual(events.at(-1), { type: 'incoming:status', status: 'idle' });

      assert.equal((await manager.start(SETTINGS, emit, getWindow)).ok, true);
      const restartedAt = events.length;
      manager.pushAudio(new ArrayBuffer(320));
      await waitFor(
        () => sent.some((item) => item.channel === 'incoming-output:audio'),
        'The restarted recognizer, translation, or speech output was stopped by old cleanup',
      );
      assert.ok(
        !events
          .slice(restartedAt)
          .some(
            (event) =>
              event.type === 'incoming:status' && ['idle', 'stopping', 'error'].includes(event.status),
          ),
        'Old cleanup changed the restarted pipeline status',
      );
      assert.equal(sent.filter((item) => item.channel === 'incoming-output:start').length, 2);
      assert.equal(sent.filter((item) => item.channel === 'incoming-output:stop').length, 1);
    } finally {
      release();
      await Promise.allSettled(pending);
      delayedStop.mock.restore();
      await manager.stop();
    }
  });
});
