import type { SttEvent, SttStartResult } from "@shared/index";
import type { SttHandlers, SttProvider } from "./provider";
import { createMockSttProvider } from "./providers/mock";
import { pipelineTelemetry } from "../telemetry/pipeline-telemetry";

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function createConfiguredProvider(): Promise<SttProvider | null> {
  const providerName = (process.env.STT_PROVIDER || "azure").toLowerCase();

  if (providerName === "mock") {
    return createMockSttProvider();
  }

  if (providerName === "azure") {
    const key = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION;
    if (!key || !region) return null;
    const { createAzureSttProvider } = await import("./providers/azure");
    // ur-IN is the only Urdu locale Azure real-time STT supports
    // (ur-PK exists for TTS/video translation only — websocket error 1007).
    return createAzureSttProvider(key, region, "ur-IN");
  }

  if (providerName === "whisper") {
    const { createWhisperSttProvider } = await import("./providers/whisper");
    return createWhisperSttProvider();
  }

  return null;
}

class SttSession {
  private provider: SttProvider | null = null;
  private handlers: SttHandlers | null = null;

  get active(): boolean {
    return this.provider !== null;
  }

  async start(emit: (event: SttEvent) => void): Promise<SttStartResult> {
    if (this.provider) {
      return { ok: false, message: "Speech recognition is already running." };
    }

    const provider = await createConfiguredProvider();
    if (!provider) {
      return {
        ok: false,
        message:
          "No speech-to-text provider is configured. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env (Azure), set STT_PROVIDER=whisper for local Whisper, or set STT_PROVIDER=mock for development.",
      };
    }

    this.provider = provider;
    this.handlers = {
      onSpeechStart: () => pipelineTelemetry.onSpeechStart(),
      onPartial: (text) => {
        pipelineTelemetry.onFirstPartial();
        emit({ type: "partial", text });
      },
      onFinal: (text) => {
        pipelineTelemetry.onSttFinal(text);
        emit({ type: "final", text });
      },
      onError: (message) => {
        emit({ type: "error", message });
        this.provider = null;
        this.handlers = null;
      },
    };

    try {
      await provider.start(this.handlers);
      emit({ type: "started" });
      return { ok: true, provider: provider.name };
    } catch (err) {
      this.provider = null;
      this.handlers = null;
      return { ok: false, message: errMessage(err) };
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
