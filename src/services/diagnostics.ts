// Why a browser fetch failed, and what the user can actually do about it.
//
// `fetch` reports DNS failure, connection refused, a CORS preflight rejection
// and an address-space block as the same opaque `TypeError: Failed to fetch`.
// Wingman used to resolve that ambiguity by always blaming CORS, which sent
// people off to edit an allow-list that was already correct. What we *can*
// determine from JS is the relationship between the page's origin and the
// target's: that alone identifies the two failures browsers introduced
// recently, and it's the difference between an actionable message and a
// wild goose chase.

import { isPrivateHost } from './baseUrl';

export type FailureKind =
  | 'network'
  | 'cors'
  | 'local-network'
  | 'mixed-content'
  | 'aborted'
  | 'unknown';

export interface FailureAdvice {
  /** Short badge text. */
  label: string;
  /** One or two sentences naming the cause and the fix. */
  detail: string;
}

function pageProtocol(): string {
  if (typeof window === 'undefined') return 'https:';
  return window.location.protocol;
}

function pageOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

/**
 * Classify a rejected fetch. `targetUrl` is the URL that was being requested;
 * an unparseable one falls back to `unknown` rather than guessing.
 */
export function classifyFetchFailure(err: unknown, targetUrl: string): FailureKind {
  if (err instanceof DOMException && err.name === 'AbortError') return 'aborted';

  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    return 'unknown';
  }

  if (pageProtocol() === 'https:') {
    // A public HTTPS page reaching into the local network is gated by Chrome's
    // Local Network Access permission (which replaced Private Network Access:
    // no server header can satisfy it any more) and blocked outright by
    // Safari's mixed-content rules. Either way it is not a CORS problem, and
    // no change to the target server will fix it.
    if (isPrivateHost(target.hostname)) return 'local-network';
    if (target.protocol === 'http:') return 'mixed-content';
  }

  const message = err instanceof Error ? err.message : String(err);
  if (/fetch/i.test(message) || err instanceof TypeError) return 'network';
  return 'unknown';
}

/** User-facing wording for a failure kind. Shared by the health badge and the send result. */
export function describeFailure(kind: FailureKind, targetUrl: string): FailureAdvice {
  let host = targetUrl;
  try {
    host = new URL(targetUrl).host;
  } catch {
    /* keep the raw string */
  }

  switch (kind) {
    case 'local-network':
      return {
        label: 'local network blocked',
        detail:
          `The browser blocked this request: ${pageOrigin()} is a public page and ${host} is on ` +
          'your local network. Chrome gates that behind the Local Network Access permission and ' +
          'Safari refuses it outright — no CORS or server-side change will lift it. Run Wingman ' +
          'on localhost (or open it from your dashboard\'s own origin) to reach a local gateway.',
      };
    case 'mixed-content':
      return {
        label: 'mixed content',
        detail:
          `${pageOrigin()} is served over HTTPS, so the browser refuses to call ${host} over ` +
          'plain HTTP. Use an https:// base URL, or run Wingman over HTTP alongside the gateway.',
      };
    case 'cors':
      return {
        label: 'CORS blocked',
        detail: `${host} answered, but without an Access-Control-Allow-Origin header for ${pageOrigin()}.`,
      };
    case 'aborted':
      return { label: 'cancelled', detail: 'The request was cancelled.' };
    case 'network':
      return {
        label: 'unreachable',
        detail:
          `Couldn't reach ${host}. The browser reports connection failures and CORS rejections ` +
          'identically, so this is one of: nothing listening on that host and port, the wrong ' +
          `base URL, or a CORS allow-list that doesn't include ${pageOrigin()}. The browser ` +
          'console shows which.',
      };
    default:
      return { label: 'failed', detail: `The request to ${host} failed.` };
  }
}
