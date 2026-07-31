import { describe, expect, it } from 'vitest';
import { openaiChat } from './openai-chat';
import type { RequestParams } from './types';

const params = (over: Partial<RequestParams> = {}): RequestParams => ({
  baseUrl: 'https://api.example.com',
  apiKey: 'sk-test',
  model: 'gpt-4o',
  systemPrompt: '',
  userMessage: 'hello',
  ...over,
});

/** Drive a parser through a list of `data:` payloads and collect what it emits. */
function drive(payloads: string[]) {
  const parser = openaiChat.createStreamParser();
  const text: string[] = [];
  let final: unknown = null;
  let done = false;
  for (const data of payloads) {
    const delta = parser.push({ data });
    if (delta.text) text.push(delta.text);
    if (delta.final !== undefined && delta.final !== null) final = delta.final;
    if (delta.done) done = true;
  }
  return { text: text.join(''), final, done };
}

describe('openai-chat buildBody', () => {
  it('sends only a user message when there is no system prompt', () => {
    expect(openaiChat.buildBody(params(), { stream: false })).toEqual({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hello' }],
    });
  });

  it('puts the system prompt first', () => {
    const body = openaiChat.buildBody(params({ systemPrompt: 'be terse' }), { stream: false });
    expect(body.messages).toEqual([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'hello' },
    ]);
  });

  // A prompt of only whitespace is an empty prompt. Sending it would add a
  // meaningless system turn and change how the gateway classifies the request.
  it('drops a whitespace-only system prompt', () => {
    const body = openaiChat.buildBody(params({ systemPrompt: '   \n ' }), { stream: false });
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('forwards optional sampling parameters only when set', () => {
    expect(openaiChat.buildBody(params(), { stream: false })).not.toHaveProperty('temperature');
    const body = openaiChat.buildBody(params({ temperature: 0, maxTokens: 128 }), {
      stream: false,
    });
    expect(body).toMatchObject({ temperature: 0, max_tokens: 128 });
  });

  // Without include_usage the stream ends with no token counts at all, and the
  // usage chips would be permanently blank for streamed requests.
  it('asks for usage when streaming', () => {
    expect(openaiChat.buildBody(params(), { stream: true })).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
  });
});

describe('openai-chat extractText', () => {
  it('reads the assistant message', () => {
    const json = { choices: [{ message: { content: 'hi there' } }] };
    expect(openaiChat.extractText(json)).toBe('hi there');
  });

  // Legacy completion-shaped responses (and a few OpenAI-compatible gateways)
  // put the text on the choice itself.
  it('falls back to the choice-level text field', () => {
    expect(openaiChat.extractText({ choices: [{ text: 'legacy' }] })).toBe('legacy');
  });

  it.each([
    ['a non-object', 'nope'],
    ['a payload with no choices', { id: 'x' }],
    ['an empty choices array', { choices: [] }],
    ['a choice with neither field', { choices: [{}] }],
  ])('returns null for %s', (_label, json) => {
    expect(openaiChat.extractText(json)).toBeNull();
  });
});

describe('openai-chat extractUsage', () => {
  it('maps the OpenAI token names', () => {
    const json = { usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } };
    expect(openaiChat.extractUsage(json)).toEqual({ in: 10, out: 4, total: 14 });
  });

  it('returns null when the response reports no usage', () => {
    expect(openaiChat.extractUsage({})).toBeNull();
  });
});

describe('openai-chat extractModel', () => {
  it('reads the model the provider actually served', () => {
    expect(openaiChat.extractModel({ model: 'gpt-4o-2024-11-20' })).toBe('gpt-4o-2024-11-20');
  });

  it('returns null when the field is missing', () => {
    expect(openaiChat.extractModel({})).toBeNull();
  });
});

describe('openai-chat stream parser', () => {
  it('assembles the deltas into one chat-completion-shaped object', () => {
    const { text, final, done } = drive([
      '{"model":"gpt-4o","choices":[{"delta":{"role":"assistant"}}]}',
      '{"choices":[{"delta":{"content":"Hel"}}]}',
      '{"choices":[{"delta":{"content":"lo"}}]}',
      '{"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}',
      '[DONE]',
    ]);
    expect(text).toBe('Hello');
    expect(done).toBe(true);
    expect(final).toEqual({
      model: 'gpt-4o',
      choices: [{ message: { role: 'assistant', content: 'Hello' } }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    });
  });

  // So the assembled-JSON view matches the non-streamed shape even when the
  // provider sends neither a model nor usage.
  it('assembles a final object even from a bare stream', () => {
    expect(drive(['[DONE]']).final).toEqual({
      model: null,
      choices: [{ message: { role: 'assistant', content: '' } }],
      usage: null,
    });
  });

  it('ignores keep-alive and unparseable chunks', () => {
    expect(drive(['', 'not json', '{"choices":[{"delta":{}}]}']).text).toBe('');
  });

  it('keeps the first model it sees', () => {
    const { final } = drive(['{"model":"first"}', '{"model":"second"}', '[DONE]']) as {
      final: { model: string };
    };
    expect(final.model).toBe('first');
  });
});
