// What every snippet builder reads, and the shared plumbing for rendering it.
// Snippets are illustrative (non-streaming) — they mirror the form, they don't
// drive the request (the format does). The one thing they must never do is
// hand out a live credential: the Code panel is the part of Wingman people
// screenshot, paste into an issue or share on a call, so the key is written as
// an env-var reference unless the user asks to see it.
import type { ApiFormat, RequestParams } from '../formats';
import type { ProfileLang } from '../profiles';

export const MANIFEST_KEY_PLACEHOLDER = 'mnfst_YOUR_KEY';
export const GENERIC_KEY_PLACEHOLDER = 'YOUR_API_KEY';

/** Stand-ins a snippet prints when there's no key — never a real value. */
export const KEY_PLACEHOLDERS: readonly string[] = [
  MANIFEST_KEY_PLACEHOLDER,
  GENERIC_KEY_PLACEHOLDER,
];

/** How the API key is rendered into a snippet. */
export interface KeyRef {
  /** True to print an env-var reference instead of the secret (the default). */
  hidden: boolean;
  /** Env var the reference points at, e.g. `OPENAI_API_KEY`. */
  envName: string;
  /** The key from the URL bar. Empty when the user hasn't typed one. */
  value: string;
}

export interface SnippetContext {
  params: RequestParams;
  lang: ProfileLang;
  format: ApiFormat;
  /** Every header the Headers tab lists, as a record. */
  headers: Record<string, string>;
  /** The subset of those the client and format contribute on their own. */
  clientHeaders: Record<string, string>;
  key: KeyRef;
}

/**
 * The key where a *value expression* is expected — quotes included when it's a
 * literal, because `process.env.X` must not be quoted and `"sk-…"` must be.
 */
export function keyExpr(ctx: SnippetContext, placeholder = MANIFEST_KEY_PLACEHOLDER): string {
  if (!ctx.key.hidden) return JSON.stringify(ctx.key.value || placeholder);
  switch (ctx.lang) {
    case 'python':
      return `os.environ["${ctx.key.envName}"]`;
    case 'bash':
      return `"$${ctx.key.envName}"`;
    default:
      return `process.env.${ctx.key.envName}`;
  }
}

/** The key spliced *into* an existing string — a YAML value, a curl header. */
export function keyInline(ctx: SnippetContext, placeholder = MANIFEST_KEY_PLACEHOLDER): string {
  if (!ctx.key.hidden) return ctx.key.value || placeholder;
  return `$${ctx.key.envName}`;
}

/** True when a Python snippet has to `import os` for its key reference. */
export function needsOsImport(ctx: SnippetContext): boolean {
  return ctx.key.hidden && ctx.lang === 'python';
}

/** One-line reminder that a shell snippet expects the key in the environment. */
export function envHint(ctx: SnippetContext): string {
  if (!ctx.key.hidden) return '';
  return `# Reads your key from the environment: export ${ctx.key.envName}=...\n`;
}

export function jsonBody(body: unknown, indent = 2): string {
  return JSON.stringify(body, null, indent);
}

export function messages(p: RequestParams) {
  const list: Array<{ role: string; content: string }> = [];
  if (p.systemPrompt.trim()) list.push({ role: 'system', content: p.systemPrompt });
  list.push({ role: 'user', content: p.userMessage });
  return list;
}

export function indentLines(text: string, spaces: number): string {
  return text.replace(/\n/g, '\n' + ' '.repeat(spaces));
}

/** Case-insensitive lookup, because header names aren't case-sensitive. */
export function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

/**
 * The headers a *client* snippet has to declare: whatever the Headers tab holds
 * beyond what the SDK sends by itself. An SDK stamps its own fingerprint, so
 * repeating those ten stainless headers in the snippet would be noise — only
 * what the user added or overrode belongs in the code.
 */
export function extraHeaders(ctx: SnippetContext): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx.headers)) {
    if (k.toLowerCase() === 'content-type') continue;
    if (headerValue(ctx.clientHeaders, k) === v) continue;
    out[k] = v;
  }
  return out;
}

/** `Authorization: Bearer …` / `x-api-key: …`, as the format demands it. */
export function authHeaderPair(ctx: SnippetContext): [string, string] | null {
  const key = keyInline(ctx, GENERIC_KEY_PLACEHOLDER);
  if (ctx.format.auth.kind === 'bearer') return ['Authorization', `Bearer ${key}`];
  if (ctx.format.auth.kind === 'header') return [ctx.format.auth.name, key];
  return null;
}

/**
 * The header pairs a raw snippet spells out on the user's behalf, because the
 * form adds them automatically: the credential and `Content-Type`. Skipped when
 * the Headers tab already defines them — a hand-written override wins, exactly
 * as it does in `send.ts`.
 *
 * Round-tripping depends on this: parsing an edited snippet subtracts the same
 * set, so auto-injected headers never leak back into the Headers tab.
 */
export function autoHeaders(ctx: SnippetContext): Record<string, string> {
  const out: Record<string, string> = {};
  const auth = authHeaderPair(ctx);
  if (auth && headerValue(ctx.headers, auth[0]) === undefined) out[auth[0]] = auth[1];
  if (headerValue(ctx.headers, 'Content-Type') === undefined) {
    out['Content-Type'] = 'application/json';
  }
  return out;
}

/** Every header a raw (cURL / fetch) snippet prints, in wire order. */
export function wireHeaders(ctx: SnippetContext): Record<string, string> {
  const out = { ...autoHeaders(ctx) };
  for (const [k, v] of Object.entries(ctx.headers)) out[k] = v;
  return out;
}
