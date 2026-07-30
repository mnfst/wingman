// Profiles are agent/SDK *fingerprints* layered on top of an API format. A
// profile contributes request headers (to mimic a real client), a default
// system prompt, an optional body fragment, and an SDK code snippet — but the
// wire shape (path, auth, body, response parsing) belongs to the ApiFormat.
// Each profile declares which formats it's compatible with; the UI filters the
// list to the selected format.
//
// Verbatim system prompts captured from the real OpenClaw and Hermes CLIs are
// kept in their own modules so this catalog stays scannable.
import { OPENCLAW_SYSTEM } from './templates/openclaw-system';
import { HERMES_SYSTEM } from './templates/hermes-system';
import type { ApiFormat, ApiFormatId, RequestParams } from './formats';
import {
  anthropicSdkSnippet,
  curlSnippet,
  hermesSnippet,
  langchainSnippet,
  openaiResponsesSnippet,
  openaiSdkSnippet,
  openclawSnippet,
  rawSnippet,
  vercelSnippet,
} from './snippets';

export type ProfileMode = 'agent' | 'sdk' | 'raw';
export type ProfileLang = 'typescript' | 'python' | 'bash';

/** @deprecated use RequestParams from ./formats — kept as an alias. */
export type ProfileParams = RequestParams;

export interface Profile {
  id: string;
  label: string;
  mode: ProfileMode;
  category: 'personal' | 'app' | 'raw';
  blurb: string;
  icon: string;
  langs: ProfileLang[];
  defaultLang: ProfileLang;
  /** API formats this profile is compatible with. */
  formats: ApiFormatId[];
  defaultSystemPrompt?: string;
  /**
   * When true, the Headers panel is hidden — the profile simulates a real
   * SDK/agent fingerprint and arbitrary header editing would defeat that.
   * cURL and Raw set this to false because their whole point is hand-crafted
   * requests.
   */
  headersLocked?: boolean;
  /**
   * When true, the SDK code editor can actually drive the request: editing
   * the code and hitting Send executes it via stubbed SDKs. Currently only
   * the TypeScript SDK profiles can do this — Python needs Pyodide.
   */
  executable?: boolean;
  headers: (params: RequestParams) => Record<string, string>;
  /**
   * Fingerprint-only body fields merged on top of the format's body (e.g.
   * OpenClaw's `max_completion_tokens`). Optional — most profiles add nothing.
   */
  bodyExtras?: (params: RequestParams) => Record<string, unknown>;
  code: (params: RequestParams, lang: ProfileLang, format: ApiFormat) => string;
}

const stainlessJs = {
  'User-Agent': 'OpenAI/JS 6.45.0',
  'X-Stainless-Lang': 'js',
  'X-Stainless-Package-Version': '6.45.0',
  'X-Stainless-OS': 'Linux',
  'X-Stainless-Arch': 'x64',
  'X-Stainless-Runtime': 'node',
  'X-Stainless-Runtime-Version': 'v22.17.1',
  'X-Stainless-Retry-Count': '0',
  'accept-language': '*',
  'sec-fetch-mode': 'cors',
};

const stainlessPython = {
  'User-Agent': 'OpenAI/Python 2.31.0',
  'X-Stainless-Lang': 'python',
  'X-Stainless-Package-Version': '2.31.0',
  'X-Stainless-OS': 'Linux',
  'X-Stainless-Arch': 'x64',
  'X-Stainless-Runtime': 'CPython',
  'X-Stainless-Runtime-Version': '3.11.14',
  'X-Stainless-Async': 'false',
  'x-stainless-retry-count': '0',
  'x-stainless-read-timeout': '60.0',
};

