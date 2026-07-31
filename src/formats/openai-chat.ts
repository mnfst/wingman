import type { ApiFormat, RequestParams, StreamDelta, StreamParser, Usage } from './types';
import { asArray, asNumber, asRecord, asString, parseData } from './helpers';

function messages(p: RequestParams) {
  const list: Array<{ role: string; content: string }> = [];
  if (p.systemPrompt.trim()) list.push({ role: 'system', content: p.systemPrompt });
  list.push({ role: 'user', content: p.userMessage });
  return list;
}

function extractText(json: unknown): string | null {
  const choices = asArray(asRecord(json)?.choices);
  const first = asRecord(choices?.[0]);
  if (!first) return null;
  const content = asString(asRecord(first.message)?.content);
  if (content !== null) return content;
  return asString(first.text);
}

function extractUsage(json: unknown): Usage | null {
  const u = asRecord(asRecord(json)?.usage);
  if (!u) return null;
  return {
    in: asNumber(u.prompt_tokens),
    out: asNumber(u.completion_tokens),
    total: asNumber(u.total_tokens),
  };
}

function extractModel(json: unknown): string | null {
  return asString(asRecord(json)?.model);
}

// Reassembles streamed `choices[0].delta.content` chunks into a single
// chat-completion-shaped object so the usage/model chips and the assembled-JSON
// view work the same as a non-streamed response. `[DONE]` ends the stream;
// usage arrives in a trailing chunk when `stream_options.include_usage` is set.
function createStreamParser(): StreamParser {
  let text = '';
  let model: string | null = null;
  let usage: unknown = null;
  return {
    push(evt): StreamDelta {
      if (evt.data.trim() === '[DONE]') {
        return {
          done: true,
          final: {
            model,
            choices: [{ message: { role: 'assistant', content: text } }],
            usage,
          },
        };
      }
      const parsed = parseData(evt.data);
      if (!parsed) return {};
      if (model === null) model = asString(parsed.model);
      if (parsed.usage) usage = parsed.usage;
      const firstChoice = asRecord(asArray(parsed.choices)?.[0]);
      const delta = asString(asRecord(firstChoice?.delta)?.content);
      if (delta) {
        text += delta;
        return { text: delta };
      }
      return {};
    },
  };
}

export const openaiChat: ApiFormat = {
  id: 'openai-chat',
  label: 'OpenAI Chat Completions',
  blurb: 'POST /v1/chat/completions, the OpenAI-compatible standard (Groq, Together, DeepSeek…).',
  icon: '/icons/providers/openai.svg',
  docsUrl: 'https://platform.openai.com/docs/api-reference/chat',
  path: '/v1/chat/completions',
  placeholderBaseUrl: 'https://your-manifest.example.com',
  auth: { kind: 'bearer' },
  healthPath: '/api/v1/health',
  buildBody(p, { stream }) {
    const body: Record<string, unknown> = { model: p.model, messages: messages(p) };
    if (p.temperature !== undefined) body.temperature = p.temperature;
    if (p.maxTokens !== undefined) body.max_tokens = p.maxTokens;
    if (stream) {
      body.stream = true;
      body.stream_options = { include_usage: true };
    }
    return body;
  },
  extractText,
  extractUsage,
  extractModel,
  createStreamParser,
};
