import { describe, expect, it } from 'vitest';
import { anthropicMessages } from './anthropic-messages';
import type { RequestParams } from './types';

const params = (over: Partial<RequestParams> = {}): RequestParams => ({
  baseUrl: 'https://api.anthropic.com',
  apiKey: 'sk-ant-test',
  model: 'claude-sonnet-4-5',
  systemPrompt: '',
  userMessage: 'hello',
  ...over,
});

function drive(events: Array<{ event?: string; data: string }>) {
  const parser = anthropicMessages.createStreamParser();
  const text: string[] = [];
  let final: unknown = null;
  let done = false;
  for (const evt of events) {
    const delta = parser.push(evt);
    if (delta.text) text.push(delta.text);
    if (delta.final !== undefined && delta.final !== null) final = delta.final;
    if (delta.done) done = true;
  }
  return { text: text.join(''), final, done };
}

describe('anthropic-messages format', () => {
  // Anthropic rejects a request with no max_tokens, so the format supplies one
  // rather than letting the user discover it as a 400.
  it('always sends max_tokens', () => {
    expect(anthropicMessages.buildBody(params(), { stream: false }).max_tokens).toBe(1024);
    expect(
      anthropicMessages.buildBody(params({ maxTokens: 32 }), { stream: false }).max_tokens,
    ).toBe(32);
  });

  // Unlike OpenAI, the system prompt is a top-level field, not a message.
  it('sends the system prompt as a top-level field', () => {
    const body = anthropicMessages.buildBody(params({ systemPrompt: 'be terse' }), {
      stream: false,
    });
    expect(body.system).toBe('be terse');
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('omits a whitespace-only system prompt', () => {
    expect(
      anthropicMessages.buildBody(params({ systemPrompt: '  ' }), { stream: false }),
    ).not.toHaveProperty('system');
  });

  it('forwards temperature and the stream flag only when asked', () => {
    expect(anthropicMessages.buildBody(params(), { stream: false })).not.toHaveProperty('stream');
    expect(
      anthropicMessages.buildBody(params({ temperature: 0.2 }), { stream: true }),
    ).toMatchObject({ temperature: 0.2, stream: true });
  });

  it('authenticates with x-api-key rather than a bearer token', () => {
    expect(anthropicMessages.auth).toEqual({ kind: 'header', name: 'x-api-key' });
  });

  // Without this header Anthropic rejects any request coming from a browser
  // origin, which is every request Wingman makes.
  it('opts in to direct browser access', () => {
    expect(anthropicMessages.defaultHeaders).toMatchObject({
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
  });
});

describe('anthropic-messages extractText', () => {
  it('joins the text blocks and skips the others', () => {
    const json = {
      content: [
        { type: 'text', text: 'Hel' },
        { type: 'tool_use', name: 'search' },
        { type: 'text', text: 'lo' },
      ],
    };
    expect(anthropicMessages.extractText(json)).toBe('Hello');
  });

  it.each([
    ['a payload with no content', {}],
    ['content with no text blocks', { content: [{ type: 'tool_use' }] }],
    ['a text block with an empty string', { content: [{ type: 'text', text: '' }] }],
    ['a non-object', 7],
  ])('returns null for %s', (_label, json) => {
    expect(anthropicMessages.extractText(json)).toBeNull();
  });
});

describe('anthropic-messages extractUsage', () => {
  // Anthropic reports input and output but never a total, so the format adds it.
  it('computes the total the API does not send', () => {
    const json = { usage: { input_tokens: 12, output_tokens: 8 } };
    expect(anthropicMessages.extractUsage(json)).toEqual({ in: 12, out: 8, total: 20 });
  });

  it('totals a half-reported usage rather than dropping it', () => {
    expect(anthropicMessages.extractUsage({ usage: { input_tokens: 12 } })).toEqual({
      in: 12,
      out: undefined,
      total: 12,
    });
  });

  it('totals when only the output count is reported', () => {
    expect(anthropicMessages.extractUsage({ usage: { output_tokens: 8 } })).toEqual({
      in: undefined,
      out: 8,
      total: 8,
    });
  });

  it('leaves the total undefined when neither count is reported', () => {
    expect(anthropicMessages.extractUsage({ usage: {} })).toEqual({
      in: undefined,
      out: undefined,
      total: undefined,
    });
  });

  it('returns null when there is no usage object', () => {
    expect(anthropicMessages.extractUsage({})).toBeNull();
  });
});

describe('anthropic-messages extractModel', () => {
  it('reads the served model', () => {
    expect(anthropicMessages.extractModel({ model: 'claude-opus-4' })).toBe('claude-opus-4');
  });

  it('returns null when absent', () => {
    expect(anthropicMessages.extractModel({})).toBeNull();
  });
});

describe('anthropic-messages stream parser', () => {
  // The usage arrives split across two events, which is the whole reason the
  // parser is stateful rather than a pure function per chunk.
  it('reassembles a message whose usage spans several events', () => {
    const { text, final, done } = drive([
      {
        event: 'message_start',
        data: '{"message":{"model":"claude-sonnet-4-5","usage":{"input_tokens":9}}}',
      },
      { event: 'content_block_delta', data: '{"delta":{"text":"Hel"}}' },
      { event: 'content_block_delta', data: '{"delta":{"text":"lo"}}' },
      { event: 'message_delta', data: '{"usage":{"output_tokens":2}}' },
      { event: 'message_stop', data: '{}' },
    ]);
    expect(text).toBe('Hello');
    expect(done).toBe(true);
    expect(final).toEqual({
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-4-5',
      content: [{ type: 'text', text: 'Hello' }],
      usage: { input_tokens: 9, output_tokens: 2 },
    });
  });

  // Some proxies forward the payload without the SSE `event:` line.
  it('falls back to the payload type when the event line is missing', () => {
    const { text } = drive([{ data: '{"type":"content_block_delta","delta":{"text":"hi"}}' }]);
    expect(text).toBe('hi');
  });

  it('surfaces an error event as the final payload', () => {
    const { final, done } = drive([
      { event: 'error', data: '{"type":"error","error":{"message":"overloaded"}}' },
    ]);
    expect(done).toBe(true);
    expect(final).toMatchObject({ error: { message: 'overloaded' } });
  });

  it('ignores events it has no use for', () => {
    const { text, final, done } = drive([
      { data: 'not json' },
      { event: 'ping', data: '{}' },
      { event: 'content_block_start', data: '{"content_block":{"type":"text"}}' },
      { event: 'content_block_delta', data: '{"delta":{}}' },
      { event: 'message_delta', data: '{"usage":{}}' },
    ]);
    expect(text).toBe('');
    expect(final).toBeNull();
    expect(done).toBe(false);
  });
});
