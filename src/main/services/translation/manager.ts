import type { TranslationEvent, TranslationStartResult } from "@shared/index";
import type { TranslationProvider } from "./provider";
import { createTranslationProvider } from "./provider";

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export class TranslationManager {
  private provider: TranslationProvider | null = null;
  private emit: ((event: TranslationEvent) => void) | null = null;
  private active: boolean = false;

  get isActive(): boolean {
    return this.active;
  }

  async start(
    emit: (event: TranslationEvent) => void
  ): Promise<TranslationStartResult> {
    if (this.active) {
      return { ok: false, message: "Translation is already running." };
    }

    const provider = await createTranslationProvider();
    if (!provider) {
      return {
        ok: false,
        message:
          "No translation provider configured. Set TRANSLATION_PROVIDER=azure, mymemory, or mock in .env.",
      };
    }

    this.provider = provider;
    this.emit = emit;
    this.active = true;

    emit({ type: "translation:started", provider: provider.name });
    return { ok: true, provider: provider.name };
  }

  onSttText(text: string, isFinal: boolean): void {
    if (!this.active) return;
    if (!isFinal) return;
    this.translateText(text);
  }

  stop(): void {
    this.provider = null;
    this.emit = null;
    this.active = false;
  }

  private async translateText(text: string): Promise<void> {
    if (!this.provider || !this.emit) return;
    try {
      const english = await this.provider.translate(text);
      this.emit({ type: "translation:text", urdu: text, english });
    } catch (err) {
      this.emit({ type: "translation:error", message: errMessage(err) });
    }
  }
}
