import { classifyFetchFailure, describeFailure, type FailureKind } from './diagnostics';
import { normalizeBaseUrl } from './baseUrl';

export type HealthStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; latencyMs: number; probedUrl: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'failed'; failure: FailureKind; label: string; message: string; probedUrl: string }
  | { kind: 'http-error'; status: number; statusText: string; probedUrl: string };

/**
 * Probe a gateway's health endpoint to give the connection bar a live badge.
 *
 * The health path is rooted at the *origin* (`{origin}/api/v1/health` is where
 * a Manifest gateway serves it), not under whatever path the base URL carries.
 * That used to be done with `new URL(path, base)`, which silently discarded the
 * base path — so a base of `…/v1` probed the right health endpoint, went green,
 * and then the send 404'd against `…/v1/v1/chat/completions`. The badge now
 * reports the URL it actually probed so a green badge can't imply more than it
 * checked.
 */
export async function checkHealth(
  baseUrl: string,
  path: string,
  formatPath: string,
  signal?: AbortSignal,
): Promise<HealthStatus> {
  if (!baseUrl.trim()) return { kind: 'idle' };

  const normalized = normalizeBaseUrl(baseUrl, formatPath);
  if (!normalized.valid) {
    return { kind: 'invalid', message: normalized.problem ?? 'Invalid base URL.' };
  }

  let probedUrl: string;
  try {
    probedUrl = new URL(path, normalized.base).toString();
  } catch {
    return { kind: 'invalid', message: 'Invalid base URL.' };
  }

  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(probedUrl, { method: 'GET', signal });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return { kind: 'checking' };
    const failure = classifyFetchFailure(err, probedUrl);
    const advice = describeFailure(failure, probedUrl);
    return { kind: 'failed', failure, label: advice.label, message: advice.detail, probedUrl };
  }

  if (res.ok) {
    return { kind: 'ok', latencyMs: Math.round(performance.now() - started), probedUrl };
  }
  return { kind: 'http-error', status: res.status, statusText: res.statusText, probedUrl };
}
