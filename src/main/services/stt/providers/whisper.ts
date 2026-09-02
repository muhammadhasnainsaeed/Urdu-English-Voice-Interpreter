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

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SttHandlers, SttProvider } from '../provider';
import { STT_SAMPLE_RATE } from '../provider';

// Local Whisper provider.
//
// Runs the whisper.cpp `whisper-cli` executable as a child process. This keeps
// all speech processing on the machine (offline, no cloud requests) and avoids
// any Node/Electron ABI coupling with native libraries. Only the existing STT
// IPC surface is used; nothing filesystem-related reaches the renderer.
//
// whisper.cpp is not a true streaming recognizer, so audio is transcribed in
// short windows ("chunks"). A small tail of the previous window is kept as
// context and the leading text that repeats from the running phrase is
// stripped, which keeps transcripts readable and mostly free of duplicates.

const DEFAULT_BASE_DIR = path.join(os.homedir(), '.cache', 'urdu-english-interpreter');
const DEFAULT_EXECUTABLE = path.join(DEFAULT_BASE_DIR, 'whisper.cpp', 'build', 'bin', 'whisper-cli');
const DEFAULT_MODEL = path.join(DEFAULT_BASE_DIR, 'models', 'ggml-base.bin');

const EXECUTABLE_PATH = process.env.WHISPER_EXECUTABLE_PATH || DEFAULT_EXECUTABLE;
const MODEL_PATH = process.env.WHISPER_MODEL_PATH || DEFAULT_MODEL;
// Explicit Urdu by default. Whisper's auto-detection is unreliable on the
// short windows the chunked pipeline feeds it (a 2-3 s Urdu window is often
// mis-detected), so Urdu mode always forces "ur". Language auto-detection is
// still available via WHISPER_LANGUAGE=auto if ever needed.
const LANGUAGE = process.env.WHISPER_LANGUAGE || 'ur';
const THREADS = Math.max(1, Math.min(8, Number(process.env.WHISPER_THREADS) || 4));

// Tune windowing for near-real-time behavior on Apple Silicon (M1, 8 GB RAM):
// - Every CHUNK_MS a window is transcribed if enough new audio arrived.
// - OVERLAP_MS of the previous window is carried over as context so words at
//   chunk boundaries are not lost, then stripped from the result.
// - After IDLE_MS of silence the running phrase is finalized.
const CHUNK_MS = 2000;
const OVERLAP_MS = 1000;
const IDLE_MS = 1200;
const MIN_SAMPLES = Math.floor(STT_SAMPLE_RATE * 0.5);
const OVERLAP_SAMPLES = Math.floor((STT_SAMPLE_RATE * OVERLAP_MS) / 1000);
const MAX_SAMPLES = STT_SAMPLE_RATE * 30; // cap buffer to bound memory
const RUN_TIMEOUT_MS = 12000;

// Energy gate. whisper-cli forced to Urdu hallucinates slow, repeated garbage
// when fed windows that contain little or no speech (mic hiss, room noise,
// faint audio). Windows whose new-audio RMS is below the gate threshold are
// dropped before Whisper ever sees them. Thresholds are Int16 RMS: normal
// speech is typically 2000-12000, room noise 50-500, faint background speech
// 1000-2000. The base sits just above quiet-room ambient so real speech of any
// level (even a soft voice on a quiet mic, measured down to ~500 RMS on real
// captures) passes on the very first window. Because microphone levels vary a
// lot the threshold starts at BASE_ENERGY_SKIP_RMS and only ratchets DOWN
// (never up) on each consecutive skip, down to ENERGY_FLOOR_RMS — so a
// whisper-quiet mic is still heard instead of being silently dropped. It
// resets to the base at the start of every session. Windows that slip past the
// gate with faint/background speech are bounded by RUN_TIMEOUT_MS (the
// forced-language hallucination decodes very slowly and is killed there).
const BASE_ENERGY_SKIP_RMS = 500;
const ENERGY_FLOOR_RMS = 200;
const ENERGY_SKIP_RATCHET_AFTER = 1;
const ENERGY_SKIP_RATCHET_FACTOR = 0.85;

