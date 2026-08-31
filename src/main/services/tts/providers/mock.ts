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

import type { AudioChunk } from "@shared/index";
import type { TtsProvider } from "../provider";

const MOCK_SAMPLE_RATE = 24000;
const MOCK_DURATION_MS = 200;

export function createMockTtsProvider(): TtsProvider {
  return {
    name: "mock",

    async synthesize(_text: string, signal?: AbortSignal): Promise<AudioChunk> {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, MOCK_DURATION_MS);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(signal.reason);
          },
          { once: true }
        );
      });
      const sampleCount = Math.floor(
        (MOCK_SAMPLE_RATE * MOCK_DURATION_MS) / 1000
      );
      const data = new ArrayBuffer(sampleCount * 2);
      return {
        data,
        format: {
          sampleRate: MOCK_SAMPLE_RATE,
          bitsPerSample: 16,
          channels: 1,
        },
      };
    },

    async stop(): Promise<void> {
      // No-op.
    },
  };
}
