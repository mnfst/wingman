// Profiles are agent/SDK *fingerprints* layered on top of an API format. A
// profile contributes request headers (to mimic a real client), a default
// system prompt, an optional body fragment, and an SDK code snippet. But the
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

/** @deprecated use RequestParams from ./formats. Kept as an alias. */
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
   * When true, the Headers panel is hidden: the profile simulates a real
   * SDK/agent fingerprint and arbitrary header editing would defeat that. The
   * Default client leaves this false because hand-crafting is its whole point.
   */
  headersLocked?: boolean;
  /**
   * When true, the SDK code editor can actually drive the request: editing
   * the code and hitting Send executes it via stubbed SDKs. Currently only
   * the TypeScript SDK profiles can do this. Python needs Pyodide.
   */
  executable?: boolean;
  headers: (params: RequestParams) => Record<string, string>;
  /**
   * Fingerprint-only body fields merged on top of the format's body (e.g.
   * OpenClaw's `max_completion_tokens`). Optional, and most profiles add nothing.
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
    blurb: "Personal AI agent. Sends OpenClaw's system prompt behind stainless JS headers.",
    icon: '/icons/openclaw.png',
    langs: ['bash'],
    defaultLang: 'bash',
    formats: ['openai-chat'],
    defaultSystemPrompt: OPENCLAW_SYSTEM,
    headersLocked: true,
    headers: () => ({ ...stainlessJs }),
    // `store: false` was dropped upstream in openclaw 2026.7.x. The shipped
    // client now sends only the token cap (July 2026 capture).
    bodyExtras: () => ({ max_completion_tokens: 8192 }),
    code: (p) => openclawSnippet(p),
  },
  {
    id: 'hermes',
    label: 'Hermes Agent',
    mode: 'agent',
    category: 'personal',
    blurb: "Personal AI agent. Sends Hermes' system prompt behind stainless Python headers.",
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
    blurb: 'The official OpenAI client, calling Chat Completions.',
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
    blurb: 'The Vercel AI SDK, set up with its OpenAI provider.',
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
    blurb: 'LangChain, using its OpenAI-compatible chat model.',
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
    blurb: 'The official OpenAI client, calling the Responses API.',
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
    blurb: 'The official Anthropic client, calling the Messages API.',
    icon: '/icons/providers/anthropic.svg',
    langs: ['typescript', 'python'],
    defaultLang: 'typescript',
    formats: ['anthropic-messages'],
    headers: () => ({}),
    code: (p, lang) => anthropicSdkSnippet(p, lang),
  },
  // Was two entries, "cURL" and "Raw / None". They were indistinguishable on
  // the wire: the only thing separating them was cURL's `User-Agent`, and the
  // browser strips that from every fetch (see FORBIDDEN_HEADERS in send.ts), so
  // both sent byte-identical requests. Now one client, with cURL and fetch as
  // two renderings of the same call.
  {
    id: 'default',
    label: 'Default',
    mode: 'raw',
    category: 'raw',
    blurb: 'No client fingerprint. Just the request, the way your own code would send it.',
    icon: '/icons/other.svg',
    langs: ['bash', 'typescript'],
    defaultLang: 'bash',
    formats: ['openai-chat', 'openai-responses', 'anthropic-messages'],
    headers: () => ({}),
    code: (p, lang, format) =>
      lang === 'typescript' ? rawSnippet(p, format) : curlSnippet(p, format),
  },
];

export const PROFILE_BY_ID: Record<string, Profile> = Object.fromEntries(
  PROFILES.map((p) => [p.id, p]),
);

// Clients that used to exist, mapped to the one that replaced them. Stored
// settings and saved history outlive a catalog change, so a retired id has to
// keep resolving to something rather than silently landing on the wrong client.
const PROFILE_ALIASES: Record<string, string> = {
  curl: 'default',
  raw: 'default',
};

/** The live id for a client id read back from storage or history. */
export function resolveProfileId(id: string): string {
  if (PROFILE_BY_ID[id]) return id;
  return PROFILE_ALIASES[id] ?? id;
}

/** Profiles compatible with a given format, in catalog order. */
export function profilesForFormat(formatId: ApiFormatId): Profile[] {
  return PROFILES.filter((p) => p.formats.includes(formatId));
}
