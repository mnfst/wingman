// Reading an edited snippet back into the form: the other half of the
// two-way binding between the Code panel and the rest of the request bar.
//
// It matches patterns rather than parsing three languages, which is enough
// because every snippet starts life as one of our own templates. Anything it
// can't find it leaves alone: a field missing from the patch means "don't
// touch", never "clear". The one exception is the system prompt, which a
// snippet that carries the user message is expected to carry too.
import type { ApiFormat } from '../formats';
import { normalizeBaseUrl } from '../services/baseUrl';
import { headerValue, KEY_PLACEHOLDERS } from './context';
import {
  blockAfter,
  containsEnvRef,
  escapeRegex,
  fieldRegex,
  lineFieldRegex,
  matchValue,
  matchValues,
  unquote,
  valueRegex,
  VALUE,
} from './literals';

/** Form fields an edited snippet asks to change. Absent key = leave as is. */
export interface SnippetPatch {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  systemPrompt?: string;
  userMessage?: string;
  headers?: Record<string, string>;
}

export interface ParseOptions {
  format: ApiFormat;
  /** Exactly what the builder injected for the user (auth, Content-Type). */
  autoHeaders: Record<string, string>;
}

interface Message {
  role: string;
  content: string;
}

const BASE_URL = fieldRegex('base_?url');
const FETCH_URL = valueRegex(String.raw`\bfetch\(\s*`);
const CURL_URL = valueRegex(String.raw`-X\s+POST\s+`);

const API_KEY = fieldRegex('api_?key');
const API_KEY_LINE = /\bapi_?key"?\s*[:=][ \t]*([^\n]*)/i;
const BEARER = /Authorization"?\s*:\s*["'`]?\s*Bearer\s+([^\s"'`,}]+)/i;

const MODEL_CALL = valueRegex(String.raw`\bmodel"?\s*[:=][ \t]*[A-Za-z_$][\w$]*\(\s*`);
const MODEL = fieldRegex('model');
const OPENCLAW_MODEL = valueRegex(String.raw`"models"\s*:\s*\[\s*\{\s*"id"\s*:\s*`);
const OPENCLAW_PRIMARY = /model\.primary\s+[^\s/]+\/(\S+)/;
const YAML_DEFAULT = /^[ \t]*default:[ \t]*(\S+)[ \t]*$/m;

