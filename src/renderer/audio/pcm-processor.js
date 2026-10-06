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
 * AudioWorklet processor for microphone capture (runs on the audio thread).
 *
 * Replaces the deprecated ScriptProcessorNode. Posts each rendered block to
 * the main thread as a transferable Float32Array; batching to the capture
 * cadence happens on the main thread in `pcmTap.ts` (pure, unit-tested).
 *
 * This file is loaded with `audioContext.audioWorklet.addModule()` from
 * `dist/renderer/pcm-processor.js` — it must stay a self-contained script
 * with NO imports or bundle dependencies (worklets cannot resolve the app
 * bundle). Plain JavaScript on purpose: it is copied verbatim by the build.
 */

/* global AudioWorkletProcessor, registerProcessor */

class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }
    const channel = input[0];
    if (!channel || channel.length === 0) {
      return true;
    }
    // Copy: the audio thread reuses the input buffer for the next render
    // quantum. Transfer the copy's buffer to avoid a second copy.
    const block = new Float32Array(channel);
    this.port.postMessage(block, [block.buffer]);
    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
