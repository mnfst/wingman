import { describe, expect, it, vi } from 'vitest';
import { readSse, type SseEvent } from './sse';

/** A body stream that hands out exactly the chunks given, in order. */
function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<SseEvent[]> {
  const out: SseEvent[] = [];
  for await (const evt of readSse(stream)) out.push(evt);
  return out;
}

describe('readSse', () => {
  it('yields one event per blank-line-separated block', async () => {
    const events = await collect(streamOf('data: one\n\ndata: two\n\n'));
    expect(events).toEqual([
      { event: undefined, data: 'one' },
      { event: undefined, data: 'two' },
    ]);
  });

  it('keeps the event name when the block names one', async () => {
    const events = await collect(streamOf('event: message_stop\ndata: {}\n\n'));
    expect(events).toEqual([{ event: 'message_stop', data: '{}' }]);
  });

  // The single most common way a naive SSE reader breaks: a network chunk
  // boundary that falls in the middle of a line.
  it('buffers an event split across network chunks', async () => {
    const events = await collect(streamOf('data: {"cont', 'ent":"hello"}\n\n'));
    expect(events).toEqual([{ event: undefined, data: '{"content":"hello"}' }]);
  });

  it('splits several events delivered in one chunk', async () => {
    const events = await collect(streamOf('data: a\n\ndata: b\n\ndata: c\n\n'));
    expect(events.map((e) => e.data)).toEqual(['a', 'b', 'c']);
  });

  // Some gateways terminate the last event with EOF rather than a blank line.
  it('yields a trailing event that the stream ended without a blank line', async () => {
    const events = await collect(streamOf('data: last'));
    expect(events).toEqual([{ event: undefined, data: 'last' }]);
  });

  it('joins a multi-line data payload with newlines', async () => {
    const events = await collect(streamOf('data: line one\ndata: line two\n\n'));
    expect(events).toEqual([{ event: undefined, data: 'line one\nline two' }]);
  });

  it('normalises CRLF line endings', async () => {
    const events = await collect(streamOf('event: ping\r\ndata: {}\r\n\r\n'));
    expect(events).toEqual([{ event: 'ping', data: '{}' }]);
  });

  it('skips comment lines and blocks that carry no data', async () => {
    const events = await collect(streamOf(': keep-alive\n\nevent: ping\n\ndata: real\n\n'));
    expect(events).toEqual([{ event: undefined, data: 'real' }]);
  });

  // Per the SSE spec a field with no colon has an empty value, and exactly one
  // leading space after the colon is stripped.
  it('handles a valueless field and preserves indentation past the first space', async () => {
    const events = await collect(streamOf('data\n\ndata:  two spaces\n\n'));
    expect(events).toEqual([
      { event: undefined, data: '' },
      { event: undefined, data: ' two spaces' },
    ]);
  });

  it('ignores fields it has no meaning for', async () => {
    const events = await collect(streamOf('id: 42\nretry: 1000\ndata: payload\n\n'));
    expect(events).toEqual([{ event: undefined, data: 'payload' }]);
  });

  it('yields nothing for an empty body', async () => {
    expect(await collect(streamOf(''))).toEqual([]);
  });

  // Formats break out of the loop on their terminal event. Releasing the lock
  // alone would leave the response body, and its connection, open.
  it('cancels the body when the consumer stops early', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const reader = {
      read: vi
        .fn()
        .mockResolvedValue({ done: false, value: new TextEncoder().encode('data: a\n\n') }),
      cancel,
      releaseLock: vi.fn(),
    };
    const body = { getReader: () => reader } as unknown as ReadableStream<Uint8Array>;

    for await (const evt of readSse(body)) {
      expect(evt.data).toBe('a');
      break;
    }

    expect(cancel).toHaveBeenCalledOnce();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
  });

  // A body already cancelled by an aborted request rejects on cancel; that must
  // not turn into an unhandled rejection on top of the real failure.
  it('swallows a rejection from cancelling an already-dead body', async () => {
    const reader = {
      read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
      cancel: vi.fn().mockRejectedValue(new Error('already released')),
      releaseLock: vi.fn(),
    };
    const body = { getReader: () => reader } as unknown as ReadableStream<Uint8Array>;

    await expect(collect(body)).resolves.toEqual([]);
    expect(reader.releaseLock).toHaveBeenCalledOnce();
  });
});
