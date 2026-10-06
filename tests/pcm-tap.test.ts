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
 * Unit tests for the pure PCM tap helpers (batching, resampling, Int16).
 *
 * Run:  npx tsx --test tests/pcm-tap.test.ts
 *
 * No DOM, no AudioContext — the AudioWorklet graph itself is exercised by
 * the app smoke test; these cover the math and the batch assembly that the
 * capture path depends on.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createResampler,
  DEFAULT_FLUSH_FRAMES,
  FrameBatcher,
  TARGET_SAMPLE_RATE,
  toInt16Pcm,
} from '../src/renderer/audio/pcmTap';

function sine(frames: number, sampleRate: number, freq = 440, amp = 0.5): Float32Array {
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  FrameBatcher                                                       */
/* ------------------------------------------------------------------ */

test('batches 128-frame blocks up to the flush size', () => {
  const batcher = new FrameBatcher(4096);
  for (let i = 0; i < 31; i++) {
    const batch = batcher.push(new Float32Array(128));
    assert.equal(batch, null, 'nothing should flush before 4096 frames');
  }
  const final = batcher.push(new Float32Array(128));
  assert.ok(final, '32 × 128 = 4096 must flush');
  assert.equal(final.length, 4096);
});

test('batches are sequential, non-overlapping, and lossless', () => {
  const batcher = new FrameBatcher(100);
  const batches: Float32Array[] = [];
  let counter = 0;
  for (let block = 0; block < 7; block++) {
    const frames = new Float32Array(40);
    for (let i = 0; i < 40; i++) frames[i] = counter++;
    const batch = batcher.push(frames);
    if (batch) batches.push(batch);
  }
  const tail = batcher.flush();
  if (tail) batches.push(tail);

  const total = batches.reduce((sum, b) => sum + b.length, 0);
  assert.equal(total, 7 * 40, 'no frame may be dropped or duplicated');

  // Concatenated batches reproduce the original ascending sequence.
  let expected = 0;
  for (const batch of batches) {
    for (const value of batch) {
      assert.equal(value, expected);
      expected += 1;
    }
  }
});

test('push copies the input block (buffers are reused by the audio thread)', () => {
  const batcher = new FrameBatcher(4);
  const block = new Float32Array([1, 2]);
  assert.equal(batcher.push(block), null);
  block[0] = 999; // caller mutates after push
  const block2 = new Float32Array([3, 4]);
  const batch = batcher.push(block2);
  assert.ok(batch);
  assert.deepEqual(Array.from(batch), [1, 2, 3, 4]);
});

test('flush returns pending frames and then empties the batcher', () => {
  const batcher = new FrameBatcher(1000);
  batcher.push(new Float32Array(10));
  const pending = batcher.flush();
  assert.ok(pending);
  assert.equal(pending.length, 10);
  assert.equal(batcher.flush(), null);
});

test('a block at or above the flush size emits immediately', () => {
  const batcher = new FrameBatcher(100);
  const batch = batcher.push(new Float32Array(250));
  assert.ok(batch);
  assert.equal(batch.length, 250);
  assert.equal(batcher.flush(), null);
});

test('empty blocks never produce a batch', () => {
  const batcher = new FrameBatcher(10);
  assert.equal(batcher.push(new Float32Array(0)), null);
  assert.equal(batcher.flush(), null);
});

test('default flush size matches the historical ScriptProcessor cadence', () => {
  assert.equal(DEFAULT_FLUSH_FRAMES, 4096);
  assert.equal(TARGET_SAMPLE_RATE, 16000);
});

/* ------------------------------------------------------------------ */
/*  createResampler                                                    */
/* ------------------------------------------------------------------ */

test('48k → 16k resampling produces one output sample per three inputs', () => {
  const resample = createResampler(48000, 16000);
  const total = resample(sine(48000, 48000));
  assert.ok(Math.abs(total.length - 16000) <= 2, `got ${total.length}`);
});

test('resampling preserves a constant (DC) signal exactly', () => {
  const resample = createResampler(48000, 16000);
  const out = resample(new Float32Array(300).fill(0.25));
  assert.ok(out.length > 0);
  for (const value of out) {
    assert.ok(Math.abs(value - 0.25) < 1e-6, `expected DC 0.25, got ${value}`);
  }
});

test('carry-over tail keeps chunked resampling continuous (no lost frames)', () => {
  const resample = createResampler(48000, 16000);
  let inputFrames = 0;
  let outputFrames = 0;
  for (let i = 0; i < 10; i++) {
    const input = sine(4096, 48000);
    inputFrames += input.length;
    outputFrames += resample(input).length;
  }
  assert.ok(
    Math.abs(outputFrames - inputFrames / 3) <= 2,
    `input ${inputFrames} → output ${outputFrames} (expected ~${inputFrames / 3})`,
  );
});

test('resampling from the same rate is effectively a passthrough', () => {
  const resample = createResampler(16000, 16000);
  const out = resample(new Float32Array([0, 0.5, -0.5, 1]));
  assert.equal(out.length, 4);
  assert.ok(Math.abs(out[1] - 0.5) < 1e-6);
  assert.ok(Math.abs(out[2] + 0.5) < 1e-6);
});

/* ------------------------------------------------------------------ */
/*  toInt16Pcm                                                         */
/* ------------------------------------------------------------------ */

test('converts and clamps Float32 to little-endian Int16', () => {
  const buffer = toInt16Pcm(new Float32Array([0, 1, -1, 0.5, -0.5, 2, -2]));
  const pcm = new Int16Array(buffer);
  assert.equal(pcm.length, 7);
  assert.equal(pcm[0], 0);
  assert.equal(pcm[1], 32767);
  assert.equal(pcm[2], -32768);
  // 0.5 * 32767 = 16383.5 → ToInt16 truncates toward zero.
  assert.equal(pcm[3], 16383);
  assert.equal(pcm[4], -16384);
  assert.equal(pcm[5], 32767, 'above +1.0 clamps');
  assert.equal(pcm[6], -32768, 'below -1.0 clamps');
});

test('output buffer byte length is two bytes per sample', () => {
  const buffer = toInt16Pcm(new Float32Array(1024));
  assert.equal(buffer.byteLength, 2048);
});
