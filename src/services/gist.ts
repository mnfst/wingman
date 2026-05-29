import type { SendResult } from '../send';
import type { ApiFormat } from '../formats';

export interface GistContext {
  profileLabel: string;
  profileCategory: string;
  formatLabel: string;
  streamed: boolean;
  systemPrompt: string;
  userMessage: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

const NEW_GIST_URL = 'https://gist.github.com/';

function redactApiKey(key: string): string {
  if (!key) return '(none)';
  if (key.length <= 8) return '***';
  return `${key.slice(0, 8)}…${key.slice(-2)}`;
}

function redactAuthHeader(value: string): string {
  return value.replace(/(Bearer\s+)([^\s]+)/i, (_, p1, token: string) => p1 + redactApiKey(token));
}

// Auth lands in Authorization (Bearer) or x-api-key (Anthropic) depending on
// the format — redact both so a shared gist never leaks a key.
function redactHeaderValue(key: string, value: string): string {
  const lower = key.toLowerCase();
  if (lower === 'authorization') return redactAuthHeader(value);
  if (lower === 'x-api-key') return redactApiKey(value);
  return value;
}

function formatHeaders(headers: Record<string, string>): string {
  const entries = Object.entries(headers);
  if (entries.length === 0) return '(none)';
  return entries.map(([k, v]) => `${k}: ${redactHeaderValue(k, v)}`).join('\n');
}

function prettyJson(raw: string, parsed: unknown): string {
  if (parsed && typeof parsed === 'object') {
    return JSON.stringify(parsed, null, 2);
  }
  return raw || '(empty)';
}

function statusEmoji(result: SendResult): string {
  if (result.status === 0) return '🌐';
  if (result.ok) return '✅';
  if (result.status >= 500) return '🔥';
  return '⚠️';
}

export function buildMarkdownReport(
  ctx: GistContext,
  result: SendResult,
  format: ApiFormat,
): string {
  const usage = format.extractUsage(result.responseJson);
  const model = format.extractModel(result.responseJson);
  const assistant = format.extractText(result.responseJson) ?? result.streamedText ?? null;
  const statusLine =
    result.status === 0
      ? '`NETWORK` — request did not reach the server'
      : `\`${result.status} ${result.statusText}\``;
  const tokens =
    usage && (usage.in !== undefined || usage.out !== undefined || usage.total !== undefined)
      ? `${usage.total ?? '—'} total · ${usage.in ?? '—'} in / ${usage.out ?? '—'} out`
      : '—';

  const lines: string[] = [];
  lines.push(`# Manifest Wingman — request report`);
  lines.push('');
  lines.push(`${statusEmoji(result)} **${ctx.profileLabel}** → ${result.url}`);
  lines.push('');
  lines.push('| | |');
  lines.push('|---|---|');
  lines.push(`| **Format** | ${ctx.formatLabel}${ctx.streamed ? ' · streamed' : ''} |`);
  lines.push(`| **Profile** | ${ctx.profileLabel} _(${ctx.profileCategory})_ |`);
  lines.push(`| **Status** | ${statusLine} |`);
  lines.push(`| **Latency** | ${result.durationMs.toFixed(0)} ms |`);
  if (result.ttftMs !== undefined) {
    lines.push(`| **Time to first token** | ${result.ttftMs.toFixed(0)} ms |`);
  }
  lines.push(`| **Model returned** | ${model ? `\`${model}\`` : '—'} |`);
  lines.push(`| **Tokens** | ${tokens} |`);
  lines.push(`| **Base URL** | \`${ctx.baseUrl}\` |`);
  lines.push(`| **Model requested** | \`${ctx.model}\` |`);
  lines.push(`| **API key** | \`${redactApiKey(ctx.apiKey)}\` |`);
  lines.push(`| **Captured at** | ${new Date().toISOString()} |`);
  lines.push('');

  if (result.error) {
    lines.push('## Error');
    lines.push('');
    lines.push('```');
    lines.push(result.error);
    lines.push('```');
    lines.push('');
  }

  if (assistant) {
    lines.push('## Assistant message');
    lines.push('');
    lines.push(
      assistant
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n'),
    );
    lines.push('');
  }

  if (ctx.systemPrompt.trim()) {
    lines.push('## System prompt');
    lines.push('');
    lines.push('```');
    lines.push(ctx.systemPrompt);
    lines.push('```');
    lines.push('');
  }

  lines.push('## User message');
  lines.push('');
  lines.push('```');
  lines.push(ctx.userMessage);
  lines.push('```');
  lines.push('');

  lines.push('## Request');
  lines.push('');
  lines.push('### Headers');
  lines.push('');
  lines.push('```http');
  lines.push(formatHeaders(result.requestHeaders));
  lines.push('```');
  lines.push('');
  lines.push('### Body');
  lines.push('');
  lines.push('```json');
  lines.push(result.requestBody || '(empty)');
  lines.push('```');
  lines.push('');

  lines.push('## Response');
  lines.push('');
  lines.push('### Headers');
  lines.push('');
  lines.push('```http');
  lines.push(formatHeaders(result.responseHeaders));
  lines.push('```');
  lines.push('');
  lines.push(`### Body${ctx.streamed ? ' (raw SSE)' : ''}`);
  lines.push('');
  lines.push(ctx.streamed ? '```' : '```json');
  lines.push(
    ctx.streamed
      ? result.responseBody || '(empty)'
      : prettyJson(result.responseBody, result.responseJson),
  );
  lines.push('```');
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push(
    '_Generated by [Manifest Wingman](https://manifest.build) — gateway tester for contributors._',
  );
  return lines.join('\n');
}

export const NEW_GIST_TARGET_URL = NEW_GIST_URL;
