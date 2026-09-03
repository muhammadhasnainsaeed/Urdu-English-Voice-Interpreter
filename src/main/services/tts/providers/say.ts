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

import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import type { AudioChunk } from '@shared/index';
import type { TtsProvider } from '../provider';

/**
 * Walk RIFF chunks to find the "data" chunk. macOS `say` may insert
 * non-standard chunks (e.g. FLLR padding) before the PCM data, so the
 * audio does not necessarily start at byte 44.
 */
function findDataChunk(buf: Buffer): { offset: number; size: number } {
  if (buf.length < 12) {
    throw new Error('WAV too small to contain RIFF header');
  }
  const riff = buf.toString('ascii', 0, 4);
  if (riff !== 'RIFF') {
    throw new Error(`Expected RIFF header, got "${riff}"`);
  }
  const wave = buf.toString('ascii', 8, 12);
  if (wave !== 'WAVE') {
    throw new Error(`Expected WAVE identifier, got "${wave}"`);
  }

  let pos = 12;
  while (pos + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', pos, pos + 4);
    const chunkSize = buf.readUInt32LE(pos + 4);
    const dataStart = pos + 8;

    if (chunkId === 'data') {
      return { offset: dataStart, size: chunkSize };
    }

    pos = dataStart + chunkSize;
    if (pos % 2 !== 0) pos++; // RIFF chunks are word-aligned
  }

  throw new Error('WAV file does not contain a "data" chunk');
}

function parseWavFormat(header: Buffer): {
  sampleRate: number;
  bitsPerSample: number;
  channels: number;
} {
  return {
    channels: header.readUInt16LE(22),
    sampleRate: header.readUInt32LE(24),
    bitsPerSample: header.readUInt16LE(34),
  };
}

export function createSayTtsProvider(voiceId?: string): TtsProvider {
  const voice = voiceId?.trim() || 'Samantha';

  return {
    name: 'say',

    async synthesize(text: string, signal?: AbortSignal): Promise<AudioChunk> {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tmpFile = path.join(os.tmpdir(), `tts-${id}.wav`);

      try {
        if (signal?.aborted) {
          throw signal.reason;
        }
        await new Promise<void>((resolve, reject) => {
          const child = spawn('say', [
            '-v',
            voice,
            '-r',
            '200',
            '--file-format=WAVE',
            '--data-format=LEI16@24000',
            '-o',
            tmpFile,
            text,
          ]);

          const onAbort = () => {
            // Kill the synthesizer promptly; say plays nothing itself here.
            child.kill('SIGKILL');
            reject(signal!.reason);
          };
          signal?.addEventListener('abort', onAbort, { once: true });

          child.on('error', (err) => {
            signal?.removeEventListener('abort', onAbort);
            reject(err);
          });
          child.on('close', (code) => {
            signal?.removeEventListener('abort', onAbort);
            if (code === 0) resolve();
            else reject(new Error(`say exited with code ${code}`));
          });
        });

        const raw = await fs.promises.readFile(tmpFile);

        const { offset, size } = findDataChunk(raw);

        if (offset + size > raw.length) {
          throw new Error(`data chunk claims ${size} bytes but file is only ${raw.length} bytes`);
        }

        const format = parseWavFormat(raw);
        const pcmData = raw.subarray(offset, offset + size);

        return {
          data: pcmData.buffer.slice(pcmData.byteOffset, pcmData.byteOffset + pcmData.byteLength),
          format,
        };
      } finally {
        await fs.promises.unlink(tmpFile).catch(() => {});
      }
    },

    async stop(): Promise<void> {
      try {
        await new Promise<void>((resolve) => {
          const child = spawn('killall', ['say']);
          child.on('close', () => resolve());
          child.on('error', () => resolve());
        });
      } catch {
        // say may not be running.
      }
    },
  };
}
