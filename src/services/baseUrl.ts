// Turning what a user types into the URL Wingman actually POSTs to.
//
// Wingman's convention is that the Base URL carries no endpoint path — the
// selected `ApiFormat` appends it (`/v1/chat/completions`, `/v1/messages`,
// `/v1/responses`). People reasonably paste the thing their provider's docs
// show them, which is usually the full endpoint or a base ending in `/v1`.
// Concatenating blindly then produced `…/v1/v1/chat/completions` and a 404 that
// reads like the gateway is broken. Normalising here means the common pastes
// all resolve to the same request.

/** Hosts the browser treats as the local machine (loopback address space). */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

/** Every endpoint path a format may append, longest first so the greedy match wins. */
const FORMAT_PATHS = ['/v1/chat/completions', '/v1/messages', '/v1/responses'] as const;

export interface NormalizedBaseUrl {
  /** Base URL with no trailing slash and no duplicated endpoint path. */
  base: string;
  /** `base` + the format path — the URL a request is actually sent to. */
  requestUrl: string;
  /** False when the input can't be turned into an absolute http(s) URL. */
  valid: boolean;
  /** Why it's unusable, shown to the user instead of a raw fetch TypeError. */
  problem?: string;
  /** What normalisation changed, so a surprising request URL is explainable. */
  note?: string;
}

/** True for a URL (or bare host) that points at the machine the browser runs on. */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return LOOPBACK_HOSTS.has(host) || host.endsWith('.localhost');
}

/**
 * Private / link-local IPv4 ranges plus IPv6 unique-local. Together with
 * loopback these are the "local network" address spaces browsers now gate
 * behind a user permission when the page itself is public.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isLoopbackHost(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;
  return host === 'localhost' || host.endsWith('.local');
}

/**
 * Whether a parsed hostname is one a DNS name, IPv4 literal or bracketed IPv6
 * literal could produce.
 *
 * Don't be tempted to let `new URL()` decide this. Chrome accepts spaces in a
 * host and percent-encodes them, so `new URL('https://not a url at all')`
 * resolves to the host `not%20a%20url%20at%20all` instead of throwing — while
 * Node and jsdom, which follow the spec here, do throw. Validating the host
 * ourselves is the only way the same input is rejected in the browser and in
 * the tests.
 */
export function hasValidHostname(hostname: string): boolean {
  if (!hostname) return false;
  return /^[a-z0-9._\-[\]:]+$/i.test(hostname);
}

/** Loopback hosts are served over plain http in dev; anything else defaults to https. */
function inferScheme(raw: string): string {
  const host = raw.split('/')[0]!.split(':')[0]!;
  return isLoopbackHost(host) ? 'http://' : 'https://';
}

/**
 * Strip an endpoint path the user pasted along with their base URL. Handles the
 * full endpoint (`…/v1/chat/completions`) and the far more common half-paste of
 * just the version segment (`…/v1`), which every format path already supplies.
 */
function stripEndpointPath(pathname: string, formatPath: string): { path: string; note?: string } {
  const path = pathname.replace(/\/+$/, '');
  for (const candidate of FORMAT_PATHS) {
    if (path.toLowerCase().endsWith(candidate)) {
      return {
        path: path.slice(0, -candidate.length),
        note: `Removed "${candidate}" — the format already appends it.`,
      };
    }
  }
  // `/v1` on its own: the format path starts with `/v1`, so keeping it would
  // double the version segment.
  if (formatPath.startsWith('/v1/') && /\/v1$/i.test(path)) {
    return { path: path.slice(0, -3), note: 'Removed a duplicate "/v1" segment.' };
  }
  return { path };
}

/**
 * Normalise a user-typed base URL and resolve the URL a request will be sent
 * to. Never throws — an unusable input comes back with `valid: false` and a
 * message, because the alternative was `fetch` throwing a raw TypeError (or,
 * worse, resolving a schemeless base relative to Wingman's own origin and
 * quietly sending the user's API key there).
 */
export function normalizeBaseUrl(raw: string, formatPath: string): NormalizedBaseUrl {
  const trimmed = raw.trim();
  const fail = (problem: string): NormalizedBaseUrl => ({
    base: trimmed,
    requestUrl: '',
    valid: false,
    problem,
  });

  if (!trimmed) return fail('Base URL is empty.');

  const notes: string[] = [];
  let candidate = trimmed;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    // A schemeless value is not a relative URL here — it's a host the user
    // didn't finish typing. Guess the scheme rather than letting `fetch`
    // resolve it against Wingman's origin.
    if (/^[a-z][a-z0-9+.-]*:/i.test(candidate) && !/^[a-z]+:\d+/i.test(candidate)) {
      return fail(`"${candidate.split(':')[0]}" is not a supported scheme — use http:// or https://.`);
    }
    const scheme = inferScheme(candidate);
    candidate = scheme + candidate;
    notes.push(`Added "${scheme}".`);
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return fail("That isn't a valid URL.");
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    const scheme = parsed.protocol.replace(/:$/, '');
    return fail(`"${scheme}" is not a supported scheme — use http:// or https://.`);
  }
  if (!hasValidHostname(parsed.hostname)) return fail("That isn't a valid URL.");

  if (parsed.search || parsed.hash) {
    parsed.search = '';
    parsed.hash = '';
    notes.push('Dropped the query string.');
  }

  const { path, note } = stripEndpointPath(parsed.pathname, formatPath);
  if (note) notes.push(note);

  const base = parsed.origin + path;
  return {
    base,
    requestUrl: base + formatPath,
    valid: true,
    note: notes.length > 0 ? notes.join(' ') : undefined,
  };
}
