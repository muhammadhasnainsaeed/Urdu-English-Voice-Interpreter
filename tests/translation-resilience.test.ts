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

/**
 * Deterministic tests for translation-provider resilience:
 * MyMemory 429 cooldown, Retry-After handling, error classification,
 * in-flight duplicate protection, and manager rate-limited surfacing.
 *
 * Run:  npx tsx tests/translation-resilience.test.ts
 *
 * Uses a stubbed global fetch — no real network calls.
 */

import {
  TranslationManager,
} from "../src/main/services/translation/manager";
import { RateLimitError } from "../src/main/services/translation/provider";
import type {
  SessionEvent,
  TranslationEvent,
} from "../packages/shared/index";

/* ------------------------------------------------------------------ */
/*  Fetch stub                                                         */
/* ------------------------------------------------------------------ */

type FetchStub = (url: string) => Promise<Response>;

interface FetchControl {
  calls: string[];
  /** Responses served in order; last one repeats. */
  queue: Response[];
  /** Optional delay per request (ms) to simulate latency. */
  delayMs: number;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function okTranslation(text: string): Response {
  return jsonResponse({
    responseStatus: 200,
    responseData: { translatedText: text },
  });
}

function installFetch(control: FetchControl): void {
  globalThis.fetch = ((url: string | URL | Request): Promise<Response> => {
    control.calls.push(String(url));
    const resp = control.queue.length > 1
      ? control.queue.shift()!
      : control.queue[0];
    if (control.delayMs > 0) {
      return new Promise((resolve) =>
        setTimeout(() => resolve(resp), control.delayMs)
      );
    }
    return Promise.resolve(resp);
  }) as unknown as typeof fetch;
}

function restoreFetch(): void {
  delete (globalThis as { fetch?: unknown }).fetch;
}

/* ------------------------------------------------------------------ */
/*  Test runner (same pattern as session.test.ts)                      */
/* ------------------------------------------------------------------ */

type TestFn = () => Promise<void>;

interface TestCase {
  name: string;
  fn: TestFn;
}

const results: { name: string; pass: boolean; reason?: string }[] = [];

async function runTests(cases: TestCase[]) {
  console.log(`\nRunning ${cases.length} tests...\n`);
  for (const tc of cases) {
    try {
      await tc.fn();
      results.push({ name: tc.name, pass: true });
      console.log(`  ✓ ${tc.name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name: tc.name, pass: false, reason: msg });
      console.log(`  ✗ ${tc.name}`);
      console.log(`    ${msg}`);
    }
  }

  console.log("\n--- Summary ---");
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log(`${passed} passed, ${failed} failed, ${results.length} total`);
  if (failed > 0) {
    console.log("\nFailed:");
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  ✗ ${r.name}: ${r.reason}`);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

function drainMicrotasks(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

async function drainQueue(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await drainMicrotasks();
  }
}

/* ------------------------------------------------------------------ */
/*  Provider-level tests (direct createMyMemoryProvider usage via env) */
/* ------------------------------------------------------------------ */

async function makeProvider(): Promise<TranslationProviderLike> {
  process.env.TRANSLATION_PROVIDER = "mymemory";
  const mod = await import("../src/main/services/translation/provider");
  return (await mod.createTranslationProvider())!;
}
type TranslationProviderLike = {
  name: string;
  translate(text: string): Promise<string>;
};

const tests: TestCase[] = [
  {
    name: "429: enters cooldown — immediate retry makes no HTTP request",
    async fn() {
      process.env.MYMEMORY_429_COOLDOWN_MS = "60000";
      const control: FetchControl = {
        calls: [],
        queue: [new Response(null, { status: 429 })],
        delayMs: 0,
      };
      installFetch(control);
      try {
        const provider = await makeProvider();
        let firstErr: unknown;
        try {
          await provider.translate("مرحبا");
        } catch (e) {
          firstErr = e;
        }
        if (!(firstErr instanceof RateLimitError)) {
          throw new Error(`Expected RateLimitError, got: ${String(firstErr)}`);
        }
        // Immediate second call must be suppressed WITHOUT hitting fetch.
        let secondErr: unknown;
        try {
          await provider.translate("مرحبا");
        } catch (e) {
          secondErr = e;
        }
        if (!(secondErr instanceof RateLimitError)) {
          throw new Error("Second call during cooldown should be RateLimitError");
        }
        if (control.calls.length !== 1) {
          throw new Error(`Expected 1 HTTP request, got ${control.calls.length}`);
        }
      } finally {
        restoreFetch();
        delete process.env.MYMEMORY_429_COOLDOWN_MS;
      }
    },
  },

  {
    name: "Retry-After: delta-seconds is respected over fallback",
    async fn() {
      process.env.MYMEMORY_429_COOLDOWN_MS = "10"; // tiny fallback
      const control: FetchControl = {
        calls: [],
        queue: [
          new Response(null, { status: 429, headers: { "retry-after": "1" } }),
          okTranslation("Recovered"),
        ],
        delayMs: 0,
      };
      installFetch(control);
      try {
        const provider = await makeProvider();
        try {
          await provider.translate("text");
        } catch { /* expected 429 */ }
        // Fallback would have expired in 10ms; Retry-After (1s) must hold.
        await new Promise((r) => setTimeout(r, 100));
        let err: unknown;
        try {
          await provider.translate("text");
        } catch (e) {
          err = e;
        }
        if (!(err instanceof RateLimitError)) {
          throw new Error("Retry-After cooldown should still be active at 100ms");
        }
        if (control.calls.length !== 1) {
          throw new Error(`Expected still 1 request, got ${control.calls.length}`);
        }
        // After the 1s Retry-After window, the next call goes through.
        await new Promise((r) => setTimeout(r, 1000));
        const result = await provider.translate("text");
        if (result !== "Recovered") throw new Error(`Expected recovery, got ${result}`);
        if (control.calls.length !== 2) {
          throw new Error(`Expected 2 requests total, got ${control.calls.length}`);
        }
      } finally {
        restoreFetch();
        delete process.env.MYMEMORY_429_COOLDOWN_MS;
      }
    },
  },

  {
    name: "Retry-After: past HTTP-date means zero cooldown (immediate recovery)",
    async fn() {
      process.env.MYMEMORY_429_COOLDOWN_MS = "60000";
      const pastDate = new Date(Date.now() - 5000).toUTCString();
      const control: FetchControl = {
        calls: [],
        queue: [
          new Response(null, {
            status: 429,
            headers: { "retry-after": pastDate },
          }),
          okTranslation("Back"),
        ],
        delayMs: 0,
      };
      installFetch(control);
      try {
        const provider = await makeProvider();
        try {
          await provider.translate("t");
        } catch { /* 429 */ }
        // Past date → max(0, …) = 0ms cooldown → next call hits fetch now.
        const result = await provider.translate("t");
        if (result !== "Back") throw new Error(`Expected immediate recovery, got ${result}`);
        if (control.calls.length !== 2) {
          throw new Error(`Expected 2 requests, got ${control.calls.length}`);
        }
      } finally {
        restoreFetch();
        delete process.env.MYMEMORY_429_COOLDOWN_MS;
      }
    },
  },

  {
    name: "Fallback cooldown: used when Retry-After absent, expires by time",
    async fn() {
      process.env.MYMEMORY_429_COOLDOWN_MS = "50";
      const control: FetchControl = {
        calls: [],
        queue: [new Response(null, { status: 429 }), okTranslation("After")],
        delayMs: 0,
      };
      installFetch(control);
      try {
        const provider = await makeProvider();
        try {
          await provider.translate("x");
        } catch { /* 429 */ }
        await new Promise((r) => setTimeout(r, 80)); // > 50ms fallback
        const result = await provider.translate("x");
        if (result !== "After") throw new Error(`Expected success after fallback expiry, got ${result}`);
        if (control.calls.length !== 2) {
          throw new Error(`Expected 2 requests, got ${control.calls.length}`);
        }
      } finally {
        restoreFetch();
        delete process.env.MYMEMORY_429_COOLDOWN_MS;
      }
    },
  },

  {
    name: "In-flight: identical concurrent text shares one HTTP request",
    async fn() {
      process.env.MYMEMORY_429_COOLDOWN_MS = "";
      const control: FetchControl = {
        calls: [],
        queue: [okTranslation("Shared result")],
        delayMs: 40,
      };
      installFetch(control);
      try {
        const provider = await makeProvider();
        const [a, b] = await Promise.all([
          provider.translate("same text"),
          provider.translate("same text"),
        ]);
        if (a !== b || a !== "Shared result") {
          throw new Error(`Concurrent calls should share result, got "${a}" / "${b}"`);
        }
        if (control.calls.length !== 1) {
          throw new Error(`Expected 1 HTTP request for duplicates, got ${control.calls.length}`);
        }
      } finally {
        restoreFetch();
        delete process.env.MYMEMORY_429_COOLDOWN_MS;
      }
    },
  },

  {
    name: "Classification: 400 is a plain error, NOT rate-limit, no cooldown",
    async fn() {
      const control: FetchControl = {
        calls: [],
        queue: [jsonResponse({ error: "bad" }, 400), okTranslation("Ok")],
        delayMs: 0,
      };
      installFetch(control);
      try {
        const provider = await makeProvider();
        let err: unknown;
        try {
          await provider.translate("a");
        } catch (e) {
          err = e;
        }
        if (err instanceof RateLimitError) throw new Error("400 must not be RateLimitError");
        if (!(err instanceof Error) || !err.message.includes("400")) {
          throw new Error(`Expected HTTP 400 message, got: ${String(err)}`);
        }
        // No cooldown: next call reaches fetch immediately.
        await provider.translate("b");
        if (control.calls.length !== 2) {
          throw new Error(`Expected 2 requests (no cooldown), got ${control.calls.length}`);
        }
      } finally {
        restoreFetch();
      }
    },
  },

  {
    name: "Classification: 401/403 are config errors, NOT rate-limit",
    async fn() {
      for (const status of [401, 403]) {
        const control: FetchControl = {
          calls: [],
          queue: [new Response(null, { status }), okTranslation("Ok")],
          delayMs: 0,
        };
        installFetch(control);
        try {
          const provider = await makeProvider();
          let err: unknown;
          try {
            await provider.translate("a");
          } catch (e) {
            err = e;
          }
          if (err instanceof RateLimitError) {
            throw new Error(`${status} must not be RateLimitError`);
          }
          await provider.translate("b"); // must reach fetch (no cooldown)
          if (control.calls.length !== 2) {
            throw new Error(`${status}: expected no cooldown, got ${control.calls.length} requests`);
          }
        } finally {
          restoreFetch();
        }
      }
    },
  },

  {
    name: "Classification: 5xx is temporary server error, NOT rate-limit",
    async fn() {
      const control: FetchControl = {
        calls: [],
        queue: [new Response(null, { status: 503 }), okTranslation("Ok")],
        delayMs: 0,
      };
      installFetch(control);
      try {
        const provider = await makeProvider();
        let err: unknown;
        try {
          await provider.translate("a");
        } catch (e) {
          err = e;
        }
        if (err instanceof RateLimitError) throw new Error("503 must not be RateLimitError");
        await provider.translate("b");
        if (control.calls.length !== 2) {
          throw new Error(`Expected no cooldown after 5xx, got ${control.calls.length} requests`);
        }
      } finally {
        restoreFetch();
      }
    },
  },

  {
    name: "Classification: network failure is NOT rate-limit",
    async fn() {
      globalThis.fetch = (() =>
        Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;
      try {
        const provider = await makeProvider();
        let err: unknown;
        try {
          await provider.translate("a");
        } catch (e) {
          err = e;
        }
        if (err instanceof RateLimitError) throw new Error("Network failure must not be RateLimitError");
        if (!(err instanceof Error) || !err.message.includes("network error")) {
          throw new Error(`Expected network error message, got: ${String(err)}`);
        }
        // No cooldown — a follow-up call attempts the network again.
        let secondErr: unknown;
        try {
          await provider.translate("b");
        } catch (e) {
          secondErr = e;
        }
        if (!(secondErr instanceof Error) || !secondErr.message.includes("network error")) {
          throw new Error("Second call should also reach the network (no cooldown)");
        }
      } finally {
        restoreFetch();
      }
    },
  },

  /* ---------------------------------------------------------------- */
  /*  Manager-level integration                                        */
  /* ---------------------------------------------------------------- */

  {
    name: "Manager: 429 surfaces rate-limited state; no auto-retry; recovers on next final",
    async fn() {
      process.env.MYMEMORY_429_COOLDOWN_MS = "30";
      const control: FetchControl = {
        calls: [],
        queue: [new Response(null, { status: 429 }), okTranslation("Recovered!")],
        delayMs: 0,
      };
      installFetch(control);
      const events: TranslationEvent[] = [];
      const mgr = new TranslationManager(60000); // long STT-dedupe window
      try {
        await mgr.start((e) => events.push(e));

        // First final → 429 → rate-limited event, item dropped.
        mgr.onSttText("الاول", true);
        await drainQueue();

        const limited = events.filter((e) => e.type === "translation:rate-limited");
        if (limited.length !== 1) {
          throw new Error(`Expected 1 rate-limited event, got ${limited.length}`);
        }
        const msg = (limited[0] as { message: string }).message;
        if (msg !== "Translation temporarily rate-limited") {
          throw new Error(`Unexpected user-facing message: ${msg}`);
        }
        if (events.some((e) => e.type === "translation:text")) {
          throw new Error("No translation should succeed while rate-limited");
        }
        if (control.calls.length !== 1) {
          throw new Error(`Cooldown should prevent further HTTP, got ${control.calls.length}`);
        }

        // A duplicate final during cooldown is dropped by upstream STT dedupe
        // AND would hit provider cooldown anyway — still exactly 1 request.
        mgr.onSttText("الاول", true);
        await drainQueue();
        if (control.calls.length !== 1) {
          throw new Error(`No HTTP during cooldown, got ${control.calls.length}`);
        }

        // Cooldown expires (30ms). Next LEGITIMATE final (different text —
        // identical one is still inside the STT dedupe window) succeeds.
        await new Promise((r) => setTimeout(r, 50));
        mgr.onSttText("الثاني", true);
        await drainQueue();

        const texts = events.filter((e) => e.type === "translation:text");
        if (texts.length !== 1) {
          throw new Error(`Expected 1 successful translation after recovery, got ${texts.length}`);
        }
        if ((texts[0] as { english: string }).english !== "Recovered!") {
          throw new Error("Recovery translation returned wrong text");
        }
        if (control.calls.length !== 2) {
          throw new Error(`Expected exactly 2 HTTP requests total, got ${control.calls.length}`);
        }
      } finally {
        mgr.stop();
        restoreFetch();
        delete process.env.MYMEMORY_429_COOLDOWN_MS;
        process.env.TRANSLATION_PROVIDER = "";
      }
    },
  },

  {
    name: "Manager: TTS chain receives nothing for failed/rate-limited translations",
    async fn() {
      process.env.TRANSLATION_PROVIDER = "mymemory";
      process.env.MYMEMORY_429_COOLDOWN_MS = "5000";
      const control: FetchControl = {
        calls: [],
        queue: [new Response(null, { status: 429 })],
        delayMs: 0,
      };
      installFetch(control);
      const events: TranslationEvent[] = [];
      const sessionEvents: SessionEvent[] = [];
      const mgr = new TranslationManager(0); // dedupe off: every final reaches provider
      try {
        await mgr.start((e) => events.push(e));

        // Three finals while rate-limited → three suppressed attempts,
        // zero translation:text events → zero TTS invocations downstream.
        mgr.onSttText("واحد", true);
        mgr.onSttText("اثنان", true);
        mgr.onSttText("ثلاثة", true);
        await drainQueue();

        const textEvents = events.filter((e) => e.type === "translation:text");
        if (textEvents.length !== 0) {
          throw new Error(`Rate-limited translations must not emit text events, got ${textEvents.length}`);
        }
        const limited = events.filter((e) => e.type === "translation:rate-limited");
        if (limited.length !== 3) {
          throw new Error(`Expected 3 rate-limited events, got ${limited.length}`);
        }
        if (control.calls.length !== 1) {
          throw new Error(`Only the first attempt may hit HTTP, got ${control.calls.length}`);
        }
        void sessionEvents;
      } finally {
        mgr.stop();
        restoreFetch();
        delete process.env.MYMEMORY_429_COOLDOWN_MS;
        process.env.TRANSLATION_PROVIDER = "";
      }
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Run                                                                */
/* ------------------------------------------------------------------ */

runTests(tests);
