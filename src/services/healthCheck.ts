import { classifyFetchFailure, describeFailure, type FailureKind } from './diagnostics';
import { normalizeBaseUrl } from './baseUrl';

export type HealthStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; latencyMs: number; probedUrl: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'failed'; failure: FailureKind; label: string; message: string; probedUrl: string }
  | { kind: 'not-a-gateway'; message: string; probedUrl: string }
  | { kind: 'http-error'; status: number; statusText: string; probedUrl: string };

/**
 * A 200 alone doesn't mean a gateway answered. Anything serving a single-page
 * app (Wingman's own dev server, a catch-all reverse proxy, a hosting rewrite
 * rule) returns `200 text/html` for *every* path, health endpoint or not. That
 * turned a wrong base URL into a green "reachable" badge, which is the same
 * false confidence the probe exists to prevent.
 */
function looksLikeHtml(contentType: string | null, body: string): boolean {
  if (contentType && /text\/html/i.test(contentType)) return true;
  return body.trimStart().startsWith('<');
}

/**
 * Probe a gateway's health endpoint to give the connection bar a live badge.
 *
 * The health path is rooted at the *origin* (`{origin}/api/v1/health` is where
 * a Manifest gateway serves it), not under whatever path the base URL carries.
 * That used to be done with `new URL(path, base)`, which silently discarded the
 * base path, so a base of `…/v1` probed the right health endpoint, went green,
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

  // `normalized.base` is `origin + path` off a parsed URL, so resolving a
  // relative health path against it cannot fail. The try/catch that used to
  // wrap this guarded a branch nothing could reach.
  const probedUrl = new URL(path, normalized.base).toString();

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

  if (!res.ok) {
    return { kind: 'http-error', status: res.status, statusText: res.statusText, probedUrl };
  }

  const latencyMs = Math.round(performance.now() - started);
  let body = '';
  try {
    body = await res.text();
  } catch {
    /* an unreadable body is still a 200 from something; fall through */
  }
  if (looksLikeHtml(res.headers.get('content-type'), body)) {
    return {
      kind: 'not-a-gateway',
      message:
        `${probedUrl} returned HTML, not a health payload. That host is serving a web page ` +
        'for every path, so it is probably not the gateway. Check the Base URL.',
      probedUrl,
    };
  }
  return { kind: 'ok', latencyMs, probedUrl };
}
