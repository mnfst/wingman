import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchModels } from './models';
import { openaiChat } from '../formats/openai-chat';
import { anthropicMessages } from '../formats/anthropic-messages';

const fetchMock = vi.fn();
const signal = new AbortController().signal;

function catalog(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** The single request the lookup made. */
function lastCall(): [string, RequestInit] {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error('no catalog request was made');
  return call as [string, RequestInit];
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('fetchModels', () => {
  it('reads ids out of the OpenAI-shaped catalog', async () => {
    fetchMock.mockResolvedValue(catalog({ data: [{ id: 'auto' }, { id: 'gpt-4o' }] }));
    expect(await fetchModels('https://api.example.com', 'sk-test', openaiChat, signal)).toEqual([
      'auto',
      'gpt-4o',
    ]);
  });

  it('probes the catalog next to the base URL, never doubling a slash', async () => {
    fetchMock.mockResolvedValue(catalog({ data: [] }));
    await fetchModels('https://api.example.com///', '', openaiChat, signal);
    expect(lastCall()[0]).toBe('https://api.example.com/v1/models');
  });

  // Routers put their preferred alias first, so server order is meaningful.
  it('dedupes while keeping server order', async () => {
    fetchMock.mockResolvedValue(catalog({ data: [{ id: 'auto' }, { id: 'a' }, { id: 'auto' }] }));
    expect(await fetchModels('https://x.example.com', '', openaiChat, signal)).toEqual([
      'auto',
      'a',
    ]);
  });

  it('accepts a bare array and plain string entries', async () => {
    fetchMock.mockResolvedValue(catalog(['a', { id: 'b' }]));
    expect(await fetchModels('https://x.example.com', '', openaiChat, signal)).toEqual(['a', 'b']);
  });

  it('skips entries with no usable id', async () => {
    fetchMock.mockResolvedValue(catalog({ data: [{ id: 42 }, { id: '' }, null, { id: 'ok' }] }));
    expect(await fetchModels('https://x.example.com', '', openaiChat, signal)).toEqual(['ok']);
  });

  it('yields nothing for a payload in no recognised shape', async () => {
    fetchMock.mockResolvedValue(catalog({ models: 'nope' }));
    expect(await fetchModels('https://x.example.com', '', openaiChat, signal)).toEqual([]);
  });

  it('sends a bearer token when the format authenticates that way', async () => {
    fetchMock.mockResolvedValue(catalog({ data: [] }));
    await fetchModels('https://x.example.com', 'sk-test', openaiChat, signal);
    expect(lastCall()[1].headers).toMatchObject({ Authorization: 'Bearer sk-test' });
  });

  // Anthropic rejects a browser GET on /v1/models without exactly the same
  // headers /v1/messages needs, so the format's defaults have to come along.
  it("reuses the format's named auth header and default headers", async () => {
    fetchMock.mockResolvedValue(catalog({ data: [] }));
    await fetchModels('https://api.anthropic.com', 'sk-ant', anthropicMessages, signal);
    expect(lastCall()[1].headers).toMatchObject({
      'x-api-key': 'sk-ant',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
  });

  it('sends no credential when the key field is empty', async () => {
    fetchMock.mockResolvedValue(catalog({ data: [] }));
    await fetchModels('https://x.example.com', '', anthropicMessages, signal);
    expect(lastCall()[1].headers).not.toHaveProperty('x-api-key');
  });

  // The lookup is a convenience: plenty of providers 401 or block the browser
  // outright, and the model field has to stay usable as free text regardless.
  it('yields nothing when the endpoint refuses', async () => {
    fetchMock.mockResolvedValue(catalog({}, 401));
    expect(await fetchModels('https://x.example.com', '', openaiChat, signal)).toEqual([]);
  });

  it('yields nothing when the request never lands', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await fetchModels('https://x.example.com', '', openaiChat, signal)).toEqual([]);
  });

  it('passes the abort signal through so a retarget cancels the lookup', async () => {
    fetchMock.mockResolvedValue(catalog({ data: [] }));
    await fetchModels('https://x.example.com', '', openaiChat, signal);
    expect(lastCall()[1].signal).toBe(signal);
  });
});
