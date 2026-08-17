import type { TtsEvent, TtsStartResult } from "@shared/index";
import type { TtsProvider } from "./provider";
import { createTtsProvider } from "./provider";

const DEFAULT_DEDUPE_WINDOW_MS = 2000;

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export class TtsManager {
  private provider: TtsProvider | null = null;
  private emit: ((event: TtsEvent) => void) | null = null;
  private active: boolean = false;
  private speaking: boolean = false;
  private queue: string[] = [];

  private lastSpokenText: string = "";
  private lastSpokenTime: number = 0;
  private dedupeWindowMs: number;

  constructor(dedupeWindowMs?: number) {
    if (dedupeWindowMs !== undefined) {
      this.dedupeWindowMs = dedupeWindowMs;
    } else {
      const envVal = parseInt(
        process.env.TTS_DEDUPE_WINDOW_MS || "",
        10
      );
      this.dedupeWindowMs =
        Number.isFinite(envVal) && envVal >= 0
          ? envVal
          : DEFAULT_DEDUPE_WINDOW_MS;
    }
  }

  get isActive(): boolean {
    return this.active;
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  get queueLength(): number {
    return this.queue.length;
  }

  async start(
    emit: (event: TtsEvent) => void,
    providerOverride?: TtsProvider
  ): Promise<TtsStartResult> {
    if (this.active) {
      return { ok: false, message: "TTS is already running." };
    }

    const provider = providerOverride ?? (await createTtsProvider());
    if (!provider) {
      return {
        ok: false,
        message:
          "No TTS provider configured. Set TTS_PROVIDER=azure, say, or mock in .env.",
      };
    }

    this.provider = provider;
    this.emit = emit;
    this.active = true;

    emit({ type: "tts:started", provider: provider.name });
    return { ok: true, provider: provider.name };
  }

  onTranslationText(text: string): void {
    if (!this.active) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const now = Date.now();
    if (
      trimmed === this.lastSpokenText &&
      now - this.lastSpokenTime < this.dedupeWindowMs
    ) {
      return;
    }

    this.lastSpokenText = trimmed;
    this.lastSpokenTime = now;
    this.queue.push(trimmed);
    this.processQueue();
  }

  stop(): void {
    const provider = this.provider;
    this.provider = null;
    this.emit = null;
    this.active = false;
    this.speaking = false;
    this.queue = [];
    this.lastSpokenText = "";
    this.lastSpokenTime = 0;
    if (provider) {
      provider.stop().catch(() => {});
    }
  }

  private async processQueue(): Promise<void> {
    if (this.speaking || this.queue.length === 0 || !this.provider || !this.emit) {
      return;
    }

    const text = this.queue.shift()!;
    this.speaking = true;
    this.emit({ type: "tts:speaking", text });

    try {
      await this.provider.speak(text);
      if (this.emit) {
        this.emit({ type: "tts:spoken", text });
      }
    } catch (err) {
      if (this.emit) {
        this.emit({ type: "tts:error", message: errMessage(err) });
      }
    } finally {
      this.speaking = false;
      this.processQueue();
    }
  }
}
