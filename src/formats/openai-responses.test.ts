import { describe, expect, it } from 'vitest';
import { openaiResponses } from './openai-responses';
import type { RequestParams } from './types';

const params = (over: Partial<RequestParams> = {}): RequestParams => ({
  baseUrl: 'https://api.openai.com',
  apiKey: 'sk-test',
  model: 'gpt-4.1',
  systemPrompt: '',
  userMessage: 'hello',
  ...over,
});

function drive(events: Array<{ event?: string; data: string }>) {
  const parser = openaiResponses.createStreamParser();
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

describe('openai-responses buildBody', () => {
  // Responses takes a bare `input` string and `instructions`, not a messages
  // array. That is the one thing that trips people moving over from Chat Completions.
  it('uses input and instructions instead of a messages array', () => {
    const body = openaiResponses.buildBody(params({ systemPrompt: 'be terse' }), { stream: false });
    expect(body).toEqual({
      model: 'gpt-4.1',
      input: 'hello',
      instructions: 'be terse',
    });
  });

  it('omits a whitespace-only system prompt', () => {
    expect(
      openaiResponses.buildBody(params({ systemPrompt: ' ' }), { stream: false }),
    ).not.toHaveProperty('instructions');
  });

  it('renames the token cap to max_output_tokens', () => {
    expect(
      openaiResponses.buildBody(params({ maxTokens: 64, temperature: 1 }), { stream: true }),
    ).toMatchObject({ max_output_tokens: 64, temperature: 1, stream: true });
  });
});

describe('openai-responses extractText', () => {
  // The SDK exposes an aggregated string; prefer it over walking the parts.
  it('prefers the aggregated output_text', () => {
    expect(openaiResponses.extractText({ output_text: 'aggregated', output: [] })).toBe(
      'aggregated',
    );
  });

  it('walks the output items when there is no aggregate', () => {
    const json = {
      output: [
        { type: 'reasoning', summary: [] },
        {
          type: 'message',
          content: [
            { type: 'output_text', text: 'Hel' },
            { type: 'refusal', refusal: 'no' },
            { type: 'output_text', text: 'lo' },
          ],
        },
      ],
    };
    expect(openaiResponses.extractText(json)).toBe('Hello');
  });

  it.each([
    ['a non-object', null],
    ['a payload with no output', { id: 'resp_1' }],
    ['output items with no content', { output: [{ type: 'reasoning' }] }],
    ['content with no output_text parts', { output: [{ content: [{ type: 'refusal' }] }] }],
  ])('returns null for %s', (_label, json) => {
    expect(openaiResponses.extractText(json)).toBeNull();
  });
});

describe('openai-responses extractUsage and extractModel', () => {
  it('maps the Responses token names', () => {
    const json = { usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 } };
    expect(openaiResponses.extractUsage(json)).toEqual({ in: 5, out: 3, total: 8 });
  });

  it('returns null when usage or model is absent', () => {
    expect(openaiResponses.extractUsage({})).toBeNull();
    expect(openaiResponses.extractModel({})).toBeNull();
  });

  it('reads the served model', () => {
    expect(openaiResponses.extractModel({ model: 'gpt-4.1-2025-04-14' })).toBe(
      'gpt-4.1-2025-04-14',
    );
  });
});

describe('openai-responses stream parser', () => {
  it('streams the text deltas and takes the completed response as final', () => {
    const { text, final, done } = drive([
      { event: 'response.created', data: '{"response":{"id":"resp_1"}}' },
      { event: 'response.output_text.delta', data: '{"delta":"Hel"}' },
      { event: 'response.output_text.delta', data: '{"delta":"lo"}' },
      { event: 'response.completed', data: '{"response":{"id":"resp_1","output_text":"Hello"}}' },
    ]);
    expect(text).toBe('Hello');
    expect(done).toBe(true);
    expect(final).toEqual({ id: 'resp_1', output_text: 'Hello' });
  });

  // A truncated response still has a payload worth showing.
  it('ends on an incomplete response too', () => {
    const { final, done } = drive([
      { event: 'response.incomplete', data: '{"response":{"status":"incomplete"}}' },
    ]);
    expect(done).toBe(true);
    expect(final).toEqual({ status: 'incomplete' });
  });

  it.each(['response.failed', 'error'])('ends on a %s event', (event) => {
    const { final, done } = drive([{ event, data: '{"message":"boom"}' }]);
    expect(done).toBe(true);
    expect(final).toEqual({ message: 'boom' });
  });

  // Some gateways flatten the event, putting the response fields at the top
  // level instead of under `response`.
  it('takes the payload itself when there is no nested response', () => {
    const { final } = drive([
      { event: 'response.completed', data: '{"id":"resp_1","output_text":"Hello"}' },
    ]);
    expect(final).toEqual({ id: 'resp_1', output_text: 'Hello' });
  });

  it('falls back to the payload type when the event line is missing', () => {
    const { text } = drive([{ data: '{"type":"response.output_text.delta","delta":"hi"}' }]);
    expect(text).toBe('hi');
  });

  it('ignores empty deltas, unknown events and unparseable chunks', () => {
    const { text, final, done } = drive([
      { data: 'not json' },
      { event: 'response.output_text.delta', data: '{"delta":""}' },
      { event: 'response.in_progress', data: '{}' },
    ]);
    expect(text).toBe('');
    expect(final).toBeNull();
    expect(done).toBe(false);
  });
});
