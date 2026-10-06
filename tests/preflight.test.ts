/*
 * Urdu English Interpreter
 * Copyright (C) 2026 Muhammad Hasnain Saeed
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILD_ARTIFACTS,
  evaluatePreflight,
  formatReport,
  summarize,
  type PreflightCheck,
  type PreflightInput,
} from '../scripts/preflight';

const READY_STT = { ok: true, provider: 'azure' } as const;
const READY_TRANSLATION = { ok: true, provider: 'azure' } as const;

function makeInput(overrides: Partial<PreflightInput> = {}): PreflightInput {
  return {
    fileExists: () => true,
    platform: 'darwin',
    stt: { ...READY_STT },
    translation: { ...READY_TRANSLATION },
    ttsProvider: 'azure',
    blackHoleDetected: true,
    ...overrides,
  };
}

function byId(checks: PreflightCheck[], id: string): PreflightCheck {
  const found = checks.find((c) => c.id === id);
  assert.ok(found, `expected a check with id "${id}"`);
  return found;
}

test('all checks pass on a ready machine', () => {
  const checks = evaluatePreflight(makeInput());
  const summary = summarize(checks);
  assert.equal(summary.ok, true);
  assert.equal(summary.failed, 0);
  assert.equal(summary.warned, 0);
  for (const check of checks) {
    assert.equal(check.status, 'pass', `${check.id} should pass`);
  }
});

test('every build artifact is required and reports the build command when missing', () => {
  const missing = new Set([BUILD_ARTIFACTS[0].path, BUILD_ARTIFACTS[4].path]);
  const checks = evaluatePreflight(makeInput({ fileExists: (p) => !missing.has(p) }));
  assert.equal(summarize(checks).ok, false);
  for (const id of ['build.main', 'build.worklet']) {
    const check = byId(checks, id);
    assert.equal(check.status, 'fail');
    assert.match(check.detail ?? '', /npm run build/);
  }
  assert.equal(byId(checks, 'build.bundle').status, 'pass');
});

test('unconfigured STT or translation fails the preflight', () => {
  const checks = evaluatePreflight(
    makeInput({
      stt: { ok: false, provider: 'azure', message: 'missing AZURE_SPEECH_KEY' },
      translation: { ok: false, provider: 'azure', message: 'missing AZURE_TRANSLATOR_KEY' },
    }),
  );
  assert.equal(byId(checks, 'config.stt').status, 'fail');
  assert.equal(byId(checks, 'config.translation').status, 'fail');
  assert.equal(summarize(checks).ok, false);
  assert.match(byId(checks, 'config.stt').detail ?? '', /AZURE_SPEECH_KEY/);
});

test('non-macOS hosts fail', () => {
  const checks = evaluatePreflight(makeInput({ platform: 'linux' }));
  assert.equal(byId(checks, 'platform.macos').status, 'fail');
  assert.equal(summarize(checks).ok, false);
});

test('mock TTS and missing BlackHole are warnings, not failures', () => {
  const checks = evaluatePreflight(makeInput({ ttsProvider: 'mock', blackHoleDetected: false }));
  assert.equal(byId(checks, 'config.tts').status, 'warn');
  assert.equal(byId(checks, 'audio.blackhole').status, 'warn');
  const summary = summarize(checks);
  assert.equal(summary.ok, true, 'warnings must not block the round-trip test');
  assert.equal(summary.warned, 2);
});

test('report lists every check with status symbols and a verdict line', () => {
  const checks = evaluatePreflight(
    makeInput({ blackHoleDetected: false, stt: { ok: false, provider: 'azure', message: 'no key' } }),
  );
  const report = formatReport(checks);
  for (const check of checks) {
    assert.ok(report.includes(check.label), `report should include "${check.label}"`);
  }
  assert.match(report, /\[FAIL\]/);
  assert.match(report, /\[WARN\]/);
  assert.match(report, /check\(s\) failed/);

  const ready = formatReport(evaluatePreflight(makeInput()));
  assert.match(ready, /Ready for the round-trip protocol/);
  assert.match(ready, /docs\/meeting-validation\.md/);
});