// Per-window gain normalization. Quiet input (soft voice, far mic) is boosted
// toward a healthy level so whisper's features match its training
// distribution. Loud windows are left untouched (gain clamps at 1.0).
const NORMALIZE_TARGET_RMS = 6000;
const NORMALIZE_MAX_GAIN = 8;

interface Segment {
  startSec: number;
  endSec: number;
  text: string;
}

const SEGMENT_RE = /^\[(\d{2}):(\d{2}):(\d{2})\.(\d{3}) --> (\d{2}):(\d{2}):(\d{2})\.(\d{3})\]\s*(.*)$/;

function parseSegments(stdout: string): Segment[] {
  const segments: Segment[] = [];
  for (const line of stdout.split('\n')) {
    const match = SEGMENT_RE.exec(line.trim());
    if (!match) continue;
    const toSeconds = (h: string, m: string, s: string, ms: string) =>
      Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
    const text = match[9].trim();
    if (!text) continue;
    segments.push({
      startSec: toSeconds(match[1], match[2], match[3], match[4]),
      endSec: toSeconds(match[5], match[6], match[7], match[8]),
      text,
    });
  }
  return segments;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function cleanWord(word: string): string {
  return word.replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, '');
}

// Strip any leading words of `text` that repeat the tail of the running
// phrase. whisper.cpp may transcribe the overlap context again; without this
// the same words would appear twice across consecutive windows. Tolerates
// an inflection mismatch at the exact overlap boundary (e.g. "ہوں" vs "ہم")
// when every preceding word matches exactly and both words start with the
// same character — which is the common Urdu-verb-inflection pattern.
function stripRepeated(text: string, phrase: string): string {
  const trimmed = normalize(text);
  if (!trimmed) return '';
  if (!phrase) return trimmed;
  const phraseWords = normalize(phrase).split(' ').map(cleanWord);
  const words = trimmed.split(' ');
  for (let i = Math.min(words.length, 6); i >= 1; i--) {
    const candidate = words.slice(0, i).map(cleanWord);
    if (candidate.length === 0) continue;
    const tail = phraseWords.slice(-candidate.length);
    if (candidate.join(' ') === tail.join(' ')) {
      return words.slice(i).join(' ');
    }
    if (candidate.length >= 2) {
      const allButLast = candidate.slice(0, -1).join(' ') === tail.slice(0, -1).join(' ');
      const lastFirstChar =
        [...(candidate[candidate.length - 1] || '')][0] === [...(tail[tail.length - 1] || '')][0];
      if (allButLast && lastFirstChar) return words.slice(i).join(' ');
    }
  }
  return trimmed;
}

function encodeWav(samples: Int16Array): Buffer {
  const bytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + bytes);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + bytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(STT_SAMPLE_RATE, 24);
  buffer.writeUInt32LE(STT_SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(bytes, 40);
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], 44 + i * 2);
  }
  return buffer;
}

// Boost quiet input toward a healthy level for whisper's features. Loud
// windows are returned unchanged (gain clamps at 1.0). Verified on real mic
// captures: faint speech (RMS ~600) transcribed noticeably better after a 4x
// boost, while already-normal audio is unaffected.
function normalizeSamples(samples: Int16Array): Int16Array {
  const length = samples.length;
  if (length === 0) return samples;
  let sum = 0;
  for (let i = 0; i < length; i++) {
    const v = samples[i];
    sum += v * v;
  }
  const rms = Math.sqrt(sum / length);
  if (rms === 0 || rms >= NORMALIZE_TARGET_RMS) return samples;
  const gain = Math.min(NORMALIZE_MAX_GAIN, NORMALIZE_TARGET_RMS / rms);
  if (gain <= 1.0001) return samples;
  const scaled = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const v = Math.round(samples[i] * gain);
    scaled[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
  }
  return scaled;
}

