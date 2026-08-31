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

import type {
  SessionEvent,
  SessionStartResult,
  SessionStatus,
  PipelineStageStatus,
  SttStatus,
  TranslationStatus,
  TtsStatus,
  AudioOutputStatus,
} from "@shared/index";
import type {
  AudioOutputEvent,
  TranslationEvent,
  TtsEvent,
} from "@shared/index";
import type { BrowserWindow } from "electron";
import { sttSession } from "./stt/manager";
import { translationManager } from "../ipc/translation";
import { ttsManager } from "../ipc/tts";
import { audioOutputManager } from "../ipc/audio-output";

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

const DEBUG = process.env.PIPELINE_DEBUG === "1";
const debugT0 = Date.now();
function log(tag: string, ...args: unknown[]): void {
  if (DEBUG) {
    const t = ((Date.now() - debugT0) / 1000).toFixed(3).padStart(8);
    console.log(`${t}s [${tag}]`, ...args);
  }
}

function deriveSttStatus(): SttStatus {
  if (sttSession.active) return "listening";
  return "idle";
}

function deriveTranslationStatus(): TranslationStatus {
  if (translationManager.isActive) return "active";
  return "idle";
}

function deriveTtsStatus(): TtsStatus {
  if (ttsManager.isActive) return "active";
  return "idle";
}

function deriveAudioOutputStatus(): AudioOutputStatus {
  if (audioOutputManager.isActive) return "active";
  return "idle";
}

function getStages(): PipelineStageStatus {
  return {
    stt: deriveSttStatus(),
    translation: deriveTranslationStatus(),
    tts: deriveTtsStatus(),
    audioOutput: deriveAudioOutputStatus(),
  };
}

export class SessionManager {
  private status: SessionStatus = "idle";
  private emitFn: ((event: SessionEvent) => void) | null = null;
  private getWindow: (() => BrowserWindow | null) | null = null;

  get status$(): SessionStatus {
    return this.status;
  }

  setEmitter(emit: (event: SessionEvent) => void): void {
    this.emitFn = emit;
  }

  setWindowGetter(getWindow: () => BrowserWindow | null): void {
    this.getWindow = getWindow;
  }

  private emit(event: SessionEvent): void {
    if (this.emitFn) this.emitFn(event);
  }

  private emitStatus(): void {
    this.emit({ type: "session:status", stages: getStages() });
  }

  private emitStageChange(stage: string, status: string): void {
    this.emit({ type: "session:stage", stage, status });
  }

