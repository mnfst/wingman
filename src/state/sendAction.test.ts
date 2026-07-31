// Sending: what goes on the wire, what lands in history, and what happens to
// the draft tab the request was composed in.
import { createRoot } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppState } from './appState';
import { createAppActions } from './appActions';
import { listHistory } from '../services/history';

const fetchMock = vi.fn();

function reply(body: unknown = { model: 'gpt-4o', choices: [{ message: { content: 'hi' } }] }) {
  return {
    status: 200,
    statusText: 'OK',
    ok: true,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(JSON.stringify(body)),
    body: null,
  } as unknown as Response;
}

function sseReply(sse: string) {
  const encoder = new TextEncoder();
  return {
    status: 200,
    statusText: 'OK',
    ok: true,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    text: () => Promise.resolve(sse),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sse));
        controller.close();
      },
    }),
  } as unknown as Response;
}

/** App state + actions, torn down after the callback settles. */
async function withApp(
  fn: (
    s: ReturnType<typeof createAppState>,
    a: ReturnType<typeof createAppActions>,
  ) => Promise<void>,
) {
  let done: Promise<void> = Promise.resolve();
  const dispose = createRoot((disposeRoot) => {
    const s = createAppState();
    done = fn(s, createAppActions(s));
    return disposeRoot;
  });
  await done;
  dispose();
}

/** The POST the send made, ignoring the background health and model probes. */
const sentRequest = () => {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
  if (!call) throw new Error('no request was sent');
  return { url: call[0] as string, headers: call[1].headers, body: JSON.parse(call[1].body) };
};

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(reply());
  vi.stubGlobal('fetch', fetchMock);
});

describe('sending from the form', () => {
  it('POSTs the format body to the normalised request URL', async () => {
    await withApp(async (s, a) => {
      s.handleBaseUrlInput('https://gw.example.com/v1');
      s.persistAndSetKey('mnfst_test');
      s.persistAndSetModel('auto');
      s.setUserMessage('hello');

      await a.handleSend();

      expect(sentRequest().url).toBe('https://gw.example.com/v1/chat/completions');
      expect(sentRequest().headers.Authorization).toBe('Bearer mnfst_test');
      expect(sentRequest().body).toEqual({
        model: 'auto',
        messages: [{ role: 'user', content: 'hello' }],
      });
    });
  });

  // The agent profiles exist to be indistinguishable from the real client, so
  // their body fragment has to reach the wire alongside the format's body.
  it("merges the client's body extras over the format body", async () => {
    await withApp(async (s, a) => {
      s.setProfileSafely('openclaw');
      s.setUserMessage('hello');

      await a.handleSend();

      expect(sentRequest().body.max_completion_tokens).toBe(8192);
      expect(sentRequest().body.messages[0].role).toBe('system');
    });
  });

  it('records the result and opens it as a history tab', async () => {
    await withApp(async (s, a) => {
      s.setUserMessage('hello');

      await a.handleSend();

      const [entry] = listHistory();
      expect(entry).toMatchObject({ status: 200, ok: true, userMessage: 'hello' });
      expect(entry?.assistantText).toBe('hi');
      expect(s.activeHistoryId()).toBe(entry?.id);
      expect(s.result()?.ok).toBe(true);
      expect(s.hasSent()).toBe(true);
      expect(s.loading()).toBe(false);
    });
  });

  // A draft that ships becomes a history tab; leaving the empty draft behind
  // would double every request in the strip.
  it('consumes the draft tab the request was composed in', async () => {
    await withApp(async (s, a) => {
      const draftId = s.activeDraftId();
      s.setUserMessage('hello');

      await a.handleSend();

      expect(s.drafts().some((d) => d.id === draftId)).toBe(false);
      expect(s.activeHistoryId()).not.toBeNull();
    });
  });

  it('leaves the drafts alone when re-sending from a history tab', async () => {
    await withApp(async (s, a) => {
      s.setUserMessage('hello');
      await a.handleSend();
      const draftsAfterFirst = s.drafts().length;

      await a.handleSend();

      expect(s.drafts()).toHaveLength(draftsAfterFirst);
      expect(listHistory()).toHaveLength(2);
    });
  });
});