function transcribeFile(wavPath: string): Promise<Segment[]> {
  return new Promise((resolve, reject) => {
    execFile(
      EXECUTABLE_PATH,
      ['-m', MODEL_PATH, '-f', wavPath, '-l', LANGUAGE, '-t', String(THREADS), '-np'],
      { timeout: RUN_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          const stderr =
            String(error.message || '')
              .split('\n')
              .pop() ?? '';
          const detail = error.killed ? 'timed out' : stderr.trim();
          reject(new Error(`Local Whisper transcription failed${detail ? `: ${detail}` : '.'}`));
          return;
        }
        resolve(parseSegments(stdout));
      },
    );
  });
}

export function createWhisperSttProvider(): SttProvider {
  let handlers: SttHandlers | null = null;
  let pending: Int16Array[] = [];
  let pendingSamples = 0;
  let tail = new Int16Array(0);
  let phrase = '';
  let busy = false;
  let lastAudioTime = 0;
  let lastSpeechTime = 0;
  let flusher: NodeJS.Timeout | null = null;
  let tempCounter = 0;
  let consecutiveFailures = 0;
  let consecutiveSkips = 0;
  let energySkipRms = BASE_ENERGY_SKIP_RMS;

  const resetContext = () => {
    pending = [];
    pendingSamples = 0;
    tail = new Int16Array(0);
    phrase = '';
    busy = false;
  };

  const stopInternal = () => {
    if (flusher) {
      clearInterval(flusher);
      flusher = null;
    }
  };

  const concatSamples = (first: Int16Array, second: Int16Array): Int16Array => {
    const combined = new Int16Array(first.length + second.length);
    combined.set(first);
    combined.set(second, first.length);
    return combined;
  };

  const takePending = (): Int16Array => {
    const combined = new Int16Array(pendingSamples);
    let offset = 0;
    for (const chunk of pending) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    pending = [];
    pendingSamples = 0;
    return combined;
  };

  // RMS of the currently buffered new audio (the part that has not yet been
  // transcribed). Used by the energy gate to avoid feeding silence to Whisper.
  const pendingRms = (): number => {
    if (pendingSamples === 0) return 0;
    let sum = 0;
    for (const chunk of pending) {
      for (let i = 0; i < chunk.length; i++) {
        sum += chunk[i] * chunk[i];
      }
    }
    return Math.sqrt(sum / pendingSamples);
  };

  const pushSamples = (samples: Int16Array) => {
    pending.push(samples);
    pendingSamples += samples.length;
    let excess = pendingSamples - MAX_SAMPLES;
    while (excess > 0 && pending.length > 0) {
      const first = pending[0];
      if (first.length <= excess) {
        pending.shift();
        pendingSamples -= first.length;
        excess -= first.length;
      } else {
        pending[0] = first.slice(excess);
        pendingSamples -= excess;
        excess = 0;
      }
    }
  };

  const transcribeToText = async (input: Int16Array, overlapSec: number): Promise<string> => {
    const tempFile = path.join(os.tmpdir(), `urdu-interpreter-whisper-${process.pid}-${++tempCounter}.wav`);
    try {
      await fs.writeFile(tempFile, encodeWav(normalizeSamples(input)));
      const segments = await transcribeFile(tempFile);
      const kept = segments
        .filter((segment) => segment.endSec > overlapSec)
        .map((segment) => segment.text)
        .join(' ')
        .trim()
        .replace(/\[[A-Z_]+\]/g, '')
        .trim();
      return kept;
    } finally {
      fs.unlink(tempFile).catch(() => undefined);
    }
  };

  const flush = async (forcedFinal: boolean) => {
    if (!handlers || busy) return;
    const idle = forcedFinal || Date.now() - lastAudioTime >= IDLE_MS;
    const speechIdle = Date.now() - lastSpeechTime >= IDLE_MS;

    if (pendingSamples < MIN_SAMPLES) {
      if (idle) {
        if (phrase) {
          handlers.onFinal(phrase);
          phrase = '';
        }
        resetContext();
      }
      return;
    }

    // Energy gate: drop windows whose new audio is below the speech-energy
    // threshold. Whisper forced to Urdu hallucinates on such windows.
    if (pendingRms() < energySkipRms) {
      consecutiveSkips++;
      if (consecutiveSkips >= ENERGY_SKIP_RATCHET_AFTER) {
        energySkipRms = Math.max(ENERGY_FLOOR_RMS, Math.floor(energySkipRms * ENERGY_SKIP_RATCHET_FACTOR));
      }
      if ((idle || speechIdle) && phrase) {
        handlers.onFinal(phrase);
        phrase = '';
      }
      resetContext();
      return;
    }
    consecutiveSkips = 0;
    lastSpeechTime = Date.now();

    busy = true;
    try {
      // Non-idle windows carry the previous window's tail as whisper context
      // (overlap + dedup keep text from repeating). Once a phrase goes idle we
      // transcribe the trailing audio WITHOUT the tail so finalized text is
      // not re-emitted with duplicates.
      const useTail = !idle;
      const input = useTail ? concatSamples(tail, takePending()) : takePending();
      const keepTail =
        useTail && input.length > OVERLAP_SAMPLES
          ? input.slice(input.length - OVERLAP_SAMPLES)
          : new Int16Array(0);
      const overlapSec = useTail ? OVERLAP_SAMPLES / STT_SAMPLE_RATE : 0;
      const text = await transcribeToText(input, overlapSec);
      const extra = stripRepeated(text, phrase);
      tail = keepTail;
      if (extra) {
        phrase = phrase ? `${phrase} ${extra}` : extra;
      }
      if (idle) {
        if (phrase) {
          handlers.onFinal(phrase);
          phrase = '';
        }
        tail = new Int16Array(0);
      } else if (extra) {
        handlers.onPartial(phrase);
      }
      consecutiveFailures = 0;
    } catch (err) {
      // A single slow window (forced-language whisper.cpp can decode
      // pathologically slowly on some audio) should not kill the session.
      // Skip the window and keep going; only hard-stop after repeated
      // failures, which indicates a broken engine rather than a slow window.
      consecutiveFailures++;
      resetContext();
      if (consecutiveFailures >= 3) {
        stopInternal();
        handlers.onError(err instanceof Error ? err.message : 'Local Whisper transcription failed.');
        handlers = null;
      }
    } finally {
      busy = false;
    }
  };

  return {
    name: 'whisper',

    async start(active: SttHandlers) {
      await fs.access(EXECUTABLE_PATH).catch(() => {
        throw new Error(
          `whisper-cli not found at ${EXECUTABLE_PATH}. Run "npm run setup:whisper" to build the local Whisper engine, or set WHISPER_EXECUTABLE_PATH in .env.`,
        );
      });
      await fs.access(MODEL_PATH).catch(() => {
        throw new Error(
          `Whisper model not found at ${MODEL_PATH}. Run "npm run setup:whisper" to download it, or set WHISPER_MODEL_PATH in .env.`,
        );
      });

      handlers = active;
      resetContext();
      consecutiveFailures = 0;
      consecutiveSkips = 0;
      energySkipRms = BASE_ENERGY_SKIP_RMS;
      lastAudioTime = Date.now();
      lastSpeechTime = Date.now();
      flusher = setInterval(() => {
        flush(false).catch(() => undefined);
      }, CHUNK_MS);
    },

    pushAudio(buffer: ArrayBuffer) {
      const bytes = buffer.byteLength - (buffer.byteLength % 2);
      if (bytes <= 0) return;
      const samples = new Int16Array(buffer.slice(0, bytes));
      pushSamples(samples);
      lastAudioTime = Date.now();
    },

    async stop() {
      stopInternal();
      while (busy) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      try {
        await flush(true);
      } catch {
        // Ignore; the session is ending.
      }
      handlers = null;
      resetContext();
    },
  };
}
