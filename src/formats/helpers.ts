// Tiny safe-access helpers so each format can narrow `unknown` response JSON
// without repeating the same guards.

export function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

export function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

export function asArray(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}

/** Parse SSE `data` JSON, returning null for `[DONE]` and malformed payloads. */
export function parseData(data: string): Record<string, unknown> | null {
  const trimmed = data.trim();
  if (!trimmed || trimmed === '[DONE]') return null;
  try {
    return asRecord(JSON.parse(trimmed));
  } catch {
    return null;
  }
}
