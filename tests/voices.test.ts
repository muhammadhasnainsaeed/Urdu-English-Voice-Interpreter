import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AZURE_VOICE_IDS,
  DEFAULT_TTS_VOICE_ID,
  countryFromAzureId,
  listVoices,
  normalizeSelectedVoiceId,
  parseSayVoices,
  resolveTtsProviderName,
  voiceIsAzure,
} from '../src/main/services/tts/voices';

test('parseSayVoices parses simple voices', () => {
  const out = [
    'Albert              en_US    # Hello! My name is Albert.',
    'Samantha            en_US    # Hello! My name is Samantha.',
    'Daniel              en_GB    # Hello! My name is Daniel.',
  ].join('\n');

  const voices = parseSayVoices(out);
  assert.equal(voices.length, 3);
  assert.deepEqual(voices[0], {
    id: 'Albert',
    name: 'Albert',
    gender: 'unknown',
    source: 'system',
    country: 'US',
  });
  assert.equal(voices[1].id, 'Samantha');
  assert.equal(voices[2].id, 'Daniel');
});

test('parseSayVoices handles multi-word and parenthesized names', () => {
  const out = [
    'Bad News            en_US    # Hello! My name is Bad News.',
    'Eddy (German)       de_DE    # Hallo! Ich heiße Eddy.',
    'Eddy (English)      en_GB    # Hello! My name is Eddy.',
  ].join('\n');

  const voices = parseSayVoices(out);
  assert.equal(voices.length, 3);
  assert.equal(voices[0].id, 'Bad News');
  assert.equal(voices[1].name, 'Eddy (German)');
  assert.equal(voices[2].name, 'Eddy (English)');
});

test('parseSayVoices tolerates a missing locale and dedupes by name', () => {
  const out = [
    'Albert              en_US    # Hello!',
    'Wobble              # Hello! My name is Wobble.',
    'Albert              en_US    # Hello!',
  ].join('\n');

  const voices = parseSayVoices(out);
  assert.deepEqual(
    voices.map((v) => v.id),
    ['Albert', 'Wobble'],
  );
});

test('parseSayVoices ignores blank lines', () => {
  assert.deepEqual(parseSayVoices(''), []);
  assert.deepEqual(parseSayVoices('\n  \n'), []);
});

test('parseSayVoices marks gender unknown because macOS does not advertise it', () => {
  const voices = parseSayVoices('Samantha      en_US    # Hello!');
  assert.equal(voices[0].gender, 'unknown');
  assert.equal(voices[0].source, 'system');
});

test('parseSayVoices derives country from the macOS locale region', () => {
  const voices = parseSayVoices(
    ['Samantha  en_US  # hi', 'Daniel    en_GB  # hi', 'Kyoko     ja_JP  # hi'].join('\n'),
  );
  assert.deepEqual(
    voices.map((v) => v.country),
    ['US', 'GB', 'JP'],
  );
});

test('parseSayVoices country is unknown when no locale is present', () => {
  assert.equal(parseSayVoices('MysteryVoice # hi')[0].country, 'unknown');
});

test('countryFromAzureId extracts the country from an Azure voice id', () => {
  assert.equal(countryFromAzureId('en-US-JennyNeural'), 'US');
  assert.equal(countryFromAzureId('en-IN-PrabhatNeural'), 'IN');
  assert.equal(countryFromAzureId('en-CA-LiamNeural'), 'CA');
});

test('every Azure catalog voice has a known gender and a real id', () => {
  for (const id of AZURE_VOICE_IDS) {
    assert.match(id, /^[a-z]{2}-[A-Z]{2}-[A-Z]\w+Neural$/);
  }
});

test('default voice is the historical, safe Azure default', () => {
  assert.equal(DEFAULT_TTS_VOICE_ID, 'en-US-JennyNeural');
});

