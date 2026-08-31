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

import * as fs from "fs";
import type {
  AudioChunk,
  AudioOutputDevice,
  AudioOutputEvent,
  AudioOutputStartResult,
} from "@shared/index";
import type { AudioOutputProvider } from "./provider";
import { createSystemSpeakerOutput } from "./providers/speaker";
import { pipelineTelemetry } from "../telemetry/pipeline-telemetry";

const BLACKHOLE_HAL_PATHS = [
  "/Library/Audio/Plug-Ins/HAL/BlackHole2ch.driver",
  "/Library/Audio/Plug-Ins/HAL/BlackHole16ch.driver",
  "/Library/Audio/Plug-Ins/HAL/BlackHole64ch.driver",
];

export function detectBlackHole(): boolean {
  if (process.platform !== "darwin") return false;
  try {
    return BLACKHOLE_HAL_PATHS.some((p) => fs.existsSync(p));
  } catch {
    return false;
  }
}

export class AudioOutputManager {
  private provider: AudioOutputProvider | null = null;
  private emit: ((event: AudioOutputEvent) => void) | null = null;
  private active: boolean = false;
  private _selectedDeviceId: string | null = null;

  get isActive(): boolean {
    return this.active;
  }

  get selectedDeviceId(): string | null {
    return this._selectedDeviceId;
  }

  selectDevice(deviceId: string): void {
    this._selectedDeviceId = deviceId;
  }

  getAvailableDevices(): AudioOutputDevice[] {
    const devices: AudioOutputDevice[] = [
      { id: "default", label: "System Default", isDefault: true },
    ];

    if (detectBlackHole()) {
      devices.push({ id: "blackhole", label: "BlackHole", isDefault: false });
    }

    return devices;
  }

  async start(
    emit: (event: AudioOutputEvent) => void,
    getWindow: () => import("electron").BrowserWindow | null
  ): Promise<AudioOutputStartResult> {
    if (this.active) {
      return { ok: false, message: "Audio output is already running." };
    }

    const provider = createSystemSpeakerOutput(getWindow);
    this.provider = provider;
    this.emit = emit;
    this.active = true;

    await provider.start();
    emit({ type: "audio-output:started", provider: provider.name });
    return { ok: true, provider: provider.name };
  }

  async writeAudio(chunk: AudioChunk): Promise<void> {
    if (!this.active || !this.provider) return;
    try {
      await this.provider.writeAudio(chunk);
    } catch {
      // Audio output errors should not crash the TTS pipeline.
    }
  }

  /** Stop current renderer playback and drop queued audio (interruption). */
  cancelPlayback(): void {
    if (!this.active || !this.provider) return;
    try {
      this.provider.cancelPlayback();
    } catch {
      // Cancellation must never break the pipeline.
    }
  }

  stop(): void {
    const provider = this.provider;
    this.provider = null;
    this.emit = null;
    this.active = false;
    pipelineTelemetry.resetPipeline();
    if (provider) {
      provider.stop().catch(() => {});
    }
  }
}
