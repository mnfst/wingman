// The paths that only run when the browser says no: a storage quota that is
// full, a permissions policy that blocks sessionStorage outright, a body that
// cannot be read. None of them may take the app down, because none of them stop
// the user from sending the next request.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  purgeLegacyStorage,
  readQueryParam,
  readStorage,
  removeStorage,
  STORAGE,
  writeStorage,
} from './settings';
import { checkHealth } from './healthCheck';
import { describeFailure } from './diagnostics';
import { highlight } from './highlight';
import { defaultBaseUrl, normalizeBaseUrl, isPrivateHost } from './baseUrl';
import { MANIFEST_BASE_URL } from '../providers';

const CHAT = '/v1/chat/completions';

/** Make every Storage method throw, the way a blocked third-party context does. */
function blockStorage() {
  const boom = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom);
}

describe('storage that refuses to work', () => {
  it('falls back to the default on read', () => {
    blockStorage();
    expect(readStorage(STORAGE.model, 'auto')).toBe('auto');
  });

  it('drops a write rather than throwing', () => {
    blockStorage();
    expect(() => writeStorage(STORAGE.model, 'gpt-4o')).not.toThrow();
  });

  it('drops a removal rather than throwing', () => {
    blockStorage();
    expect(() => removeStorage(STORAGE.model)).not.toThrow();
  });

  // This one runs on boot, before anything is on screen. Throwing here would
  // leave a blank page.
  it('survives a purge it is not allowed to perform', () => {
    blockStorage();
    expect(() => purgeLegacyStorage()).not.toThrow();
  });
});

describe('readQueryParam with an unreadable location', () => {
  const original = window.location;
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });

  it('returns null rather than throwing', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'not a url' },
    });
    expect(readQueryParam('baseUrl')).toBeNull();
  });
});

describe('a health response the browser will not let us read', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.reject(new TypeError('body already consumed')),
      } as unknown as Response),
    );
  });

  // A 200 from something is still a 200; an unreadable body is not a failure.
  it('still counts as reachable', async () => {
    const result = await checkHealth('http://localhost:3001', '/api/v1/health', CHAT);
    expect(result.kind).toBe('ok');
  });
});

describe('a health probe that is cancelled mid-flight', () => {
  // Retargeting the URL bar aborts the in-flight probe. That is not a failure
  // of the endpoint, so the badge stays on "checking" rather than going red.
  it('stays in the checking state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError')),
    );
    const result = await checkHealth('http://localhost:3001', '/api/v1/health', CHAT);
    expect(result).toEqual({ kind: 'checking' });
  });
});

describe('describeFailure for the remaining kinds', () => {
  it('names the origin a CORS allow-list is missing', () => {
    const advice = describeFailure('cors', 'https://gw.example.com/v1/chat/completions');
    expect(advice.label).toBe('CORS blocked');
    expect(advice.detail).toContain('gw.example.com');
    expect(advice.detail).toContain('Access-Control-Allow-Origin');
  });

  it('says a cancelled request was cancelled', () => {
    expect(describeFailure('aborted', 'https://gw.example.com')).toEqual({
      label: 'cancelled',
      detail: 'The request was cancelled.',
    });
  });

  it('falls back to a plain statement for an unclassified failure', () => {
    const advice = describeFailure('unknown', 'https://gw.example.com/v1/chat/completions');
    expect(advice.label).toBe('failed');
    expect(advice.detail).toBe('The request to gw.example.com failed.');
  });

  // The URL is whatever was in the field, so it need not parse.
  it('keeps an unparseable target as written', () => {
    expect(describeFailure('network', 'not a url').detail).toContain('not a url');
  });
});

describe('highlight when the highlighter itself fails', () => {
  it('falls back to escaped text', async () => {
    const hljs = (await import('highlight.js/lib/core')).default;
    vi.spyOn(hljs, 'highlight').mockImplementation(() => {
      throw new Error('highlighter blew up');
    });
    expect(highlight('<b>x</b>', 'json')).toBe('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('base URL edge cases', () => {
  // mDNS names resolve on the local network, so they hit the same browser gate
  // as a private IP.
  it('treats an mDNS .local name as a private host', () => {
    expect(isPrivateHost('my-gateway.local')).toBe(true);
  });

  // IPv6 unique-local addresses are the v6 equivalent of 10./192.168., so they
  // hit the same browser gate.
  it.each(['fc00::1', 'fd12:3456::1', '[fd00::1]'])('treats %s as a private host', (host) => {
    expect(isPrivateHost(host)).toBe(true);
  });

  it('drops a fragment even with no query string', () => {
    const result = normalizeBaseUrl('https://gw.example.com/#frag', CHAT);
    expect(result.requestUrl).toBe('https://gw.example.com/v1/chat/completions');
    expect(result.note).toContain('Dropped the query string.');
  });

  it('drops a query string and fragment from the base URL', () => {
    const result = normalizeBaseUrl('https://gw.example.com/?token=abc#frag', CHAT);
    expect(result.requestUrl).toBe('https://gw.example.com/v1/chat/completions');
    expect(result.note).toContain('Dropped the query string.');
  });

  it('reads the page location when no location is supplied', () => {
    // jsdom serves the suite from a loopback origin, which is the dev case.
    expect(defaultBaseUrl()).toBe('http://localhost:3001');
  });

  it('points at the hosted gateway from a public page', () => {
    expect(
      defaultBaseUrl({ protocol: 'https:', hostname: 'wingman.manifest.build', port: '' }),
    ).toBe(MANIFEST_BASE_URL);
  });
});
