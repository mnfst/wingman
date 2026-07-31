import { describe, expect, it } from 'vitest';
import { buildMarkdownReport, type GistContext } from './gist';
import { openaiChat } from '../formats/openai-chat';
import { anthropicMessages } from '../formats/anthropic-messages';
import type { SendResult } from '../send';

const ctx = (over: Partial<GistContext> = {}): GistContext => ({
  profileLabel: 'Default',
  profileCategory: 'raw',
  formatLabel: 'OpenAI Chat Completions',
  streamed: false,
  systemPrompt: '',
  userMessage: 'hello',
  baseUrl: 'https://app.manifest.build',
  model: 'auto',
  apiKey: 'mnfst_livekey_1234567890',
  ...over,
});

const result = (over: Partial<SendResult> = {}): SendResult => ({
  url: 'https://app.manifest.build/v1/chat/completions',
  status: 200,
  statusText: 'OK',
  ok: true,
  durationMs: 412.7,
  requestHeaders: { Authorization: 'Bearer mnfst_livekey_1234567890' },
  requestBody: '{"model":"auto"}',
  responseHeaders: { 'content-type': 'application/json' },
  responseBody: '{"choices":[{"message":{"content":"hi"}}]}',
  responseJson: {
    model: 'gpt-4o',
    choices: [{ message: { content: 'hi' } }],
    usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
  },
  ...over,
});

describe('buildMarkdownReport redaction', () => {
  // The whole point of the modal is that the report is safe to paste in public.
  it('never prints the key in full', () => {
    const md = buildMarkdownReport(ctx(), result(), openaiChat);
    expect(md).not.toContain('mnfst_livekey_1234567890');
    expect(md).toContain('mnfst_li…90');
  });

  it('redacts the bearer token in the request headers', () => {
    const md = buildMarkdownReport(ctx(), result(), openaiChat);
    expect(md).toContain('Authorization: Bearer mnfst_li…90');
  });

  it("redacts Anthropic's x-api-key header too", () => {
    const md = buildMarkdownReport(
      ctx({ apiKey: 'sk-ant-secret-value' }),
      result({ requestHeaders: { 'X-Api-Key': 'sk-ant-secret-value' } }),
      anthropicMessages,
    );
    expect(md).not.toContain('sk-ant-secret-value');
    expect(md).toContain('X-Api-Key: sk-ant-s…ue');
  });

  // A short key has no safe prefix to show, so nothing of it is shown.
  it('masks a short key entirely', () => {
    expect(buildMarkdownReport(ctx({ apiKey: 'abc' }), result(), openaiChat)).toContain('`***`');
  });

  it('reads as "(none)" when no key was set', () => {
    expect(buildMarkdownReport(ctx({ apiKey: '' }), result(), openaiChat)).toContain('`(none)`');
  });

  it('leaves headers that are not credentials alone', () => {
    const md = buildMarkdownReport(
      ctx(),
      result({ responseHeaders: { 'x-request-id': 'req_abcdef' } }),
      openaiChat,
    );
    expect(md).toContain('x-request-id: req_abcdef');
  });
});