test('normalizeSelectedVoiceId passes through any nested id in development', () => {
  assert.equal(normalizeSelectedVoiceId('Samantha', true), 'Samantha');
  assert.equal(normalizeSelectedVoiceId('en-US-JennyNeural', true), 'en-US-JennyNeural');
});

test('normalizeSelectedVoiceId falls back to default when empty', () => {
  assert.equal(normalizeSelectedVoiceId(null, true), DEFAULT_TTS_VOICE_ID);
  assert.equal(normalizeSelectedVoiceId('', true), DEFAULT_TTS_VOICE_ID);
  assert.equal(normalizeSelectedVoiceId('   ', false), DEFAULT_TTS_VOICE_ID);
});

test('voiceIsAzure classifies azure vs macOS system voices', () => {
  assert.equal(voiceIsAzure('en-US-JennyNeural'), true);
  assert.equal(voiceIsAzure('en-GB-RyanNeural'), true);
  assert.equal(voiceIsAzure('Samantha'), false);
  assert.equal(voiceIsAzure('Bad News'), false);
  assert.equal(voiceIsAzure(''), false);
  assert.equal(voiceIsAzure(null), false);
  assert.equal(voiceIsAzure(undefined), false);
});

test('every default Azure id is recognized as azure', () => {
  for (const id of AZURE_VOICE_IDS) {
    assert.equal(voiceIsAzure(id), true, id);
  }
});

test('normalizeSelectedVoiceId restricts production to curated Azure ids only', () => {
  assert.equal(normalizeSelectedVoiceId('en-US-GuyNeural', false), 'en-US-GuyNeural');
  assert.equal(normalizeSelectedVoiceId('en-US-JennyNeural', false), 'en-US-JennyNeural');
  // A stale development system voice must never flow into production.
  assert.equal(normalizeSelectedVoiceId('Samantha', false), DEFAULT_TTS_VOICE_ID);
  assert.equal(normalizeSelectedVoiceId('not-a-real-voice', false), DEFAULT_TTS_VOICE_ID);
});

test('resolveTtsProviderName reads the TTS_PROVIDER env and defaults to mock', () => {
  assert.equal(resolveTtsProviderName({}), 'mock');
  assert.equal(resolveTtsProviderName({ TTS_PROVIDER: 'azure' }), 'azure');
  assert.equal(resolveTtsProviderName({ TTS_PROVIDER: 'say' }), 'say');
  assert.equal(resolveTtsProviderName({ TTS_PROVIDER: 'AZURE' }), 'azure');
  assert.equal(resolveTtsProviderName({ TTS_PROVIDER: 'mock' }), 'mock');
  assert.equal(resolveTtsProviderName({ TTS_PROVIDER: 'whisper' }), 'none');
});

test('listVoices for azure in production lists only curated Azure voices', async () => {
  const result = await listVoices(false, 'azure');
  assert.equal(result.provider, 'azure');
  assert.equal(result.development, false);
  assert.deepEqual(
    result.voices.map((v) => v.id),
    AZURE_VOICE_IDS,
  );
  assert.ok(result.voices.every((v) => v.source === 'azure'));
});

test('listVoices for mock lists only Azure voices in any mode', async () => {
  const result = await listVoices(true, 'mock');
  assert.equal(result.provider, 'mock');
  assert.deepEqual(
    result.voices.map((v) => v.id),
    AZURE_VOICE_IDS,
  );
});

test('listVoices for say never includes Azure voice ids', async () => {
  const result = await listVoices(false, 'say');
  assert.equal(result.provider, 'say');
  assert.ok(result.voices.length >= 0);
  assert.ok(
    result.voices.every((v) => v.source === 'system' && !voiceIsAzure(v.id)),
    'say catalog must contain only macOS system voices',
  );
});

test('listVoices for an unknown provider returns no voices', async () => {
  const result = await listVoices(false, 'none');
  assert.equal(result.provider, 'none');
  assert.deepEqual(result.voices, []);
});