describe('sending refuses an unusable base URL', () => {
  // Left to `fetch`, a schemeless base resolved against Wingman's own origin —
  // quietly shipping the user's API key to a host they never pointed at.
  it('never reaches the network and explains why', async () => {
    await withApp(async (s, a) => {
      s.handleBaseUrlInput('   ');
      s.setUserMessage('hello');

      await a.handleSend();

      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
      expect(s.result()).toMatchObject({
        status: 0,
        statusText: 'Invalid base URL',
        error: 'Base URL is empty.',
      });
      expect(s.loading()).toBe(false);
      expect(listHistory()).toHaveLength(0);
    });
  });

  it('falls back to a generic message when normalisation names no problem', async () => {
    await withApp(async (s, a) => {
      s.handleBaseUrlInput('ftp://gw.example.com');
      s.setUserMessage('hello');
      await a.handleSend();
      expect(s.result()?.error).toMatch(/not a supported scheme/);
    });
  });
});

describe('streaming', () => {
  it('renders the deltas live and stores the assembled reply', async () => {
    fetchMock.mockResolvedValue(
      sseReply(
        'data: {"model":"gpt-4o","choices":[{"delta":{"content":"He"}}]}\n\n' +
          'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n' +
          'data: [DONE]\n\n',
      ),
    );

    await withApp(async (s, a) => {
      s.persistAndSetStream(true);
      s.setUserMessage('hello');

      await a.handleSend();

      expect(s.streamingText()).toBe('Hello');
      expect(s.result()?.isStream).toBe(true);
      expect(listHistory()[0]).toMatchObject({ streamed: true, assistantText: 'Hello' });
    });
  });
});

describe('running the edited snippet instead of the form', () => {
  it('sends what the snippet says, not what the form says', async () => {
    await withApp(async (s, a) => {
      s.setProfileSafely('openai-sdk');
      s.onSdkCodeChange(
        'await new OpenAI({ baseURL: "https://snippet.example.com/v1" }).chat.completions.create({ model: "from-code", messages: [] });',
      );
      s.setUserMessage('hello');
      expect(s.willRunCode()).toBe(true);

      await a.handleSend();

      expect(sentRequest().url).toBe('https://snippet.example.com/v1/chat/completions');
      expect(sentRequest().body.model).toBe('from-code');
      expect(listHistory()[0]?.ok).toBe(true);
    });
  });

  // A snippet that throws is the user's own code failing; it has to read as a
  // result in the response pane, not as an unhandled rejection.
  it('reports a snippet that never calls the SDK as a code error', async () => {
    await withApp(async (s, a) => {
      s.setProfileSafely('openai-sdk');
      s.onSdkCodeChange('const nothing = 1;');
      s.setUserMessage('hello');

      await a.handleSend();

      expect(s.result()).toMatchObject({ status: 0, statusText: 'Code error' });
      expect(s.result()?.error).toMatch(/no request was made/);
    });
  });

  it('stringifies a non-Error thrown by the snippet', async () => {
    await withApp(async (s, a) => {
      s.setProfileSafely('openai-sdk');
      s.onSdkCodeChange('throw "plain string";');
      s.setUserMessage('hello');

      await a.handleSend();

      expect(s.result()?.error).toBe('plain string');
    });
  });
});

describe('a failed request', () => {
  it('records the classified network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await withApp(async (s, a) => {
      s.setUserMessage('hello');

      await a.handleSend();

      expect(s.result()).toMatchObject({ status: 0, ok: false, errorKind: 'network' });
      expect(listHistory()[0]).toMatchObject({ ok: false, errorMessage: 'Failed to fetch' });
    });
  });
});
