import { execFile } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import type { AudioChunk } from "@shared/index";
import type { TtsProvider } from "../provider";

const execFileAsync = promisify(execFile);

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
          "-o", tmpFile,
          text,
        ]);

        const raw = await fs.promises.readFile(tmpFile);

        if (raw.length < 44) {
          throw new Error("Say produced an empty or invalid WAV file.");
        }

        const header = raw.subarray(0, 44);
        const format = parseWavFormat(header);
        const pcmData = raw.subarray(44);

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
