export type HealthStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; latencyMs: number }
  | { kind: 'cors'; message: string }
  | { kind: 'network'; message: string }
  | { kind: 'http-error'; status: number; statusText: string };

export async function checkHealth(
  baseUrl: string,
  path: string,
  signal?: AbortSignal,
): Promise<HealthStatus> {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return { kind: 'idle' };

  let url: string;
  try {
    url = new URL(path, trimmed).toString();
  } catch {
    return { kind: 'network', message: 'Invalid URL' };
  }

  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', signal });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return { kind: 'checking' };
    // Browsers surface CORS preflight failures and DNS / connection errors as
    // the same `TypeError: Failed to fetch`. We can't reliably tell them apart
    // from JS, so we report "network" with a hint that points at the most
    // common cause for hosted Wingman: a missing allow-list entry.
    const message = err instanceof Error ? err.message : String(err);
    const looksLikeCors =
      /failed to fetch|networkerror|load failed/i.test(message) && hasOrigin(trimmed);
    if (looksLikeCors) {
      return {
        kind: 'cors',
        message: `Couldn't reach ${trimmed}. Likely CORS — your backend must allow ${origin()}.`,
      };
    }
    return { kind: 'network', message };
  }

  if (res.ok) {
    return { kind: 'ok', latencyMs: Math.round(performance.now() - started) };
  }
  return { kind: 'http-error', status: res.status, statusText: res.statusText };
}

function origin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

function hasOrigin(target: string): boolean {
  try {
    return new URL(target).origin !== origin();
  } catch {
    return false;
  }
}
