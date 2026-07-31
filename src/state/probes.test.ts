// Both background lookups are debounced past typing and both must fail
// quietly. The subtle requirement is ordering: retargeting the URL bar has to
// discard whatever the previous endpoint was still going to say, or the badge
// ends up describing a host the user has already moved off.
import { createRoot, createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProbes } from './probes';
import { FORMAT_BY_ID } from '../formats';
import { PROVIDER_BY_ID } from '../providers';
import type { ApiFormat } from '../formats';
import type { Provider } from '../providers';
import { normalizeBaseUrl } from '../services/baseUrl';

const CHAT = FORMAT_BY_ID['openai-chat'] as ApiFormat;
const CUSTOM = PROVIDER_BY_ID['custom'] as Provider;
const OPENAI = PROVIDER_BY_ID['openai'] as Provider;

const fetchMock = vi.fn();

function healthOk() {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve('{"status":"ok"}'),
    json: () => Promise.resolve({ status: 'ok' }),
  } as unknown as Response;
}

function catalog(ids: string[]) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({ data: ids.map((id) => ({ id })) }),
  } as unknown as Response;
}

function setup(initial = { baseUrl: 'http://localhost:3001', provider: CUSTOM }) {
  return createRoot((dispose) => {
    const [baseUrl, setBaseUrl] = createSignal(initial.baseUrl);
    const [apiKey, setApiKey] = createSignal('');
    const [provider, setProvider] = createSignal<Provider>(initial.provider);
    const probes = createProbes({
      baseUrl,
      apiKey,
      format: () => CHAT,
      provider,
      normalized: () => normalizeBaseUrl(baseUrl(), CHAT.path),
    });
    return { ...probes, setBaseUrl, setApiKey, setProvider, dispose };
  });
}

/** Let the debounce timers fire and the resulting promises settle. */
async function settle(ms = 600) {
  await vi.advanceTimersByTimeAsync(ms);
  await vi.waitFor(() => Promise.resolve());
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('health probe', () => {
  it('waits out the debounce before probing at all', async () => {
    fetchMock.mockResolvedValue(healthOk());
    const p = setup();

    await vi.advanceTimersByTimeAsync(300);
    expect(fetchMock).not.toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/health',
      expect.anything(),
    );

    await settle();
    expect(p.healthStatus()).toMatchObject({ kind: 'ok' });
    p.dispose();
  });

  // Public provider APIs have no health endpoint; probing one 404s and would
  // paint an "unreachable" badge over a perfectly good endpoint.
  it('stays idle for a provider preset that serves no health endpoint', async () => {
    fetchMock.mockResolvedValue(healthOk());
    const p = setup({ baseUrl: 'https://api.openai.com', provider: OPENAI });

    await settle();

    expect(p.healthStatus()).toEqual({ kind: 'idle' });
    p.dispose();
  });

  it('stays idle while the base URL is empty', async () => {
    const p = setup({ baseUrl: '   ', provider: CUSTOM });
    await settle();
    expect(p.healthStatus()).toEqual({ kind: 'idle' });
    p.dispose();
  });

  // The previous endpoint's verdict resolving late must not overwrite the
  // badge the current one already produced.
  it('discards a probe the user has already navigated away from', async () => {
    let resolveFirst: (r: Response) => void = () => {};
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((res) => (resolveFirst = res)))
      .mockImplementation(() => Promise.resolve(healthOk()));

    const p = setup();
    await vi.advanceTimersByTimeAsync(450);

    p.setBaseUrl('http://localhost:4001');
    await settle();
    expect(p.healthStatus()).toMatchObject({ kind: 'ok' });

    // The abandoned probe answers now, with an HTML body, which would
    // otherwise flip the badge to "not a gateway".
    resolveFirst({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'text/html' }),
      text: () => Promise.resolve('<!doctype html>'),
    } as unknown as Response);
    await settle(0);

    expect(p.healthStatus()).toMatchObject({ kind: 'ok' });
    p.dispose();
  });
});

describe('model catalog lookup', () => {
  it('fills the dropdown from the endpoint catalog', async () => {
    fetchMock.mockResolvedValue(catalog(['auto', 'gpt-4o']));
    const p = setup();

    await settle();

    expect(p.modelList()).toEqual(['auto', 'gpt-4o']);
    p.dispose();
  });

  it('leaves the list empty while the base URL is unusable', async () => {
    fetchMock.mockResolvedValue(catalog(['auto']));
    const p = setup({ baseUrl: 'not a url at all', provider: CUSTOM });

    await settle();

    expect(p.modelList()).toEqual([]);
    p.dispose();
  });

  // A key is what most catalogs need, so typing one has to re-run the lookup.
  it('re-runs when the key changes', async () => {
    // Keyed off the request rather than call order: the health probe fires
    // first and would otherwise consume a one-shot catalog response.
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (!url.endsWith('/v1/models')) return Promise.resolve(healthOk());
      const authorized = Boolean((init.headers as Record<string, string>).Authorization);
      return Promise.resolve(catalog(authorized ? ['gpt-4o'] : []));
    });

    const p = setup();
    await settle();
    expect(p.modelList()).toEqual([]);

    p.setApiKey('sk-test');
    await settle();

    expect(p.modelList()).toEqual(['gpt-4o']);
    p.dispose();
  });

  it('keeps the field free-text when the endpoint refuses', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const p = setup();
    await settle();
    expect(p.modelList()).toEqual([]);
    p.dispose();
  });
});
