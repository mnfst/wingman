// Reading a response as SSE: the deltas, the metrics, and the two ways a
// stream can fail to be a stream at all.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendRequestStreaming, type SendInput } from './send';
import { openaiChat } from './formats/openai-chat';

const input = (over: Partial<SendInput> = {}): SendInput => ({
  url: 'https://api.example.com/v1/chat/completions',
  apiKey: 'sk-test',
  headers: {},
  body: { model: 'auto', messages: [] },
  ...over,
});

function jsonResponse(body: string) {
  return {
    status: 200,
    statusText: 'OK',
    ok: true,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(body),
    body: null,
  } as unknown as Response;
}

function sseResponse(sse: string, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  const encoder = new TextEncoder();
  return {
    status,
    statusText: 'OK',
    ok: status >= 200 && status < 300,
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

const fetchMock = vi.fn();

function lastCall(): [string, RequestInit] {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error('no request was made');
  return call as [string, RequestInit];
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('sendRequestStreaming', () => {
  const opts = (onDelta: (text: string) => void = () => {}) => ({
    createParser: () => openaiChat.createStreamParser(),
    onDelta,
  });

  it('asks for an event stream and assembles the deltas', async () => {
    fetchMock.mockResolvedValue(
      sseResponse(
        'data: {"model":"auto","choices":[{"delta":{"content":"Hel"}}]}\n\n' +
          'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n' +
          'data: [DONE]\n\n',
      ),
    );
    const deltas: string[] = [];

    const result = await sendRequestStreaming(
      input(),
      opts((t) => void deltas.push(t)),
    );

    expect((lastCall()[1].headers as Record<string, string>).Accept).toBe('text/event-stream');
    expect(deltas).toEqual(['Hel', 'lo']);
    expect(result.isStream).toBe(true);
    expect(result.streamedText).toBe('Hello');
    expect(result.responseJson).toMatchObject({
      choices: [{ message: { content: 'Hello' } }],
    });
    // The raw SSE is kept verbatim so the response-body pane can show the wire.
    expect(result.responseBody).toContain('data: {"model":"auto"');
  });

  it('records time to first token, not just total latency', async () => {
    fetchMock.mockResolvedValue(
      sseResponse('data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n'),
    );
    const result = await sendRequestStreaming(input(), opts());
    expect(result.ttftMs).toBeTypeOf('number');
    expect(result.ttftMs).toBeLessThanOrEqual(result.durationMs);
  });

  it('leaves time to first token unset when no text ever arrives', async () => {
    fetchMock.mockResolvedValue(sseResponse('data: [DONE]\n\n'));
    expect((await sendRequestStreaming(input(), opts())).ttftMs).toBeUndefined();
  });

  // A 429 or 400 comes back as a JSON error object, not as a stream — reading
  // it as SSE would show an empty response for the most useful failure there is.
  it('falls back to a buffered read for a non-OK response', async () => {
    fetchMock.mockResolvedValue(
      sseResponse('{"error":{"message":"rate limited"}}', { status: 429 }),
    );
    const result = await sendRequestStreaming(input(), opts());
    expect(result).toMatchObject({
      status: 429,
      ok: false,
      isStream: true,
      responseJson: { error: { message: 'rate limited' } },
    });
    expect(result.streamedText).toBeUndefined();
  });

  it('falls back to a buffered read when the response carries no body', async () => {
    fetchMock.mockResolvedValue(jsonResponse('{"done":true}'));
    expect((await sendRequestStreaming(input(), opts())).responseJson).toEqual({ done: true });
  });

  it('reports a rejected fetch the same way a buffered send does', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await sendRequestStreaming(input(), opts())).toMatchObject({
      status: 0,
      ok: false,
      errorKind: 'network',
    });
  });

  // A connection dropped mid-stream must keep whatever text already arrived.
  it('keeps the partial text when the stream breaks', async () => {
    const encoder = new TextEncoder();
    let delivered = false;
    fetchMock.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      ok: true,
      headers: new Headers(),
      text: () => Promise.resolve(''),
      // Erroring from `pull` rather than `start`: a stream errored before the
      // first read discards its queue, which is not the failure being modelled.
      body: new ReadableStream({
        pull(controller) {
          if (delivered) {
            controller.error(new Error('connection reset'));
            return;
          }
          delivered = true;
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"par"}}]}\n\n'));
        },
      }),
    } as unknown as Response);

    const result = await sendRequestStreaming(input(), opts());

    expect(result.streamedText).toBe('par');
    expect(result.error).toBe('connection reset');
  });

  it('stringifies a non-Error thrown mid-stream', async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      ok: true,
      headers: new Headers(),
      text: () => Promise.resolve(''),
      body: new ReadableStream({
        start(controller) {
          controller.error('reset');
        },
      }),
    } as unknown as Response);

    expect((await sendRequestStreaming(input(), opts())).error).toBe('reset');
  });

  it('records the event name alongside the data for typed streams', async () => {
    fetchMock.mockResolvedValue(sseResponse('event: ping\ndata: {}\n\n'));
    expect((await sendRequestStreaming(input(), opts())).responseBody).toBe(
      'event: ping\ndata: {}',
    );
  });
});
