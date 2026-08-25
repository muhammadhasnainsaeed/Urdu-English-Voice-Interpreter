import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import type { SttHandlers, SttProvider } from "../provider";

// TEMPORARY debug logging for investigating websocket error 1007
// ("Invalid 'language' query parameter"). Remove once resolved.
// NEVER logs the API key.
const AZURE_STT_DEBUG = process.env.PIPELINE_DEBUG === "1";

function isNonEmpty(text: string | undefined): text is string {
  return typeof text === "string" && text.trim().length > 0;
}

export function createAzureSttProvider(
  key: string,
  region: string,
  language: string
): SttProvider {
  let recognizer: sdk.SpeechRecognizer | null = null;
  let pushStream: sdk.PushAudioInputStream | null = null;

  return {
    name: "azure",

    async start(handlers: SttHandlers) {
      const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
      speechConfig.speechRecognitionLanguage = language;
      if (AZURE_STT_DEBUG) {
        // NEVER log the API key.
        console.log(
          `[AZURE-STT][DEBUG] region="${region}" language="${language}" ` +
            `endpointId="${speechConfig.endpointId || "(none — standard model)"}"`
        );
      }

      pushStream = sdk.AudioInputStream.createPushStream();
      const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
      recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

      recognizer.recognizing = (_sender, event) => {
        const text = event.result.text;
        if (isNonEmpty(text)) handlers.onPartial(text.trim());
      };

      // Service-side voice onset — used only for latency telemetry.
      recognizer.speechStartDetected = () => {
        handlers.onSpeechStart?.();
      };

      recognizer.recognized = (_sender, event) => {
        if (event.result.reason === sdk.ResultReason.RecognizedSpeech) {
          const text = event.result.text;
          if (isNonEmpty(text)) handlers.onFinal(text.trim());
        }
      };

      recognizer.canceled = (_sender, event) => {
        const reason = sdk.CancellationReason[event.reason];
        const details =
          event.errorDetails && event.errorDetails.trim() !== ""
            ? event.errorDetails.trim()
            : undefined;
        handlers.onError(
          details
            ? `Speech recognition canceled (${reason}): ${details}`
            : `Speech recognition canceled (${reason}).`
        );
        // Session ended; close the recognizer so a later start works.
        try {
          recognizer?.close();
        } catch {
          // ignore
        }
        recognizer = null;
        try {
          pushStream?.close();
        } catch {
          // ignore
        }
        pushStream = null;
      };

      await new Promise<void>((resolve, reject) => {
        recognizer!.startContinuousRecognitionAsync(() => resolve(), (err) =>
          reject(err)
        );
      });
    },

    pushAudio(buffer: ArrayBuffer) {
      if (pushStream) {
        pushStream.write(buffer);
      }
    },

    async stop() {
      const active = recognizer;
      recognizer = null;

      if (active) {
        await new Promise<void>((resolve) => {
          try {
            active.stopContinuousRecognitionAsync(() => {
              try {
                active.close();
              } catch {
                // ignore
              }
              resolve();
            });
          } catch {
            try {
              active.close();
            } catch {
              // ignore
            }
            resolve();
          }
        });
      }

      if (pushStream) {
        try {
          pushStream.close();
        } catch {
          // ignore
        }
        pushStream = null;
      }
    },
  };
}