const MESSAGE_LIST = /\b(?:messages"?\s*[:=]|\.invoke\()\s*\[/i;
const ROLE = fieldRegex('role');
const CONTENT = fieldRegex('content');
const PROMPT = lineFieldRegex('prompt');
const INPUT = lineFieldRegex('input');
const HERMES_MESSAGE = valueRegex(String.raw`-q\s+`);
const SYSTEM = lineFieldRegex('system');
const INSTRUCTIONS = lineFieldRegex('instructions');

const CURL_HEADER = valueRegex(String.raw`-H\s+`, 'gi');
const HEADER_BLOCK = /\b(?:defaultHeaders|default_headers|headers)"?\s*[:=][ \t]*\{/i;
const HEADER_PAIR = new RegExp(VALUE + String.raw`\s*:[ \t]*` + VALUE, 'g');

function parseBaseUrl(code: string, format: ApiFormat): string | undefined {
  const raw =
    matchValue(code, BASE_URL) ?? matchValue(code, FETCH_URL) ?? matchValue(code, CURL_URL);
  if (raw === undefined || containsEnvRef(raw)) return undefined;
  // Snippets append the endpoint path the format owns, so strip it back off,
  // or a round trip grows a `/v1` per edit.
  const normalized = normalizeBaseUrl(raw, format.path);
  return normalized.valid ? normalized.base : undefined;
}

function parseApiKey(code: string, format: ApiFormat): string | undefined {
  // Shell quoting can splice a reference into the middle of a string literal
  // (OpenClaw's config blob renders `"apiKey":"'"$KEY"'"`), and reading a value
  // out of that yields a stray quote. Whether the *declaration* mentions an env
  // var is the reliable signal, so check the line before extracting from it.
  const declaration = API_KEY_LINE.exec(code)?.[1];
  if (declaration !== undefined && containsEnvRef(declaration)) return undefined;

  const named = format.auth.kind === 'header' ? fieldRegex(escapeRegex(format.auth.name)) : null;
  const raw =
    matchValue(code, API_KEY) ??
    matchValue(code, BEARER) ??
    (named ? matchValue(code, named) : undefined);
  if (raw === undefined || containsEnvRef(raw)) return undefined;
  return KEY_PLACEHOLDERS.includes(raw) ? '' : raw;
}

function parseModel(code: string): string | undefined {
  const raw =
    matchValue(code, MODEL_CALL) ??
    matchValue(code, MODEL) ??
    matchValue(code, OPENCLAW_MODEL) ??
    matchValue(code, OPENCLAW_PRIMARY) ??
    matchValue(code, YAML_DEFAULT);
  return raw === undefined || containsEnvRef(raw) ? undefined : raw;
}

/** `[{role, content}, …]` from JSON, or null when it isn't valid JSON. */
function messagesFromJson(block: string): Message[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const out: Message[] = [];
  for (const item of parsed) {
    const rec = item as Record<string, unknown> | null;
    if (!rec || typeof rec !== 'object' || typeof rec.content !== 'string') continue;
    out.push({ role: typeof rec.role === 'string' ? rec.role : 'user', content: rec.content });
  }
  return out;
}

/**
 * The messages array, wherever it lives: a `messages` key (SDK call, JSON body)
 * or LangChain's positional `.invoke([…])`. Python and the JSON bodies parse as
 * JSON; the JS object-literal form (`[{ role: "user", … }]`) doesn't, so it
 * falls back to sweeping the braces.
 */
function parseMessageList(code: string): Message[] | undefined {
  const block = blockAfter(code, MESSAGE_LIST);
  if (block === null) return undefined;
  const json = messagesFromJson(block);
  if (json) return json;
  const out: Message[] = [];
  for (const object of block.match(/\{[^{}]*\}/g) ?? []) {
    const content = matchValue(object, CONTENT);
    if (content === undefined) continue;
    out.push({ role: matchValue(object, ROLE) ?? 'user', content });
  }
  return out;
}

function parseUserMessage(code: string, list?: Message[]): string | undefined {
  const fromList = list?.filter((m) => m.role === 'user').pop()?.content;
  if (fromList !== undefined) return fromList;
  return matchValue(code, PROMPT) ?? matchValue(code, INPUT) ?? matchValue(code, HERMES_MESSAGE);
}

function parseSystemPrompt(code: string, list?: Message[]): string | undefined {
  // Anthropic and Responses hoist it out of the message list, so a dedicated
  // field wins over one; OpenAI-shaped bodies only ever have the message.
  const explicit = matchValue(code, SYSTEM) ?? matchValue(code, INSTRUCTIONS);
  if (explicit !== undefined) return explicit;
  return list?.find((m) => m.role === 'system')?.content;
}

function curlHeaders(code: string): Record<string, string> | null {
  const flags = matchValues(code, CURL_HEADER);
  if (flags.length === 0) return null;
  const out: Record<string, string> = {};
  for (const flag of flags) {
    const at = flag.indexOf(':');
    if (at > 0) out[flag.slice(0, at).trim()] = flag.slice(at + 1).trim();
  }
  return out;
}

function objectHeaders(code: string): Record<string, string> | null {
  const block = blockAfter(code, HEADER_BLOCK);
  if (block === null) return null;
  const out: Record<string, string> = {};
  for (const pair of block.matchAll(HEADER_PAIR)) {
    const name = unquote(pair[1]!);
    if (name) out[name] = unquote(pair[2]!);
  }
  return out;
}

/**
 * The headers the user actually owns. Whatever the builder injected for them
 * (the credential, `Content-Type`) is subtracted again, so round-tripping a
 * snippet never files an auto-generated `Authorization` into the Headers tab.
 */
function parseHeaders(code: string, auto: Record<string, string>): Record<string, string> {
  const found = curlHeaders(code) ?? objectHeaders(code) ?? {};
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(found)) {
    const injected = headerValue(auto, name);
    if (injected !== undefined && (injected === value || containsEnvRef(value))) continue;
    out[name] = value;
  }
  return out;
}

export function parseSnippet(code: string, opts: ParseOptions): SnippetPatch {
  const patch: SnippetPatch = { headers: parseHeaders(code, opts.autoHeaders) };
  const list = parseMessageList(code);

  const baseUrl = parseBaseUrl(code, opts.format);
  if (baseUrl !== undefined) patch.baseUrl = baseUrl;
  const apiKey = parseApiKey(code, opts.format);
  if (apiKey !== undefined) patch.apiKey = apiKey;
  const model = parseModel(code);
  if (model !== undefined) patch.model = model;

  const userMessage = parseUserMessage(code, list);
  if (userMessage !== undefined) {
    patch.userMessage = userMessage;
    // A snippet that spells out the user message spells out the system prompt
    // too, so not finding one means there is none. Deleting the system message
    // from the code is how you clear it.
    patch.systemPrompt = parseSystemPrompt(code, list) ?? '';
  }
  return patch;
}
