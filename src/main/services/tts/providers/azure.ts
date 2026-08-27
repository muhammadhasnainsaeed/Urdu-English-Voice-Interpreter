import type { AudioChunk } from "@shared/index";
import type { TtsProvider } from "../provider";

export function createAzureTtsProvider(): TtsProvider {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  const voiceName = process.env.AZURE_TTS_VOICE || "en-US-JennyNeural";

  if (!key || !region) {
    throw new Error(
      "Azure TTS requires AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.",
    );
  }

  return {
    name: "azure",

    async synthesize(text: string): Promise<AudioChunk> {
      const sdk = await import("microsoft-cognitiveservices-speech-sdk");
      const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
      speechConfig.speechSynthesisVoiceName = voiceName;
      speechConfig.speechSynthesisOutputFormat =
        sdk.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm;

      const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

      return new Promise<AudioChunk>((resolve, reject) => {
        synthesizer.speakTextAsync(
          text,
          (result) => {
            synthesizer.close();

            if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
              reject(
                new Error(
                  `Azure TTS failed: ${result.reason} ${result.errorDetails ?? ""}`,
                ),
              );
              return;
            }

            if (!result.audioData) {
              reject(new Error("Azure TTS returned no audio data."));
              return;
            }

            resolve({
              data: result.audioData,
              format: { sampleRate: 24000, bitsPerSample: 16, channels: 1 },
            });
          },
          (err: string) => {
            synthesizer.close();
            reject(new Error(err));
          },
        );
      });
    },

    async synthesizeStream(text, onChunk, signal): Promise<void> {
      const sdk = await import("microsoft-cognitiveservices-speech-sdk");
      const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
      speechConfig.speechSynthesisVoiceName = voiceName;
      speechConfig.speechSynthesisOutputFormat =
        sdk.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm;
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
      const format = { sampleRate: 24000, bitsPerSample: 16, channels: 1 };

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let pending: ArrayBuffer | null = null;
        let writeChain = Promise.resolve();
        const onAbort = () => fail(signal?.reason ?? new Error("TTS aborted"));
        const cleanup = () => signal?.removeEventListener("abort", onAbort);
        const fail = (err: unknown) => {
          if (settled) return;
          settled = true;
          cleanup();
          try { synthesizer.close(); } catch { /* ignore */ }
          reject(err instanceof Error ? err : new Error(String(err)));
        };
        if (signal?.aborted) {
          fail(signal.reason ?? new Error("TTS aborted"));
          return;
        }
        signal?.addEventListener("abort", onAbort, { once: true });

        synthesizer.synthesizing = (_sender, event) => {
          if (settled || !event.result.audioData) return;
          if (pending) {
            const data = pending;
            writeChain = writeChain.then(() =>
              signal?.aborted ? undefined : onChunk({ data, format }, false)
            );
            writeChain.catch(fail);
          }
          pending = event.result.audioData;
        };
        synthesizer.speakTextAsync(
          text,
          (result) => {
            if (settled) return;
            if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
              fail(new Error(`Azure TTS failed: ${result.reason} ${result.errorDetails ?? ""}`));
              return;
            }
            const last = pending;
            pending = null;
            if (!last) {
              fail(new Error("Azure TTS returned no streaming audio."));
              return;
            }
            writeChain = writeChain
              .then(() =>
                last && !signal?.aborted ? onChunk({ data: last, format }, true) : undefined
              )
              .then(() => {
                if (settled) return;
                settled = true;
                cleanup();
                try { synthesizer.close(); } catch { /* ignore */ }
                resolve();
              });
            writeChain.catch(fail);
          },
          (err: string) => fail(new Error(err)),
        );
      });
    },

    async stop(): Promise<void> {
      // Azure SDK synthesizer does not expose a global stop.
      // Each synthesize() call is self-contained; rapid successive calls
      // are serialized by the TTSManager queue.
    },
  };
}
