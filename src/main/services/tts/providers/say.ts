import { execFile } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import type { AudioChunk } from "@shared/index";
import type { TtsProvider } from "../provider";

const execFileAsync = promisify(execFile);

/**
 * Walk RIFF chunks to find the "data" chunk. macOS `say` may insert
 * non-standard chunks (e.g. FLLR padding) before the PCM data, so the
 * audio does not necessarily start at byte 44.
 */
function findDataChunk(buf: Buffer): { offset: number; size: number } {
  if (buf.length < 12) {
    throw new Error("WAV too small to contain RIFF header");
  }
  const riff = buf.toString("ascii", 0, 4);
  if (riff !== "RIFF") {
    throw new Error(`Expected RIFF header, got "${riff}"`);
  }
  const wave = buf.toString("ascii", 8, 12);
  if (wave !== "WAVE") {
    throw new Error(`Expected WAVE identifier, got "${wave}"`);
  }

  let pos = 12;
  while (pos + 8 <= buf.length) {
    const chunkId = buf.toString("ascii", pos, pos + 4);
    const chunkSize = buf.readUInt32LE(pos + 4);
    const dataStart = pos + 8;

    if (chunkId === "data") {
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

export function createSayTtsProvider(): TtsProvider {
  return {
    name: "say",

    async synthesize(text: string): Promise<AudioChunk> {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tmpFile = path.join(os.tmpdir(), `tts-${id}.wav`);

      try {
        await execFileAsync("say", [
          "-v", "Samantha",
          "-r", "200",
          "--file-format=WAVE",
          "--data-format=LEI16@24000",
          "-o", tmpFile,
          text,
        ]);

        const raw = await fs.promises.readFile(tmpFile);

        const { offset, size } = findDataChunk(raw);

        if (offset + size > raw.length) {
          throw new Error(
            `data chunk claims ${size} bytes but file is only ${raw.length} bytes`
          );
        }

        const format = parseWavFormat(raw);
        const pcmData = raw.subarray(offset, offset + size);

        return {
          data: pcmData.buffer.slice(
            pcmData.byteOffset,
            pcmData.byteOffset + pcmData.byteLength
          ),
          format,
        };
      } finally {
        await fs.promises.unlink(tmpFile).catch(() => {});
      }
    },

    async stop(): Promise<void> {
      try {
        await execFileAsync("killall", ["say"]);
      } catch {
        // say may not be running.
      }
    },
  };
}
