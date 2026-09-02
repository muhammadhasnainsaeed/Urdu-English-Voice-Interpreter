import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyInputError, ERROR_CATEGORIES, type AppError } from '../src/renderer/errors/errorModel';

function allCategoriesHaveDefaults(): boolean {
  return ERROR_CATEGORIES.every((category) => {
    const e: AppError = classifyInputError(category, null);
    return (
      e.code.length > 0 &&
      e.message.length > 0 &&
      (e.severity === 'error' || e.severity === 'warning' || e.severity === 'info')
    );
  });
}

test('classifyInputError produces a stable, user-safe AppError', () => {
  const e = classifyInputError('translation', 'Raw provider error: HTTP 429 (OpenAI)');
  assert.ok(e.code);
  assert.equal(e.category, 'translation');
  assert.equal(e.message, 'Translation is temporarily unavailable. Please try again.');
  assert.equal(e.detail, 'Raw provider error: HTTP 429 (OpenAI)');
  assert.equal(e.severity, 'error');
  assert.ok(Number.isFinite(e.timestamp));
});

test('user-facing message never leaks technical detail', () => {
  const e = classifyInputError('stt', 'Error: EntityTooLarge at stack.ts:40 in Whispertron');
  assert.ok(!e.message.includes('Whispertron'));
  assert.ok(!e.message.includes('stack.ts'));
  assert.equal(e.detail, 'Error: EntityTooLarge at stack.ts:40 in Whispertron');
});

test('permission category defaults to a warning severity', () => {
  const e = classifyInputError('permission', null);
  assert.equal(e.severity, 'warning');
  assert.equal(e.code, 'permission/microphone');
});

test('explicit user-safe message overrides the curated default', () => {
  const e = classifyInputError('device', 'some raw detail', {
    message: 'Microphone unavailable. Choose one in Settings.',
  });
  assert.equal(e.message, 'Microphone unavailable. Choose one in Settings.');
  assert.equal(e.detail, 'some raw detail');
});

test('severity override is honoured', () => {
  const e = classifyInputError('session', null, { severity: 'info' });
  assert.equal(e.severity, 'info');
});

test('explicit detail override wins over raw input', () => {
  const e = classifyInputError('audio-output', 'raw', { detail: 'purposed' });
  assert.equal(e.detail, 'purposed');
});

test('every category has curated defaults', () => {
  assert.ok(allCategoriesHaveDefaults());
});

test('null detail is retained when there is no raw input', () => {
  const e = classifyInputError('runtime', undefined);
  assert.equal(e.detail, null);
});
