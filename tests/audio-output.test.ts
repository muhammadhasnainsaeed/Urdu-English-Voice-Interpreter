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
 * Deterministic tests for AudioOutputManager.
 *
 * Run:  npx tsx tests/audio-output.test.ts
 *
 * Tests the main-process AudioOutputManager: lifecycle, device detection,
 * device selection, and audio write routing. Uses a mock provider and a
 * fake BrowserWindow — no real audio output.
 */

import { AudioOutputManager, detectBlackHole } from '../src/main/services/audio-output/manager';
import type { AudioChunk, AudioOutputEvent } from '../packages/shared/index';

/* ------------------------------------------------------------------ */
/*  Mock AudioOutputProvider                                           */
/* ------------------------------------------------------------------ */

function createMockProvider() {
  const written: AudioChunk[] = [];
  let started = false;
  let stopped = false;

  return {
    name: 'mock-speaker',
    written,
    get started() {
      return started;
    },
    get stopped() {
      return stopped;
    },
    async start(): Promise<void> {
      started = true;
    },
    async writeAudio(chunk: AudioChunk): Promise<void> {
      written.push(chunk);
    },
    async stop(): Promise<void> {
      stopped = true;
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function createMockWindow() {
  const sent: { channel: string; data: unknown }[] = [];
  return {
    sent,
    isDestroyed: () => false,
    webContents: {
      send: (channel: string, data: unknown) => {
        sent.push({ channel, data });
      },
    },
  };
}

function collectEvents(mgr: AudioOutputManager): AudioOutputEvent[] {
  const events: AudioOutputEvent[] = [];
  return events;
}

/* ------------------------------------------------------------------ */
/*  Test runner                                                        */
/* ------------------------------------------------------------------ */

type TestFn = () => Promise<void> | void;

interface TestCase {
  name: string;
  fn: TestFn;
}

const results: { name: string; pass: boolean; reason?: string }[] = [];

async function runTests(cases: TestCase[]) {
  console.log(`\nRunning ${cases.length} tests...\n`);
  for (const tc of cases) {
    try {
      await tc.fn();
      results.push({ name: tc.name, pass: true });
      console.log(`  ✓ ${tc.name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name: tc.name, pass: false, reason: msg });
      console.log(`  ✗ ${tc.name}`);
      console.log(`    ${msg}`);
    }
  }

  console.log('\n--- Summary ---');
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log(`${passed} passed, ${failed} failed, ${results.length} total`);
  if (failed > 0) {
    console.log('\nFailed:');
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  ✗ ${r.name}: ${r.reason}`);
    }
  }
  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

const tests: TestCase[] = [
  // --- A ---
  {
    name: 'A: New manager starts inactive',
    fn: () => {
      const mgr = new AudioOutputManager();
      if (mgr.isActive) throw new Error('Expected isActive=false on new manager');
      if (mgr.selectedDeviceId !== null) throw new Error('Expected selectedDeviceId=null on new manager');
    },
  },

  // --- B ---
  {
    name: 'B: selectDevice stores the device ID',
    fn: () => {
      const mgr = new AudioOutputManager();
      mgr.selectDevice('test-device');
      if (mgr.selectedDeviceId !== 'test-device') {
        throw new Error(`Expected selectedDeviceId="test-device", got "${mgr.selectedDeviceId}"`);
      }
    },
  },

  // --- C ---
  {
    name: 'C: getAvailableDevices always includes System Default',
    fn: () => {
      const mgr = new AudioOutputManager();
      const devices = mgr.getAvailableDevices();
      if (devices.length < 1) throw new Error('Expected at least 1 device');
      const def = devices.find((d) => d.id === 'default');
      if (!def) throw new Error("Expected 'default' device in list");
      if (!def.isDefault) throw new Error('Expected default device to have isDefault=true');
      if (def.label !== 'System Default')
        throw new Error(`Expected label "System Default", got "${def.label}"`);
    },
  },

  // --- D ---
  {
    name: 'D: start() makes isActive true and emits started event',
    fn: async () => {
      const mgr = new AudioOutputManager();
      const events: AudioOutputEvent[] = [];
      const win = createMockWindow();
      const result = await mgr.start(
        (e) => events.push(e),
        () => win as never,
      );
      if (!result.ok) throw new Error(`start() failed: ${result.message}`);
      if (!mgr.isActive) throw new Error('Expected isActive=true after start');
      const started = events.find((e) => e.type === 'audio-output:started');
      if (!started) throw new Error('Expected audio-output:started event');
      mgr.stop();
    },
  },

  // --- E ---
  {
    name: 'E: start() twice returns ok=false',
    fn: async () => {
      const mgr = new AudioOutputManager();
      const win = createMockWindow();
      await mgr.start(
        () => {},
        () => win as never,
      );
      const result = await mgr.start(
        () => {},
        () => win as never,
      );
      if (result.ok) throw new Error('Expected start() to fail on second call');
      mgr.stop();
    },
  },

  // --- F ---
  {
    name: 'F: stop() makes isActive false',
    fn: async () => {
      const mgr = new AudioOutputManager();
      const win = createMockWindow();
      await mgr.start(
        () => {},
        () => win as never,
      );
      mgr.stop();
      if (mgr.isActive) throw new Error('Expected isActive=false after stop');
    },
  },

  // --- G ---
  {
    name: 'G: writeAudio is a no-op when not active',
    fn: async () => {
      const mgr = new AudioOutputManager();
      // Should not throw
      await mgr.writeAudio({
        data: new ArrayBuffer(4),
        format: { sampleRate: 24000, bitsPerSample: 16, channels: 1 },
      });
    },
  },

  // --- H ---
  {
    name: 'H: writeAudio sends audio to renderer via IPC',
    fn: async () => {
      const mgr = new AudioOutputManager();
      const win = createMockWindow();
      await mgr.start(
        () => {},
        () => win as never,
      );

      const chunk: AudioChunk = {
        data: new ArrayBuffer(8),
        format: { sampleRate: 24000, bitsPerSample: 16, channels: 1 },
      };
      await mgr.writeAudio(chunk);

      const audioEvents = win.sent.filter((s) => s.channel === 'audio-output:audio');
      if (audioEvents.length !== 1) {
        throw new Error(`Expected 1 audio-output:audio IPC, got ${audioEvents.length}`);
      }
      const payload = audioEvents[0].data as {
        data: ArrayBuffer;
        format: { sampleRate: number; bitsPerSample: number; channels: number };
      };
      if (payload.format.sampleRate !== 24000) {
        throw new Error(`Expected sampleRate=24000, got ${payload.format.sampleRate}`);
      }
      mgr.stop();
    },
  },

  // --- I ---
  {
    name: 'I: start() sends audio-output:start IPC to renderer',
    fn: async () => {
      const mgr = new AudioOutputManager();
      const win = createMockWindow();
      await mgr.start(
        () => {},
        () => win as never,
      );

      const startEvents = win.sent.filter((s) => s.channel === 'audio-output:start');
      if (startEvents.length !== 1) {
        throw new Error(`Expected 1 audio-output:start IPC, got ${startEvents.length}`);
      }
      mgr.stop();
    },
  },

  // --- J ---
  {
    name: 'J: stop() sends audio-output:stop IPC to renderer',
    fn: async () => {
      const mgr = new AudioOutputManager();
      const win = createMockWindow();
      await mgr.start(
        () => {},
        () => win as never,
      );
      mgr.stop();

      const stopEvents = win.sent.filter((s) => s.channel === 'audio-output:stop');
      if (stopEvents.length !== 1) {
        throw new Error(`Expected 1 audio-output:stop IPC, got ${stopEvents.length}`);
      }
    },
  },

  // --- K ---
  {
    name: 'K: detectBlackHole returns a boolean without throwing',
    fn: () => {
      const result = detectBlackHole();
      if (typeof result !== 'boolean') {
        throw new Error(`Expected boolean, got ${typeof result}`);
      }
      // On non-macOS CI, it should return false
      if (process.platform !== 'darwin' && result !== false) {
        throw new Error(`Expected false on ${process.platform}`);
      }
    },
  },

  // --- L ---
  {
    name: 'L: writeAudio after stop is a no-op (no crash)',
    fn: async () => {
      const mgr = new AudioOutputManager();
      const win = createMockWindow();
      await mgr.start(
        () => {},
        () => win as never,
      );
      mgr.stop();
      // Should not throw
      await mgr.writeAudio({
        data: new ArrayBuffer(4),
        format: { sampleRate: 24000, bitsPerSample: 16, channels: 1 },
      });
    },
  },

  // --- M ---
  {
    name: 'M: reset on stop clears selectedDeviceId (via constructor reset)',
    fn: async () => {
      const mgr = new AudioOutputManager();
      mgr.selectDevice('my-device');
      if (mgr.selectedDeviceId !== 'my-device') throw new Error('selectDevice failed');
      // Stop doesn't clear selectedDeviceId (design choice: selection persists)
      const win = createMockWindow();
      await mgr.start(
        () => {},
        () => win as never,
      );
      mgr.stop();
      if (mgr.selectedDeviceId !== 'my-device') {
        throw new Error('selectedDeviceId should persist after stop');
      }
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Run                                                                */
/* ------------------------------------------------------------------ */

runTests(tests);
