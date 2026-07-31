import { beforeEach, describe, expect, it, vi } from 'vitest';
import { partitionHeaders, sendRequest, type SendInput } from './send';

const input = (over: Partial<SendInput> = {}): SendInput => ({
  url: 'https://api.example.com/v1/chat/completions',
  apiKey: 'sk-test',
  headers: {},
  body: { model: 'auto', messages: [] },
  ...over,
});

/** Minimal Response stand-in — jsdom's fetch is stubbed, not implemented. */
function jsonResponse(
  body: string,
  init: { status?: number; statusText?: string; headers?: Record<string, string> } = {},
) {
  const status = init.status ?? 200;
  return {
    status,
    statusText: init.statusText ?? 'OK',
    ok: status >= 200 && status < 300,
    headers: new Headers(init.headers ?? { 'content-type': 'application/json' }),
    text: () => Promise.resolve(body),
    body: null,
  } as unknown as Response;
}

const fetchMock = vi.fn();

/** The single request the call under test made. */
function lastCall(): [string, RequestInit] {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error('no request was made');
  return call as [string, RequestInit];
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('partitionHeaders', () => {
  it('keeps headers the browser will actually send', () => {
    const { allowed, blocked } = partitionHeaders({ 'X-Stainless-Lang': 'js' });
    expect(allowed).toEqual({ 'X-Stainless-Lang': 'js' });
    expect(blocked).toEqual([]);
  });

  // The point of surfacing these is that the SDK profiles set a User-Agent the
  // browser silently drops — users need to know the fingerprint is incomplete.
  it('blocks headers fetch forbids, case-insensitively', () => {
    const { allowed, blocked } = partitionHeaders({
      'User-Agent': 'OpenAI/JS',
      COOKIE: 'a=b',
      Host: 'evil.example.com',
    });
    expect(allowed).toEqual({});
    expect(blocked).toEqual(['User-Agent', 'COOKIE', 'Host']);
  });

  it.each(['Proxy-Authorization', 'Sec-Fetch-Mode'])('blocks the %s prefix family', (name) => {
    expect(partitionHeaders({ [name]: 'x' }).blocked).toEqual([name]);
  });

  it('reports the original casing so the warning matches what was typed', () => {
    expect(partitionHeaders({ 'user-agent': 'x' }).blocked).toEqual(['user-agent']);
  });
});

describe('sendRequest', () => {
  it('POSTs JSON and reports the parsed response', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse('{"id":"chatcmpl-1"}', { headers: { 'x-request-id': 'abc' } }),
    );

    const result = await sendRequest(input());

    const [url, init] = lastCall();
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ model: 'auto', messages: [] });
    expect(result).toMatchObject({
      status: 200,
      ok: true,
      responseBody: '{"id":"chatcmpl-1"}',
      responseJson: { id: 'chatcmpl-1' },
      responseHeaders: { 'x-request-id': 'abc' },
    });
  });

  it('attaches a bearer token by default', async () => {
    fetchMock.mockResolvedValue(jsonResponse('{}'));
    const result = await sendRequest(input());
    expect(result.requestHeaders.Authorization).toBe('Bearer sk-test');
    expect(result.requestHeaders['Content-Type']).toBe('application/json');
  });

  it('attaches the key under a named header when the format says so', async () => {
    fetchMock.mockResolvedValue(jsonResponse('{}'));
    const result = await sendRequest(input({ auth: { kind: 'header', name: 'x-api-key' } }));
    expect(result.requestHeaders['x-api-key']).toBe('sk-test');
    expect(result.requestHeaders).not.toHaveProperty('Authorization');
  });

  it('sends no credential when the format needs none', async () => {
    fetchMock.mockResolvedValue(jsonResponse('{}'));
    const result = await sendRequest(input({ auth: { kind: 'none' } }));
    expect(result.requestHeaders).not.toHaveProperty('Authorization');
  });

  it('sends no credential when the key field is empty', async () => {
    fetchMock.mockResolvedValue(jsonResponse('{}'));
    const result = await sendRequest(input({ apiKey: '' }));
    expect(result.requestHeaders).not.toHaveProperty('Authorization');
  });

  it('drops browser-forbidden headers before fetching', async () => {
    fetchMock.mockResolvedValue(jsonResponse('{}'));
    const result = await sendRequest(input({ headers: { 'User-Agent': 'x', 'X-Keep': 'y' } }));
    expect(result.requestHeaders).not.toHaveProperty('User-Agent');
    expect(result.requestHeaders['X-Keep']).toBe('y');
  });

  // A provider error page is HTML or plain text; the inspector still has to
  // show it rather than blank out on a parse failure.
  it('keeps a non-JSON body as text', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse('<html>502</html>', { status: 502, statusText: 'Bad Gateway' }),
    );
    const result = await sendRequest(input());
    expect(result).toMatchObject({ status: 502, ok: false, responseJson: null });
    expect(result.responseBody).toBe('<html>502</html>');
  });

  // The request never left the browser, so there is no status to report — but
  // the classified reason is what makes the failure actionable.
  it('reports a rejected fetch as a classified network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await sendRequest(input());
    expect(result).toMatchObject({
      status: 0,
      statusText: 'Network error',
      ok: false,
      error: 'Failed to fetch',
      errorKind: 'network',
    });
    expect(result.requestBody).toContain('"model": "auto"');
  });

  it('stringifies a non-Error rejection', async () => {
    fetchMock.mockRejectedValue('boom');
    expect((await sendRequest(input())).error).toBe('boom');
  });
});
