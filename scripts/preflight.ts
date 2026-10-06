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

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describeSttConfig, describeTranslationConfig, loadRuntimeConfig } from '../src/main/config';
import { resolveTtsProviderName } from '../src/main/services/tts/voices';
import { detectBlackHole } from '../src/main/services/audio-output/manager';
import type { SttConfigStatus, TranslationConfigStatus } from '../src/main/config';

/**
 * Meeting preflight (`npm run preflight`).
 *
 * Verifies everything the meeting round-trip protocol
 * (`docs/meeting-validation.md`) assumes: a complete build, usable provider
 * configuration, a macOS host, and BlackHole for audio routing. The pure
 * `evaluatePreflight()` core takes injected inputs so the rules are unit
 * tested; `main()` wires in the real filesystem/environment.
 */

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface PreflightCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

export interface PreflightInput {
  /** True when a build artifact exists (path relative to the repo root). */
  fileExists: (relativePath: string) => boolean;
  platform: string;
  stt: SttConfigStatus;
  translation: TranslationConfigStatus;
  ttsProvider: string;
  blackHoleDetected: boolean;
}

/** Build artifacts a runnable app requires (worklet included since M8). */
export const BUILD_ARTIFACTS: ReadonlyArray<{ id: string; path: string; label: string }> = [
  { id: 'build.main', path: 'dist/main/index.js', label: 'Main process bundle' },
  { id: 'build.preload', path: 'dist/preload/index.js', label: 'Preload bundle' },
  { id: 'build.renderer', path: 'dist/renderer/index.html', label: 'Renderer shell' },
  { id: 'build.bundle', path: 'dist/renderer/bundle.js', label: 'Renderer bundle' },
  { id: 'build.worklet', path: 'dist/renderer/pcm-processor.js', label: 'AudioWorklet processor' },
];

export function evaluatePreflight(input: PreflightInput): PreflightCheck[] {
  const checks: PreflightCheck[] = [];

  for (const artifact of BUILD_ARTIFACTS) {
    const present = input.fileExists(artifact.path);
    checks.push({
      id: artifact.id,
      label: `${artifact.label} (${artifact.path})`,
      status: present ? 'pass' : 'fail',
      detail: present ? undefined : 'Missing — run `npm run build`.',
    });
  }

  checks.push({
    id: 'platform.macos',
    label: 'macOS host',
    status: input.platform === 'darwin' ? 'pass' : 'fail',
    detail:
      input.platform === 'darwin'
        ? undefined
        : `Detected "${input.platform}" — the interpreter targets macOS.`,
  });

  checks.push({
    id: 'config.stt',
    label: `Speech-to-text (${input.stt.provider})`,
    status: input.stt.ok ? 'pass' : 'fail',
    detail: input.stt.message,
  });

  checks.push({
    id: 'config.translation',
    label: `Translation (${input.translation.provider})`,
    status: input.translation.ok ? 'pass' : 'fail',
    detail: input.translation.message,
  });

  const ttsIsMock = input.ttsProvider === 'mock' || input.ttsProvider === 'none';
  checks.push({
    id: 'config.tts',
    label: `Text-to-speech (${input.ttsProvider})`,
    status: ttsIsMock ? 'warn' : 'pass',
    detail: ttsIsMock
      ? 'TTS produces no audible speech — fine for development, not for a meeting test.'
      : undefined,
  });

  checks.push({
    id: 'audio.blackhole',
    label: 'BlackHole virtual microphone',
    status: input.blackHoleDetected ? 'pass' : 'warn',
    detail: input.blackHoleDetected
      ? undefined
      : 'Not detected — install BlackHole to route interpreted speech into meeting apps.',
  });

  return checks;
}

export interface PreflightSummary {
  failed: number;
  warned: number;
  ok: boolean;
}

export function summarize(checks: PreflightCheck[]): PreflightSummary {
  const failed = checks.filter((c) => c.status === 'fail').length;
  const warned = checks.filter((c) => c.status === 'warn').length;
  return { failed, warned, ok: failed === 0 };
}

const SYMBOL: Record<CheckStatus, string> = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' };

export function formatReport(checks: PreflightCheck[]): string {
  const lines = ['Meeting preflight', '=================='];
  for (const check of checks) {
    lines.push(`[${SYMBOL[check.status]}] ${check.label}`);
    if (check.detail) lines.push(`       ${check.detail}`);
  }
  const { failed, warned, ok } = summarize(checks);
  lines.push('');
  lines.push(
    ok
      ? `Ready for the round-trip protocol (${warned} warning(s)). See docs/meeting-validation.md.`
      : `${failed} check(s) failed, ${warned} warning(s). Fix failures before testing a meeting.`,
  );
  return lines.join('\n');
}

function main(): void {
  const repoRoot = path.resolve(__dirname, '..');

  // Mirror the app's configuration loading: repo `.env` (development), then
  // the user-owned runtime config, then the process environment.
  loadRuntimeConfig([path.join(repoRoot, '.env')]);

  const checks = evaluatePreflight({
    fileExists: (relativePath) => fs.existsSync(path.join(repoRoot, relativePath)),
    platform: process.platform,
    stt: describeSttConfig(),
    translation: describeTranslationConfig(),
    ttsProvider: resolveTtsProviderName(),
    blackHoleDetected: detectBlackHole(),
  });

  console.log(formatReport(checks));
  process.exitCode = summarize(checks).ok ? 0 : 1;
}

if (require.main === module) {
  main();
}
