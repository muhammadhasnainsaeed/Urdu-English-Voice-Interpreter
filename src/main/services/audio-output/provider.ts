import type { AudioChunk } from "@shared/index";

export interface AudioOutputProvider {
  readonly name: string;
  start(): Promise<void>;
  writeAudio(chunk: AudioChunk): Promise<void>;
  /** Stop current playback and drop queued audio immediately. */
  cancelPlayback(): void;
  stop(): Promise<void>;
}
