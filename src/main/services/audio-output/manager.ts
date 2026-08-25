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
