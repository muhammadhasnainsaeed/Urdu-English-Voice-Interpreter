import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AZURE_VOICE_IDS,
  DEFAULT_TTS_VOICE_ID,
  normalizeSelectedVoiceId,
  parseSayVoices,
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
  assert.deepEqual(voices[0], { id: 'Albert', name: 'Albert', gender: 'unknown', source: 'system' });
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