describe('buildMarkdownReport content', () => {
  it('summarises status, latency, model and tokens', () => {
    const md = buildMarkdownReport(ctx(), result(), openaiChat);
    expect(md).toContain('`200 OK`');
    expect(md).toContain('| **Latency** | 413 ms |');
    expect(md).toContain('`gpt-4o`');
    expect(md).toContain('4 total · 3 in / 1 out');
  });

  it('quotes the assistant reply', () => {
    const md = buildMarkdownReport(ctx(), result(), openaiChat);
    expect(md).toContain('## Assistant message');
    expect(md).toContain('> hi');
  });

  it('quotes every line of a multi-line reply', () => {
    const md = buildMarkdownReport(
      ctx(),
      result({ responseJson: { choices: [{ message: { content: 'one\ntwo' } }] } }),
      openaiChat,
    );
    expect(md).toContain('> one\n> two');
  });

  // Streamed responses have no parsed JSON to read text from.
  it('falls back to the streamed text and shows the raw SSE', () => {
    const md = buildMarkdownReport(
      ctx({ streamed: true }),
      result({
        responseJson: null,
        streamedText: 'streamed reply',
        responseBody: 'data: {"choices":[]}',
        ttftMs: 88.4,
      }),
      openaiChat,
    );
    expect(md).toContain('> streamed reply');
    expect(md).toContain('· streamed');
    expect(md).toContain('### Body (raw SSE)');
    expect(md).toContain('| **Time to first token** | 88 ms |');
  });

  it('includes the system prompt only when there is one', () => {
    expect(buildMarkdownReport(ctx(), result(), openaiChat)).not.toContain('## System prompt');
    expect(buildMarkdownReport(ctx({ systemPrompt: 'be terse' }), result(), openaiChat)).toContain(
      '## System prompt',
    );
  });

  it('includes an error section only when the request failed', () => {
    expect(buildMarkdownReport(ctx(), result(), openaiChat)).not.toContain('## Error');
    const md = buildMarkdownReport(ctx(), result({ error: 'Failed to fetch' }), openaiChat);
    expect(md).toContain('## Error');
    expect(md).toContain('Failed to fetch');
  });

  // Status 0 means the request never reached a server, so "0 " would be a lie.
  it('spells out a request that never reached a server', () => {
    const md = buildMarkdownReport(
      ctx(),
      result({ status: 0, statusText: 'Network error', ok: false, responseJson: null }),
      openaiChat,
    );
    expect(md).toContain('🌐');
    expect(md).toContain('`NETWORK`, request did not reach the server');
  });

  it.each([
    ['✅', { status: 200, ok: true }],
    ['⚠️', { status: 401, ok: false }],
    ['🔥', { status: 503, ok: false }],
  ])('flags the outcome with %s', (emoji, over) => {
    expect(buildMarkdownReport(ctx(), result(over), openaiChat)).toContain(emoji);
  });

  it('falls back to a dash when the response carries no usage or model', () => {
    const md = buildMarkdownReport(ctx(), result({ responseJson: {} }), openaiChat);
    expect(md).toContain('| **Tokens** | - |');
    expect(md).toContain('| **Model returned** | - |');
  });

  it('reports a partial usage without inventing the missing counts', () => {
    const md = buildMarkdownReport(
      ctx(),
      result({ responseJson: { usage: { prompt_tokens: 3 } } }),
      openaiChat,
    );
    expect(md).toContain('- total · 3 in / - out');
  });

  it('reports an output-only usage the same way', () => {
    const md = buildMarkdownReport(
      ctx(),
      result({ responseJson: { usage: { completion_tokens: 1, total_tokens: 4 } } }),
      openaiChat,
    );
    expect(md).toContain('4 total · - in / 1 out');
  });

  it('pretty-prints the response JSON', () => {
    expect(buildMarkdownReport(ctx(), result(), openaiChat)).toContain('"model": "gpt-4o"');
  });

  it('shows the raw body when the response was not JSON', () => {
    const md = buildMarkdownReport(
      ctx(),
      result({ responseJson: null, responseBody: '<html>502</html>' }),
      openaiChat,
    );
    expect(md).toContain('<html>502</html>');
  });

  it('marks empty bodies and header sets rather than leaving a blank block', () => {
    const md = buildMarkdownReport(
      ctx(),
      result({
        requestBody: '',
        responseBody: '',
        responseJson: null,
        requestHeaders: {},
        responseHeaders: {},
      }),
      openaiChat,
    );
    expect(md).toContain('(empty)');
    expect(md).toContain('(none)');
  });

  it('marks an empty streamed body too', () => {
    const md = buildMarkdownReport(
      ctx({ streamed: true }),
      result({ responseBody: '', responseJson: null }),
      openaiChat,
    );
    expect(md).toContain('(empty)');
  });
});
