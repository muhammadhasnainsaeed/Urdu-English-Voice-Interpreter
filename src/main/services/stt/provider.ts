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

export interface SttHandlers {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  /**
   * Optional voice-onset signal used only by latency telemetry. Providers
   * with service-side speech detection (Azure) emit it per detected
   * phrase; providers without one simply omit it and telemetry falls back
   * to first-partial time.
   */
  onSpeechStart?: () => void;
}

export interface SttProvider {
  readonly name: string;
  start(handlers: SttHandlers): Promise<void>;
  pushAudio(buffer: ArrayBuffer): void;
  stop(): Promise<void>;
}

export const STT_SAMPLE_RATE = 16000;
