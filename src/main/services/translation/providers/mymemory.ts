import type { TranslationProvider } from "../provider";
import { RateLimitError } from "../provider";
import { parseWindowMs } from "../config";

/**
 * Cooldown used when MyMemory returns HTTP 429 without a usable Retry-After.
 * Conservative default: MyMemory free tier is intended for development /
 * free-tier testing, not sustained real-time traffic.
 */
const DEFAULT_429_COOLDOWN_MS = 60000;

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function createMyMemoryProvider(): TranslationProvider {
  const fallbackCooldownMs = parseWindowMs(
    process.env.MYMEMORY_429_COOLDOWN_MS,
    "MYMEMORY_429_COOLDOWN_MS",
    DEFAULT_429_COOLDOWN_MS
  );

  // Provider-owned cooldown: while active, translate() fails fast WITHOUT
  // any HTTP request. Expires by time only — no automatic retries, and a
  // suppressed request is dropped, never queued for replay.
  let cooldownUntil = 0;

  // In-flight duplicate protection: identical normalized text being
  // translated concurrently shares one HTTP request/promise.
  const inFlight = new Map<string, Promise<string>>();

  /**
   * Parse the standard Retry-After header. Supports delta-seconds ("120")
   * and HTTP-date forms. Returns milliseconds from now, or null when
   * absent/invalid so the caller can use its configured fallback.
   */
  function parseRetryAfter(value: string | null): number | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      return parseInt(trimmed, 10) * 1000;
    }
    const when = Date.parse(trimmed);
    if (!Number.isNaN(when)) {
      return Math.max(0, when - Date.now());
    }
    return null;
  }

  async function request(text: string): Promise<string> {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ur|en`;

    let resp: Response;
    try {
      resp = await fetch(url);
    } catch (err) {
      // Network failure — NOT rate limiting; no cooldown, no retry.
      throw new Error(`MyMemory network error: ${errMessage(err)}`);
    }

    if (resp.status === 429) {
      const retryAfterMs = parseRetryAfter(resp.headers.get("retry-after"));
      const cooldownMs = retryAfterMs ?? fallbackCooldownMs;
      cooldownUntil = Date.now() + cooldownMs;
      throw new RateLimitError(
        `MyMemory rate limited (HTTP 429) — cooling down for ${Math.round(cooldownMs / 1000)}s`,
        cooldownMs
      );
    }

    if (!resp.ok) {
      // Distinguish common classes without retrying anything:
      //   400        → request/provider error
      //   401 / 403  → credentials/configuration error
      //   5xx        → temporary provider/server error
      throw new Error(`MyMemory HTTP ${resp.status}`);
    }

    const data = await resp.json();
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      return data.responseData.translatedText;
    }
    throw new Error(data.responseDetails || "MyMemory translation failed");
  }

  return {
    name: "mymemory",

    async translate(text: string): Promise<string> {
      const now = Date.now();
      if (now < cooldownUntil) {
        const remainingS = Math.ceil((cooldownUntil - now) / 1000);
        throw new RateLimitError(
          `MyMemory rate limited — cooling down (${remainingS}s remaining)`,
          cooldownUntil - now
        );
      }

      const key = text.normalize("NFC").replace(/\s+/g, " ").trim();
      const existing = inFlight.get(key);
      if (existing) return existing;

      const pending = request(text).finally(() => {
        inFlight.delete(key);
      });
      inFlight.set(key, pending);
      return pending;
    },
  };
}
