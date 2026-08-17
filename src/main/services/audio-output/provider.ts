import type { AudioChunk } from "@shared/index";

export interface AudioOutputProvider {
  readonly name: string;
  start(): Promise<void>;
  writeAudio(chunk: AudioChunk): Promise<void>;
  stop(): Promise<void>;
}