export const PROFILES: Profile[] = [
  {
    id: 'openclaw',
    label: 'OpenClaw',
    mode: 'agent',
    category: 'personal',
    blurb: 'Personal AI agent — stainless JS headers + OpenClaw system prompt.',
    icon: '/icons/openclaw.png',
    langs: ['bash'],
    defaultLang: 'bash',
    formats: ['openai-chat'],
    defaultSystemPrompt: OPENCLAW_SYSTEM,
    headersLocked: true,
    headers: () => ({ ...stainlessJs }),
    // `store: false` was dropped upstream in openclaw 2026.7.x — the shipped
    // client now sends only the token cap (July 2026 capture).
    bodyExtras: () => ({ max_completion_tokens: 8192 }),
    code: (p) => openclawSnippet(p),
  },
  {
    id: 'hermes',
    label: 'Hermes Agent',
    mode: 'agent',
    category: 'personal',
    blurb: 'Personal AI agent — stainless Python headers + Hermes system prompt.',
    icon: '/icons/hermes.png',
    langs: ['bash'],
    defaultLang: 'bash',
    formats: ['openai-chat'],
    defaultSystemPrompt: HERMES_SYSTEM,
    headersLocked: true,
    headers: () => ({ ...stainlessPython }),
    code: (p) => hermesSnippet(p),
  },
  {
    id: 'openai-sdk',
    label: 'OpenAI SDK',
    mode: 'sdk',
    category: 'app',
    blurb: 'Official OpenAI client (Chat Completions).',
    icon: '/icons/providers/openai.svg',
    langs: ['typescript', 'python'],
    defaultLang: 'typescript',
    formats: ['openai-chat'],
    headersLocked: true,
    executable: true,
    headers: () => ({ ...stainlessJs }),
    code: (p, lang) => openaiSdkSnippet(p, lang),
  },
  {
    id: 'vercel-ai-sdk',
    label: 'Vercel AI SDK',
    mode: 'sdk',
    category: 'app',
    blurb: 'Vercel AI SDK with the OpenAI provider.',
    icon: '/icons/vercel.svg',
    langs: ['typescript'],
    defaultLang: 'typescript',
    formats: ['openai-chat'],
    headersLocked: true,
    executable: true,
    headers: () => ({ 'User-Agent': 'ai-sdk/5.0.0 (Node.js v22.17.1)' }),
    code: (p) => vercelSnippet(p),
  },
  {
    id: 'langchain',
    label: 'LangChain',
    mode: 'sdk',
    category: 'app',
    blurb: 'LangChain with the OpenAI-compatible chat model.',
    icon: '/icons/langchain.png',
    langs: ['python', 'typescript'],
    defaultLang: 'python',
    formats: ['openai-chat'],
    headersLocked: true,
    executable: true,
    headers: () => ({ 'User-Agent': 'langchain-python/0.3.0' }),
    code: (p, lang) => langchainSnippet(p, lang),
  },
  {
    id: 'openai-responses',
    label: 'OpenAI SDK',
    mode: 'sdk',
    category: 'app',
    blurb: 'Official OpenAI client via the Responses API.',
    icon: '/icons/providers/openai.svg',
    langs: ['typescript', 'python'],
    defaultLang: 'typescript',
    formats: ['openai-responses'],
    headers: () => ({ ...stainlessJs }),
    code: (p, lang) => openaiResponsesSnippet(p, lang),
  },
  {
    id: 'anthropic-sdk',
    label: 'Anthropic SDK',
    mode: 'sdk',
    category: 'app',
    blurb: 'Official Anthropic client (Messages API).',
    icon: '/icons/providers/anthropic.svg',
    langs: ['typescript', 'python'],
    defaultLang: 'typescript',
    formats: ['anthropic-messages'],
    headers: () => ({}),
    code: (p, lang) => anthropicSdkSnippet(p, lang),
  },
  {
    id: 'curl',
    label: 'cURL',
    mode: 'sdk',
    category: 'app',
    blurb: 'Raw HTTP via cURL — no SDK fingerprint.',
    icon: '/icons/other.svg',
    langs: ['bash'],
    defaultLang: 'bash',
    formats: ['openai-chat', 'openai-responses', 'anthropic-messages'],
    headers: () => ({ 'User-Agent': 'curl/8.6.0' }),
    code: (p, _lang, format) => curlSnippet(p, format),
  },
  {
    id: 'raw',
    label: 'Raw / None',
    mode: 'raw',
    category: 'raw',
    blurb: 'Minimal fetch — no SDK headers. Useful for baseline measurements.',
    icon: '/icons/other-agent.svg',
    langs: ['bash'],
    defaultLang: 'bash',
    formats: ['openai-chat', 'openai-responses', 'anthropic-messages'],
    headers: () => ({}),
    code: (p, _lang, format) => rawSnippet(p, format),
  },
];

export const PROFILE_BY_ID: Record<string, Profile> = Object.fromEntries(
  PROFILES.map((p) => [p.id, p]),
);

/** Profiles compatible with a given format, in catalog order. */
export function profilesForFormat(formatId: ApiFormatId): Profile[] {
  return PROFILES.filter((p) => p.formats.includes(formatId));
}
