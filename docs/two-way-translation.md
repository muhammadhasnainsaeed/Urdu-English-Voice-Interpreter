# Two-way translation setup

The source checkout supports two independent language pairs. The published
v1.1.0 DMG predates this change; run the updated checkout with `npm start`.

Select `You speak` and `Client hears` on Home for your outgoing voice. Enable
`Translate client audio`, then select `Client speaks` and `You hear` for the
return direction. Languages are selected explicitly; automatic detection and
several client languages at once are not implemented.

## Audio connections

Use headphones and **two separate virtual audio cables**. A working example is
BlackHole 2ch plus BlackHole 16ch. Installation is a user/maintainer action; the
app detects devices but does not install or reconfigure drivers.

| Setting | Select |
| --- | --- |
| Interpreter Settings → Audio → microphone | Your physical microphone |
| Interpreter Settings → Audio → voice output | BlackHole 2ch |
| Meeting app → microphone | BlackHole 2ch |
| Meeting app → speaker | BlackHole 16ch |
| Interpreter Home → Client audio input | BlackHole 16ch |
| Interpreter Home → Your headphones | Your physical headphones |

The outgoing voice and client audio must never share the same cable. Otherwise
the interpreter can translate its own output repeatedly. The app checks known
device identities, groups and labels before starting and refuses system-default
aliases for two-way routing. It cannot inspect the meeting application's own
device settings; configure those explicitly using the table.

Do not send the return translation into a multi-output/aggregate device that
also includes either virtual cable. Use the physical headphones directly. Route
only meeting participant audio into the client input; routing all system sound
also sends notifications and other applications to recognition. Raw client
audio is not monitored through the interpreter, so you hear its translated
version through headphones instead of two overlapping voices.

The [BlackHole project](https://github.com/ExistentialAudio/BlackHole#route-audio-between-applications)
documents inter-application routing. Two separate driver devices provide the
two isolated buses used here; channel separation inside a single device is not
implemented.

## Providers and speech behavior

The supported cloud pipeline uses Azure Speech, Translator and neural TTS with
the existing configuration keys. Source/target choices are applied to every
stage. Urdu uses `ur-IN` for recognition and `ur-PK` for synthesis; Turkish uses
`tr-TR`. The curated language list is the supported intersection of the three
services, not a promise that every language in the world is available. See
[Azure Speech language support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support)
and [Translator language support](https://learn.microsoft.com/en-us/azure/ai-services/translator/language-support).

Local `say` needs an installed voice matching the target language. A missing
voice produces an error rather than silently speaking with an English voice.
Local Whisper requires a multilingual model for non-English recognition.
Mock providers generate fixtures/silence for development and never prove live
speech quality.

Interim text updates captions; only final translations are spoken, in order.
This avoids cutting words when a provisional translation changes, at the cost
of waiting for an utterance to finish. A conversation that outpaces speech can
accumulate delay. The app bounds the pending speech count and reports when a
sentence was not accepted, so pause and read the captions if that occurs.

## Validation with another participant

1. Run `npm run preflight`, set the six devices above, and choose Urdu → Turkish
   outgoing plus Turkish → Urdu incoming (or your required pairs).
2. Start Meeting. Speak several short sentences. The client should hear each
   translated sentence once, without the original mic mixed in.
3. Ask the client to reply. Confirm the translated reply is audible only in
   your headphones, while your outgoing microphone does not repeat it.
4. Test consecutive sentences and interruptions; listen for clicks, gaps,
   clipped words, echo and growing delay. Captions must retain their correct
   direction and language. Export a transcript and open the captions overlay.
5. Stop while speech is playing: both directions must stop. Restart, unplug
   the client cable/headphones, and verify a clear error with no speaker
   fallback. Reconnect and start again.

Automated tests cover scheduling, cancellation, language propagation, isolation,
route validation and mock pipeline lifecycles. Final acoustic acceptance and
real Zoom/Meet/Teams round-trip validation remain manual.