  private sendToRenderer(channel: string, event: unknown): void {
    const win = this.getWindow?.();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, event);
    }
  }

  /**
   * Emit closure for the translation manager. Forwards events to the renderer
   * AND chains translated text into TTS — same wiring as ipc/translation.ts.
   */
  private createTranslationEmit(): (event: TranslationEvent) => void {
    return (event: TranslationEvent) => {
      log("TRANSLATION", "emit →", event.type, "english" in event ? (event as { english: string }).english : "");
      this.sendToRenderer("translation:event", event);
      if (event.type === "translation:text") {
        log("TRANSLATION", "chaining to TTS:", (event as { english: string }).english);
        ttsManager.onTranslationText(event.english, event.interim === true);
      }
    };
  }

  /** Emit closure for the TTS manager. Forwards events to the renderer. */
  private createTtsEmit(): (event: TtsEvent) => void {
    return (event: TtsEvent) => {
      this.sendToRenderer("tts:event", event);
    };
  }

  /** Emit closure for the audio output manager. Forwards events to the renderer. */
  private createAudioOutputEmit(): (event: AudioOutputEvent) => void {
    return (event: AudioOutputEvent) => {
      this.sendToRenderer("audio-output:event", event);
    };
  }

  /**
   * Start the meeting session. Starts audio output → TTS → translation.
   * STT is started separately by the renderer (needs mic stream).
   */
  async start(): Promise<SessionStartResult> {
    if (this.status === "active" || this.status === "starting") {
      return { ok: false, message: "Session is already active." };
    }

    log("SESSION", "start requested");
    this.status = "starting";
    this.emitStatus();

    let sttProvider: string | undefined;
    let translationProvider: string | undefined;
    let ttsProvider: string | undefined;

    // Stage 1: Audio Output
    try {
      this.emitStageChange("audioOutput", "starting");
      const audioResult = await audioOutputManager.start(
        this.createAudioOutputEmit(),
        this.getWindow ?? (() => null),
      );
      if (!audioResult.ok) {
        throw new Error(audioResult.message);
      }
      ttsProvider = undefined; // audio output has no ttsProvider
      log("SESSION", "audio output started");
      this.emitStageChange("audioOutput", "active");
      this.emitStatus();
    } catch (err) {
      this.status = "error";
      const msg = `Audio output failed to start: ${errMessage(err)}`;
      this.emit({ type: "session:error", message: msg });
      this.emitStatus();
      return { ok: false, message: msg };
    }

    // Stage 2: TTS
    try {
      this.emitStageChange("tts", "starting");
      const ttsResult = await ttsManager.start(
        this.createTtsEmit(),
        audioOutputManager,
      );
      if (!ttsResult.ok) {
        throw new Error(ttsResult.message);
      }
      ttsProvider = ttsResult.provider;
      log("SESSION", "TTS started, provider:", ttsProvider);
      this.emitStageChange("tts", "active");
      this.emitStatus();
    } catch (err) {
      this.status = "error";
      const msg = `TTS failed to start: ${errMessage(err)}`;
      this.emit({ type: "session:error", message: msg });
      // Roll back: stop audio output
      try { audioOutputManager.stop(); } catch { /* best effort */ }
      this.emitStatus();
      return { ok: false, message: msg };
    }

    // Stage 3: Translation
    try {
      this.emitStageChange("translation", "starting");
      const translationResult = await translationManager.start(
        this.createTranslationEmit(),
      );
      if (!translationResult.ok) {
        throw new Error(translationResult.message);
      }
      translationProvider = translationResult.provider;
      log("SESSION", "translation started, provider:", translationProvider);
      this.emitStageChange("translation", "active");
      this.emitStatus();
    } catch (err) {
      this.status = "error";
      const msg = `Translation failed to start: ${errMessage(err)}`;
      this.emit({ type: "session:error", message: msg });
      // Roll back: stop TTS, audio output
      try { ttsManager.stop(); } catch { /* best effort */ }
      try { audioOutputManager.stop(); } catch { /* best effort */ }
      this.emitStatus();
      return { ok: false, message: msg };
    }

    this.status = "active";
    log("SESSION", "session active");
    this.emit({ type: "session:started" });
    this.emitStatus();

    return {
      ok: true,
      sttProvider,
      translationProvider,
      ttsProvider,
    };
  }

  /**
   * Stop the meeting session. Stops STT → translation → TTS → audio output.
   */
  async stop(): Promise<void> {
    if (this.status === "idle" || this.status === "stopping") return;

    this.status = "stopping";
    this.emitStatus();

    // Stop in reverse order: STT → Translation → TTS → Audio Output
    this.emitStageChange("stt", "stopping");
    try { await sttSession.stop(); } catch { /* best effort */ }
    this.emitStageChange("stt", "idle");

    this.emitStageChange("translation", "stopping");
    try { translationManager.stop(); } catch { /* best effort */ }
    this.emitStageChange("translation", "idle");

    this.emitStageChange("tts", "stopping");
    try { ttsManager.stop(); } catch { /* best effort */ }
    this.emitStageChange("tts", "idle");

    this.emitStageChange("audioOutput", "stopping");
    try { audioOutputManager.stop(); } catch { /* best effort */ }
    this.emitStageChange("audioOutput", "idle");

    this.status = "idle";
    this.emit({ type: "session:stopped" });
    this.emitStatus();
  }

  /**
   * Emergency stop — called on app quit. No events emitted.
   */
  emergencyStop(): void {
    this.status = "idle";
    this.emitFn = null;
    try { sttSession.stop(); } catch { /* best effort */ }
    try { translationManager.stop(); } catch { /* best effort */ }
    try { ttsManager.stop(); } catch { /* best effort */ }
    try { audioOutputManager.stop(); } catch { /* best effort */ }
  }

  getStages(): PipelineStageStatus {
    return getStages();
  }
}

export const sessionManager = new SessionManager();
