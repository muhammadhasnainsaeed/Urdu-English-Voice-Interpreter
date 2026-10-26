/*
 * Urdu English Interpreter
 * Copyright (C) 2026 Muhammad Hasnain Saeed
 * SPDX-License-Identifier: GPL-3.0-only
 */
import type { BrowserWindow } from 'electron';
import type {
  ConversationSettings,
  IncomingEvent,
  SessionStartResult,
  PlaybackTelemetryEvent,
} from '@shared/index';
import { requireLanguage } from '@shared/languages';
import { SttSession } from './stt/manager';
import { TranslationManager } from './translation/manager';
import { TtsManager } from './tts/manager';
import { AudioOutputManager } from './audio-output/manager';

/** Client audio has its own recognition, queues, output channel and lifecycle.
 * It never enters the outgoing microphone translation pipeline. */
export class IncomingManager {
  private readonly stt = new SttSession(false);
  private readonly translation = new TranslationManager(undefined, false);
  private readonly tts = new TtsManager(undefined, false, 'queue');
  private readonly output = new AudioOutputManager('incoming-output', false);
  private status: 'idle' | 'starting' | 'active' | 'stopping' | 'error' = 'idle';
  private generation = 0;
  private pendingStart: Promise<SessionStartResult> | null = null;
  private pendingStop: Promise<void> | null = null;
  private emit: (event: IncomingEvent) => void = () => {};

  start(
    settings: ConversationSettings,
    emit: (event: IncomingEvent) => void,
    getWindow: () => BrowserWindow | null,
  ): Promise<SessionStartResult> {
    if (this.status === 'starting' || this.status === 'active' || this.status === 'stopping') {
      return Promise.resolve({ ok: false, message: 'Client translation is already running.' });
    }
    if (!settings.incomingEnabled || !settings.incomingDeviceId || !settings.listeningDeviceId) {
      return Promise.resolve({
        ok: false,
        message: 'Select the client audio cable and your headphones first.',
      });
    }
    this.emit = emit;
    this.status = 'starting';
    this.emit({ type: 'incoming:status', status: 'starting' });
    const generation = ++this.generation;
    const run = this.runStart(settings, getWindow, generation);
    this.pendingStart = run;
    void run.finally(() => {
      if (this.pendingStart === run) this.pendingStart = null;
    });
    return run;
  }

  private async runStart(
    settings: ConversationSettings,
    getWindow: () => BrowserWindow | null,
    generation: number,
  ): Promise<SessionStartResult> {
    const current = () => generation === this.generation;
    const check = (result: { ok: boolean; message?: string }) => {
      if (!current()) throw new Error('Client translation start canceled.');
      if (!result.ok) throw new Error(result.message ?? 'Could not start client translation.');
    };
    const fail = (message: string) => {
      if (!current()) return;
      this.emit({ type: 'incoming:error', message });
      void this.stop(true);
    };
    try {
      check(
        await this.output.start((event) => {
          if (event.type === 'audio-output:error') fail(event.message);
        }, getWindow),
      );
      const tts = await this.tts.start(
        (event) => {
          if (event.type === 'tts:error') fail(event.message);
        },
        this.output,
        undefined,
        undefined,
        requireLanguage(settings.incomingTargetLanguage).ttsLocale,
      );
      check(tts);
      const translation = await this.translation.start(
        (event) => {
          if (!current()) return;
          this.emit({ type: 'incoming:translation', event });
          if (event.type === 'translation:text' && !event.interim)
            this.tts.onTranslationText(event.english, false);
          if (event.type === 'translation:error') fail(event.message);
        },
        { sourceLanguage: settings.incomingSourceLanguage, targetLanguage: settings.incomingTargetLanguage },
      );
      check(translation);
      const stt = await this.stt.start((event) => {
        if (!current()) return;
        this.emit({ type: 'incoming:stt', event });
        if (event.type === 'partial' || event.type === 'final') {
          this.translation.onSttText(event.text, event.type === 'final');
        }
        if (event.type === 'error') fail(event.message);
      }, requireLanguage(settings.incomingSourceLanguage).sttLocale);
      check(stt);
      this.status = 'active';
      this.emit({ type: 'incoming:status', status: 'active' });
      return {
        ok: true,
        sttProvider: stt.provider,
        translationProvider: translation.provider,
        ttsProvider: tts.provider,
      };
    } catch (err) {
      await this.cleanup();
      const message = err instanceof Error ? err.message : String(err);
      if (current()) {
        this.status = 'error';
        this.emit({ type: 'incoming:error', message });
        this.emit({ type: 'incoming:status', status: 'error' });
      }
      return { ok: false, message };
    }
  }

  pushAudio(data: ArrayBuffer): void {
    if (
      this.status === 'active' &&
      data.byteLength > 0 &&
      data.byteLength <= 256_000 &&
      data.byteLength % 2 === 0
    ) {
      this.stt.pushAudio(data);
    }
  }

  reportPlayback(event: PlaybackTelemetryEvent): void {
    if (this.status === 'active') this.tts.handlePlaybackLifecycle(event);
  }

  private async cleanup(): Promise<void> {
    await this.stt.stop();
    this.translation.stop();
    this.tts.stop();
    this.output.stop();
  }

  stop(failed = false): Promise<void> {
    if (this.pendingStop) return this.pendingStop;
    ++this.generation;
    this.status = 'stopping';
    this.emit({ type: 'incoming:status', status: 'stopping' });
    const stopping = (async () => {
      await this.pendingStart;
      await this.cleanup();
      this.status = failed ? 'error' : 'idle';
      this.emit({ type: 'incoming:status', status: this.status });
    })();
    this.pendingStop = stopping;
    void stopping.finally(() => {
      if (this.pendingStop === stopping) this.pendingStop = null;
    });
    return stopping;
  }
}

export const incomingManager = new IncomingManager();
