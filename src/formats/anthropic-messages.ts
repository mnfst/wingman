import type { ApiFormat, StreamDelta, StreamParser, Usage } from './types';
import { asArray, asNumber, asRecord, asString, parseData } from './helpers';

const DEFAULT_MAX_TOKENS = 1024;

// Assistant text is the concatenation of `content[]` parts of type `text`.
function extractText(json: unknown): string | null {
  const content = asArray(asRecord(json)?.content);
  if (!content) return null;
  const parts: string[] = [];
  for (const part of content) {
    const rec = asRecord(part);
    if (rec?.type === 'text') {
      const t = asString(rec.text);
      if (t) parts.push(t);
    }
  }
  return parts.length ? parts.join('') : null;
}

// Anthropic reports input/output tokens but no total, so we compute it.
function extractUsage(json: unknown): Usage | null {
  const u = asRecord(asRecord(json)?.usage);
  if (!u) return null;
  const input = asNumber(u.input_tokens);
  const output = asNumber(u.output_tokens);
  const total =
    input !== undefined || output !== undefined ? (input ?? 0) + (output ?? 0) : undefined;
  return { in: input, out: output, total };
}

function extractModel(json: unknown): string | null {
  return asString(asRecord(json)?.model);
}

// Anthropic splits the message across events: `message_start` carries the model
// and input tokens, `content_block_delta` streams text, `message_delta` carries
// output tokens, and `message_stop` ends it. We accumulate everything and emit
// one assembled message object (matching the non-streamed shape) at the end.
function createStreamParser(): StreamParser {
  let text = '';
  let model: string | null = null;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  const assembled = () => ({
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  });

  return {
    push(evt): StreamDelta {
      const parsed = parseData(evt.data);
      if (!parsed) return {};
      const type = evt.event ?? asString(parsed.type);
      switch (type) {
        case 'message_start': {
          const msg = asRecord(parsed.message);
          model = asString(msg?.model);
          inputTokens = asNumber(asRecord(msg?.usage)?.input_tokens);
          return {};
        }
        case 'content_block_delta': {
          const delta = asString(asRecord(parsed.delta)?.text);
          if (delta) {
            text += delta;
            return { text: delta };
          }
          return {};
        }
        case 'message_delta': {
          const out = asNumber(asRecord(parsed.usage)?.output_tokens);
          if (out !== undefined) outputTokens = out;
          return {};
        }
        case 'message_stop':
          return { final: assembled(), done: true };
        case 'error':
          return { final: parsed, done: true };
        default:
          return {};
      }
    },
  };
}

export const anthropicMessages: ApiFormat = {
  id: 'anthropic-messages',
  label: 'Anthropic Messages',
  blurb: 'POST /v1/messages, Anthropic’s native API (x-api-key, requires max_tokens).',
  icon: '/icons/providers/anthropic.svg',
  docsUrl: 'https://docs.anthropic.com/en/api/messages',
  path: '/v1/messages',
  placeholderBaseUrl: 'https://api.anthropic.com',
  auth: { kind: 'header', name: 'x-api-key' },
  defaultHeaders: {
    'anthropic-version': '2023-06-01',
    // Required for Anthropic to accept requests straight from a browser origin.
    'anthropic-dangerous-direct-browser-access': 'true',
  },
  requiresMaxTokens: true,
  buildBody(p, { stream }) {
    const body: Record<string, unknown> = {
      model: p.model,
      max_tokens: p.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: [{ role: 'user', content: p.userMessage }],
    };
    if (p.systemPrompt.trim()) body.system = p.systemPrompt;
    if (p.temperature !== undefined) body.temperature = p.temperature;
    if (stream) body.stream = true;
    return body;
  },
  extractText,
  extractUsage,
  extractModel,
  createStreamParser,
};
