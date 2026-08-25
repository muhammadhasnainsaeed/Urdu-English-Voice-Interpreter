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

    async stop(): Promise<void> {
      // Azure SDK synthesizer does not expose a global stop.
      // Each synthesize() call is self-contained; rapid successive calls
      // are serialized by the TTSManager queue.
    },
  };
}
