/**
 * Shared configuration parsing for translation reliability features.
 *
 * Kept in its own module so both the provider implementations and the
 * TranslationManager can use it without circular imports.
 */

/**
 * Parse a non-negative integer millisecond window from an env var.
 * Absent/empty → fallback. Non-numeric or negative → warn + fallback.
 * 0 is valid and disables the window (matches TTS_DEDUPE_WINDOW_MS convention).
 */
export function parseWindowMs(
  raw: string | undefined,
  envName: string,
  fallback: number
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    console.warn(
      `[CONFIG] ${envName}="${raw}" is not a non-negative integer — using ${fallback}ms`
    );
    return fallback;
  }
  return parseInt(trimmed, 10);
}
