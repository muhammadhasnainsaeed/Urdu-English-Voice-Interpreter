import type { TtsProvider } from "../provider";

export function createAzureTtsProvider(): TtsProvider {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  const voiceName = process.env.AZURE_TTS_VOICE || "en-US-JennyNeural";

  if (!key || !region) {
    throw new Error(
      "Azure TTS requires AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env."
    );
  }

  return {
    name: "azure",

    async speak(text: string): Promise<void> {
      const sdk = await import("microsoft-cognitiveservices-speech-sdk");
      const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
      speechConfig.speechSynthesisVoiceName = voiceName;

      const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

      return new Promise<void>((resolve, reject) => {
        synthesizer.speakTextAsync(
          text,
          () => {
            synthesizer.close();
            resolve();
          },
          (err: string) => {
            synthesizer.close();
            reject(new Error(err));
          }
        );
      });
    },

    async stop(): Promise<void> {
      // Azure SDK synthesizer does not expose a global stop.
      // Each speak() call is self-contained; rapid successive calls
      // are serialized by the TTSManager queue.
    },
  };
}
