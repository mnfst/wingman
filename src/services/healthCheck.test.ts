import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkHealth } from './healthCheck';

const HEALTH_PATH = '/api/v1/health';
const CHAT = '/v1/chat/completions';

function mockResponse(
  body: string,
  {
    status = 200,
    contentType = 'application/json',
  }: { status?: number; contentType?: string } = {},
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Not Found',
      headers: new Headers(contentType ? { 'content-type': contentType } : {}),
      text: async () => body,
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('checkHealth', () => {
  it('reports a JSON health payload as reachable', async () => {
    mockResponse('{"status":"healthy","uptime_seconds":42}');
    const result = await checkHealth('http://localhost:3001', HEALTH_PATH, CHAT);
    expect(result.kind).toBe('ok');
  });

  // The false green: anything with a single-page-app fallback answers *every*
  // path with 200 text/html, so a base URL pointing at a web server (including
  // Wingman itself) used to read as a healthy gateway.
  it('rejects an HTML body by content-type', async () => {
    mockResponse('<!doctype html><html><body>Wingman</body></html>', {
      contentType: 'text/html; charset=utf-8',
    });
    const result = await checkHealth('http://localhost:44321', HEALTH_PATH, CHAT);
    expect(result.kind).toBe('not-a-gateway');
    if (result.kind === 'not-a-gateway') {
      expect(result.message).toMatch(/HTML, not a health payload/);
      expect(result.message).toMatch(/Check the Base URL/);
    }
  });

  it('rejects an HTML body even when the content-type lies', async () => {
    mockResponse('  <!doctype html><html></html>', { contentType: 'application/json' });
    expect((await checkHealth('http://localhost:44321', HEALTH_PATH, CHAT)).kind).toBe(
      'not-a-gateway',
    );
  });

  it('accepts a non-JSON, non-HTML body rather than being over-strict', async () => {
    mockResponse('ok', { contentType: 'text/plain' });
    expect((await checkHealth('http://localhost:3001', HEALTH_PATH, CHAT)).kind).toBe('ok');
  });

  it('probes the origin, and says which URL it probed', async () => {
    mockResponse('{"status":"healthy"}');
    const result = await checkHealth('http://localhost:3001/v1', HEALTH_PATH, CHAT);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') expect(result.probedUrl).toBe('http://localhost:3001/api/v1/health');
  });

  it('surfaces a non-2xx as an http error', async () => {
    mockResponse('{"message":"Not Found"}', { status: 404 });
    const result = await checkHealth('http://localhost:3001', HEALTH_PATH, CHAT);
    expect(result.kind).toBe('http-error');
  });

  it('rejects an unusable base URL before fetching', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await checkHealth('not a url at all', HEALTH_PATH, CHAT);
    expect(result.kind).toBe('invalid');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is idle for an empty base URL', async () => {
    expect((await checkHealth('   ', HEALTH_PATH, CHAT)).kind).toBe('idle');
  });

  it('classifies a rejected fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const result = await checkHealth('http://localhost:59999', HEALTH_PATH, CHAT);
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') expect(result.label).toBe('unreachable');
  });
});
