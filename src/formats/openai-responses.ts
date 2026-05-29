import type { ApiFormat, StreamDelta, StreamParser, Usage } from './types';
import { asArray, asNumber, asRecord, asString, parseData } from './helpers';

// Responses returns an `output` array of items; assistant text lives in
// `output[].content[]` parts of type `output_text`. The SDK also exposes an
// aggregated `output_text` string, which we honour when present.
function extractText(json: unknown): string | null {
  const root = asRecord(json);
  if (!root) return null;
  const aggregated = asString(root.output_text);
  if (aggregated !== null) return aggregated;
  const output = asArray(root.output);
  if (!output) return null;
  const parts: string[] = [];
  for (const item of output) {
    const content = asArray(asRecord(item)?.content);
    if (!content) continue;
    for (const part of content) {
      const rec = asRecord(part);
      if (rec?.type === 'output_text') {
        const t = asString(rec.text);
        if (t) parts.push(t);
      }
    }
  }
  return parts.length ? parts.join('') : null;
}

function extractUsage(json: unknown): Usage | null {
  const u = asRecord(asRecord(json)?.usage);
  if (!u) return null;
  return {
    in: asNumber(u.input_tokens),
    out: asNumber(u.output_tokens),
    total: asNumber(u.total_tokens),
  };
}

function extractModel(json: unknown): string | null {
  return asString(asRecord(json)?.model);
}

// Responses streams typed events; the SSE `event:` line names the type. Text
// arrives as `response.output_text.delta`; the full object (with usage) lands
// in `response.completed`.
function createStreamParser(): StreamParser {
  return {
    push(evt): StreamDelta {
      const parsed = parseData(evt.data);
      if (!parsed) return {};
      const type = evt.event ?? asString(parsed.type);
      if (type === 'response.output_text.delta') {
        const delta = asString(parsed.delta);
        return delta ? { text: delta } : {};
      }
      if (type === 'response.completed' || type === 'response.incomplete') {
        return { final: parsed.response ?? parsed, done: true };
      }
      if (type === 'response.failed' || type === 'error') {
        return { final: parsed.response ?? parsed, done: true };
      }
      return {};
    },
  };
}

export const openaiResponses: ApiFormat = {
  id: 'openai-responses',
  label: 'OpenAI Responses',
  blurb: 'POST /v1/responses — OpenAI’s newer stateful API with typed streaming events.',
  icon: '/icons/providers/openai.svg',
  docsUrl: 'https://platform.openai.com/docs/api-reference/responses',
  path: '/v1/responses',
  placeholderBaseUrl: 'https://api.openai.com',
  auth: { kind: 'bearer' },
  buildBody(p, { stream }) {
    const body: Record<string, unknown> = { model: p.model, input: p.userMessage };
    if (p.systemPrompt.trim()) body.instructions = p.systemPrompt;
    if (p.temperature !== undefined) body.temperature = p.temperature;
    if (p.maxTokens !== undefined) body.max_output_tokens = p.maxTokens;
    if (stream) body.stream = true;
    return body;
  },
  extractText,
  extractUsage,
  extractModel,
  createStreamParser,
};
