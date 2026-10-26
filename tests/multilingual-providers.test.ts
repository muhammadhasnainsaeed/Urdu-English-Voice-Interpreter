/*
 * Urdu English Interpreter
 * Copyright (C) 2026 Muhammad Hasnain Saeed
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SttEvent, TranslationEvent } from '../packages/shared/index';
import {
  SUPPORTED_LANGUAGES,
  getLanguage,
  requireLanguage,
  voiceMatchesLanguage,
} from '../packages/shared/languages';
import { SttSession } from '../src/main/services/stt/manager';
import { createAzureTranslatorProvider } from '../src/main/services/translation/providers/azure';
import { createMyMemoryProvider } from '../src/main/services/translation/providers/mymemory';
import { createTranslationProvider } from '../src/main/services/translation/provider';
import { TranslationManager } from '../src/main/services/translation/manager';
import { TtsManager } from '../src/main/services/tts/manager';
import {
  listVoices,
  normalizeSelectedVoiceId,
  parseSayVoices,
  selectSystemVoice,
} from '../src/main/services/tts/voices';
import { resolveAzureVoiceName } from '../src/main/services/tts/providers/azure';
import { pipelineTelemetry } from '../src/main/services/telemetry/pipeline-telemetry';

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function env(values: Record<string, string>, run: () => Promise<void> | void): Promise<void> {
  const original = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

test('language catalog has unique codes, explicit Urdu locales, and compatible voices', () => {
  assert.equal(
    new Set(SUPPORTED_LANGUAGES.map((language) => language.code)).size,
    SUPPORTED_LANGUAGES.length,
  );
  assert.equal(requireLanguage('ur').sttLocale, 'ur-IN');
  assert.equal(requireLanguage('ur').ttsLocale, 'ur-PK');
  for (const language of SUPPORTED_LANGUAGES) {
    assert.ok(voiceMatchesLanguage(language.defaultVoiceId, language.code));
    assert.ok(language.sttLocale && language.ttsLocale);
  }
  assert.equal(requireLanguage('tr_TR').code, 'tr');
  assert.equal(requireLanguage('zh-CN').code, 'zh-Hans');
  assert.equal(getLanguage('unsupported'), undefined);
  assert.throws(() => requireLanguage('unsupported'), /Unsupported language/);
});

test('Azure translation sends configured source and target, including reverse translation', async () => {
  await env({ AZURE_TRANSLATOR_KEY: 'fixture-key', AZURE_TRANSLATOR_REGION: 'fixture-region' }, async () => {
    const original = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify([{ translations: [{ text: 'fixture translation', to: 'tr' }] }]));
    };
    try {
      await createAzureTranslatorProvider({ sourceLanguage: 'ur', targetLanguage: 'tr' }).translate('سلام');
      await createAzureTranslatorProvider({ sourceLanguage: 'tr', targetLanguage: 'ur' }).translate(
        'Merhaba',
      );
      assert.equal(new URL(calls[0]).searchParams.get('from'), 'ur');
      assert.equal(new URL(calls[0]).searchParams.get('to'), 'tr');
      assert.equal(new URL(calls[1]).searchParams.get('from'), 'tr');
      assert.equal(new URL(calls[1]).searchParams.get('to'), 'ur');
    } finally {
      globalThis.fetch = original;
    }
  });
});

test('MyMemory sends the selected language pair', async () => {
  const original = globalThis.fetch;
  let requested = '';
  globalThis.fetch = async (input) => {
    requested = String(input);
    return new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: 'شکریہ' } }));
  };
  try {
    const provider = createMyMemoryProvider({ sourceLanguage: 'tr', targetLanguage: 'ur' });
    assert.equal(await provider.translate('Teşekkürler'), 'شکریہ');
    assert.equal(new URL(requested).searchParams.get('langpair'), 'tr|ur');
  } finally {
    globalThis.fetch = original;
  }
});

test('same-language mode needs no translation provider or network request', async () => {
  await env({ TRANSLATION_PROVIDER: 'none' }, async () => {
    const provider = await createTranslationProvider({ sourceLanguage: 'tr', targetLanguage: 'tr' });
    assert.equal(provider?.name, 'passthrough');
    assert.equal(await provider?.translate('Merhaba'), 'Merhaba');
  });
});

test('voice catalog filters by output language and mismatched persisted voices fall back', async () => {
  const turkish = await listVoices(false, 'azure', 'tr');
  assert.deepEqual(
    turkish.voices.map((voice) => voice.id),
    ['tr-TR-EmelNeural', 'tr-TR-AhmetNeural'],
  );
  const urdu = await listVoices(false, 'azure', 'ur');
  assert.ok(urdu.voices.length >= 2);
  assert.ok(urdu.voices.every((voice) => voice.locale === 'ur-PK'));
  assert.equal(normalizeSelectedVoiceId('en-US-JennyNeural', false, 'tr'), 'tr-TR-EmelNeural');
  assert.equal(normalizeSelectedVoiceId('tr-TR-AhmetNeural', false, 'tr'), 'tr-TR-AhmetNeural');
});

test('Azure voice resolution cannot silently keep English after switching to Turkish or Urdu', async () => {
  await env({ AZURE_TTS_VOICE: 'en-US-JennyNeural' }, () => {
    assert.equal(resolveAzureVoiceName(undefined, 'tr'), 'tr-TR-EmelNeural');
    assert.equal(resolveAzureVoiceName('en-US-GuyNeural', 'ur'), 'ur-PK-UzmaNeural');
    assert.equal(resolveAzureVoiceName('tr-TR-AhmetNeural', 'tr'), 'tr-TR-AhmetNeural');
    assert.throws(() => resolveAzureVoiceName(undefined, 'unsupported'), /Unsupported language/);
  });
});

test('macOS voice parsing retains the actual language for safe local selection', () => {
  const voices = parseSayVoices('Samantha en_US # Hello\nYelda tr_TR # Merhaba\nThomas fr_FR # Bonjour');
  assert.deepEqual(
    voices.map((voice) => voice.locale),
    ['en-US', 'tr-TR', 'fr-FR'],
  );
  assert.equal(selectSystemVoice(voices, 'Samantha', 'tr'), 'Yelda');
  assert.throws(() => selectSystemVoice(voices, 'Samantha', 'ur'), /No macOS voice is installed/);
});

test('two STT instances recognize their own language and stopping one leaves the other active', async () => {
  await env({ STT_PROVIDER: 'mock' }, async () => {
    const outgoing = new SttSession(false);
    const incoming = new SttSession(false);
    const left: SttEvent[] = [];
    const right: SttEvent[] = [];
    try {
      assert.equal((await outgoing.start((event) => left.push(event), 'en-US')).ok, true);
      assert.equal((await incoming.start((event) => right.push(event), 'tr-TR')).ok, true);
      outgoing.pushAudio(new ArrayBuffer(2));
      incoming.pushAudio(new ArrayBuffer(2));
      assert.ok(left.some((event) => event.type === 'partial' && event.text === 'I'));
      assert.ok(right.some((event) => event.type === 'partial' && event.text === 'Sesinizi'));
      await outgoing.stop();
      assert.equal(incoming.active, true);
      await wait(550);
      assert.ok(right.some((event) => event.type === 'final' && event.text === 'Sesinizi duyabiliyorum'));
    } finally {
      await outgoing.stop();
      await incoming.stop();
    }
  });
});

test('canceled STT startup cannot resurrect a stopped session', async () => {
  await env({ STT_PROVIDER: 'mock' }, async () => {
    const session = new SttSession(false);
    const events: SttEvent[] = [];
    const start = session.start((event) => events.push(event), 'tr');
    await session.stop();
    assert.equal((await start).ok, false);
    assert.equal(session.active, false);
    assert.equal(events.length, 0);
  });
});

test('translation events carry the selected pair and disabled telemetry cannot reset outgoing traces', async () => {
  const originalReset = pipelineTelemetry.resetPipeline;
  let resets = 0;
  pipelineTelemetry.resetPipeline = () => {
    resets++;
  };
  const manager = new TranslationManager(0, false);
  const events: TranslationEvent[] = [];
  try {
    assert.equal(
      (await manager.start((event) => events.push(event), { sourceLanguage: 'tr', targetLanguage: 'tr' })).ok,
      true,
    );
    manager.onSttText('Merhaba', true);
    await wait();
    const text = events.find((event) => event.type === 'translation:text');
    assert.ok(text?.type === 'translation:text');
    assert.equal(text.sourceLanguage, 'tr');
    assert.equal(text.targetLanguage, 'tr');
    assert.equal(text.english, 'Merhaba');
    manager.stop();
    new TtsManager(undefined, false).stop();
    assert.equal(resets, 0);
  } finally {
    manager.stop();
    pipelineTelemetry.resetPipeline = originalReset;
  }
});

test('canceled translation startup cannot reactivate after stop', async () => {
  const manager = new TranslationManager(undefined, false);
  const start = manager.start(() => {}, { sourceLanguage: 'en', targetLanguage: 'en' });
  manager.stop();
  assert.equal((await start).ok, false);
  assert.equal(manager.isActive, false);
});

test('canceled TTS startup cannot reactivate after stop', async () => {
  await env({ TTS_PROVIDER: 'mock' }, async () => {
    const manager = new TtsManager(undefined, false);
    const start = manager.start(() => {}, {} as never, undefined, undefined, 'tr');
    manager.stop();
    assert.equal((await start).ok, false);
    assert.equal(manager.isActive, false);
  });
});
