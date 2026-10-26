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

import type { SttEvent, SttStartResult } from '@shared/index';
import type { SttHandlers, SttProvider } from './provider';
import { createMockSttProvider } from './providers/mock';
import { describeSttConfig } from '../../config';
import { pipelineTelemetry } from '../telemetry/pipeline-telemetry';
import { requireLanguage } from '@shared/languages';

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function createConfiguredProvider(language: string): Promise<SttProvider | null> {
  const config = describeSttConfig();
  if (!config.ok) return null;

  if (config.provider === 'mock') {
    return createMockSttProvider(language);
  }

  if (config.provider === 'azure') {
    const key = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION;
    if (!key || !region) return null;
    const { createAzureSttProvider } = await import('./providers/azure');
    // ur-IN is the only Urdu locale Azure real-time STT supports
    // (ur-PK exists for TTS/video translation only — websocket error 1007).
    return createAzureSttProvider(key, region, requireLanguage(language).sttLocale);
  }

  if (config.provider === 'whisper') {
    const { createWhisperSttProvider } = await import('./providers/whisper');
    return createWhisperSttProvider(requireLanguage(language).code.split('-')[0]);
  }

  return null;
}

export class SttSession {
  private provider: SttProvider | null = null;
  private handlers: SttHandlers | null = null;
  private generation = 0;
  private starting = false;

  constructor(private readonly telemetryEnabled: boolean = true) {}

  get active(): boolean {
    return this.provider !== null;
  }

  async start(emit: (event: SttEvent) => void, language: string = 'ur-IN'): Promise<SttStartResult> {
    if (this.provider || this.starting)
      return { ok: false, message: 'Speech recognition is already running.' };
    const generation = ++this.generation;
    this.starting = true;
    let provider: SttProvider | null = null;
    try {
      requireLanguage(language);
      const config = describeSttConfig();
      provider = config.ok ? await createConfiguredProvider(language) : null;
      if (generation !== this.generation) {
        await provider?.stop();
        return { ok: false, message: 'Speech recognition start was canceled.' };
      }
      if (!provider)
        return {
          ok: false,
          code: 'not-configured',
          message: config.message ?? 'No speech-to-text provider is configured.',
        };
      this.provider = provider;
      const current = () => generation === this.generation && this.provider === provider;
      this.handlers = {
        onSpeechStart: () => {
          if (current() && this.telemetryEnabled) pipelineTelemetry.onSpeechStart();
        },
        onPartial: (text) => {
          if (!current()) return;
          if (this.telemetryEnabled) pipelineTelemetry.onFirstPartial();
          emit({ type: 'partial', text });
        },
        onFinal: (text) => {
          if (!current()) return;
          if (this.telemetryEnabled) pipelineTelemetry.onSttFinal(text);
          emit({ type: 'final', text });
        },
        onError: (message) => {
          if (!current()) return;
          this.provider = null;
          this.handlers = null;
          emit({ type: 'error', message });
          void provider?.stop().catch(() => {});
        },
      };
      await provider.start(this.handlers);
      if (!current()) {
        await provider.stop();
        return { ok: false, message: 'Speech recognition start was canceled.' };
      }
      emit({ type: 'started' });
      return { ok: true, provider: provider.name };
    } catch (err) {
      if (generation === this.generation) {
        this.provider = null;
        this.handlers = null;
      }
      await provider?.stop().catch(() => {});
      return { ok: false, message: errMessage(err) };
    } finally {
      if (generation === this.generation) this.starting = false;
    }
  }

  pushAudio(buffer: ArrayBuffer): void {
    if (this.provider) {
      try {
        this.provider.pushAudio(buffer);
      } catch {
        // Ignore a failed write; the session may already be tearing down.
      }
    }
  }

  async stop(): Promise<void> {
    this.generation++;
    this.starting = false;
    const provider = this.provider;
    this.provider = null;
    this.handlers = null;
    if (provider) {
      try {
        await provider.stop();
      } catch {
        // Ignore stop errors; treat the session as ended.
      }
    }
  }
}

export const sttSession = new SttSession();
