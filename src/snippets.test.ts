// The snippets are the app's "here is the code that made this call" promise, so
// what matters is that they carry the same endpoint, credential and body the
// request would — and that a value the user typed can't break out of the
// literal it lands in.
import { describe, expect, it } from 'vitest';
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
import { openaiChat } from './formats/openai-chat';
import { openaiResponses } from './formats/openai-responses';
import { anthropicMessages } from './formats/anthropic-messages';
import type { RequestParams } from './formats';

const params = (over: Partial<RequestParams> = {}): RequestParams => ({
  baseUrl: 'https://app.manifest.build',
  apiKey: 'mnfst_test',
  model: 'auto',
  systemPrompt: '',
  userMessage: 'hello',
  ...over,
});

describe('agent CLI snippets', () => {
  it('configures OpenClaw against the base URL and model on screen', () => {
    const code = openclawSnippet(params());
    expect(code).toContain('"baseUrl":"https://app.manifest.build/v1"');
    expect(code).toContain('"apiKey":"mnfst_test"');
    expect(code).toContain('manifest/auto');
  });

  it('writes a Hermes config carrying the same values', () => {
    const code = hermesSnippet(params());
    expect(code).toContain('base_url: https://app.manifest.build/v1');
    expect(code).toContain('api_key: mnfst_test');
    expect(code).toContain('default: auto');
  });

  // The message goes inside single quotes in a shell command, so an apostrophe
  // in it would otherwise end the string and run the rest as shell.
  it('escapes an apostrophe in the message for the shell', () => {
    expect(hermesSnippet(params({ userMessage: "it's fine" }))).toContain(
      "hermes chat -q 'it'\\''s fine'",
    );
  });

  it.each([
    ['openclaw', openclawSnippet],
    ['hermes', hermesSnippet],
  ])('shows a placeholder key in the %s snippet when none is set', (_name, snippet) => {
    expect(snippet(params({ apiKey: '' }))).toContain('mnfst_YOUR_KEY');
  });
});

describe('SDK snippets', () => {
  it('builds the TypeScript OpenAI client', () => {
    const code = openaiSdkSnippet(params({ systemPrompt: 'be terse' }), 'typescript');
    expect(code).toContain('import OpenAI from "openai";');
    expect(code).toContain('baseURL: "https://app.manifest.build/v1"');
    expect(code).toContain('"role": "system"');
  });

  it('builds the Python OpenAI client', () => {
    const code = openaiSdkSnippet(params(), 'python');
    expect(code).toContain('from openai import OpenAI');
    expect(code).toContain('base_url="https://app.manifest.build/v1"');
  });

  it('builds the Vercel AI SDK call, with the system prompt only when set', () => {
    expect(vercelSnippet(params())).not.toContain('system:');
    const code = vercelSnippet(params({ systemPrompt: 'be terse' }));
    expect(code).toContain('import { generateText } from "ai";');
    expect(code).toContain('system: "be terse"');
    expect(code).toContain('model: manifest("auto")');
  });

  it.each(['typescript', 'python'] as const)('builds the %s LangChain call', (lang) => {
    const code = langchainSnippet(params(), lang);
    expect(code).toContain(lang === 'typescript' ? '@langchain/openai' : 'langchain_openai');
    expect(code).toContain('app.manifest.build/v1');
  });

  it.each(['typescript', 'python'] as const)('builds the %s Responses call', (lang) => {
    expect(openaiResponsesSnippet(params(), lang)).not.toContain('instructions');
    const code = openaiResponsesSnippet(params({ systemPrompt: 'be terse' }), lang);
    expect(code).toContain('responses.create');
    expect(code).toContain('be terse');
  });

  // Anthropic's base URL carries no /v1 suffix — the SDK appends the whole path.
  it.each(['typescript', 'python'] as const)('builds the %s Anthropic call', (lang) => {
    const code = anthropicSdkSnippet(params({ baseUrl: 'https://api.anthropic.com' }), lang);
    expect(code).toContain('https://api.anthropic.com"');
    expect(code).toContain('1024');
    expect(code).not.toContain('system');
  });

  it('honours an explicit token cap in the Anthropic snippet', () => {
    expect(anthropicSdkSnippet(params({ maxTokens: 64 }), 'python')).toContain('max_tokens=64');
  });

  it.each([
    ['responses', openaiResponsesSnippet],
    ['anthropic', anthropicSdkSnippet],
  ])('shows a generic placeholder key in the %s snippet', (_name, snippet) => {
    for (const lang of ['typescript', 'python'] as const) {
      expect(snippet(params({ apiKey: '' }), lang)).toContain('YOUR_API_KEY');
    }
  });

  it.each([
    ['openai', openaiSdkSnippet],
    ['langchain', langchainSnippet],
  ])('shows the Manifest placeholder key in the %s snippet', (_name, snippet) => {
    for (const lang of ['typescript', 'python'] as const) {
      expect(snippet(params({ apiKey: '' }), lang)).toContain('mnfst_YOUR_KEY');
    }
  });

  it('omits the system prompt from every SDK snippet when there is none', () => {
    for (const lang of ['typescript', 'python'] as const) {
      expect(openaiResponsesSnippet(params(), lang)).not.toContain('instructions');
      expect(anthropicSdkSnippet(params(), lang)).not.toContain('system');
    }
    expect(vercelSnippet(params())).not.toContain('system:');
  });
});

describe('cURL and fetch snippets', () => {
  it('mirrors the request the form would send', () => {
    const code = curlSnippet(params({ systemPrompt: 'be terse' }), openaiChat);
    expect(code).toContain('curl -sS -X POST https://app.manifest.build/v1/chat/completions');
    expect(code).toContain('-H "Authorization: Bearer mnfst_test"');
    expect(code).toContain('"role": "system"');
  });

  // Anthropic authenticates with a named header and needs its version headers.
  it("uses the format's own auth scheme and default headers", () => {
    const code = curlSnippet(params({ baseUrl: 'https://api.anthropic.com' }), anthropicMessages);
    expect(code).toContain('-H "x-api-key: mnfst_test"');
    expect(code).toContain('-H "anthropic-version: 2023-06-01"');
    expect(code).not.toContain('Authorization');
  });

  // The body is wrapped in single quotes; an apostrophe in the prompt would
  // otherwise terminate it and hand the rest of the JSON to the shell.
  it('escapes an apostrophe in the body', () => {
    const code = curlSnippet(params({ userMessage: "it's fine" }), openaiChat);
    expect(code).toContain("it'\\''s fine");
  });

  it('renders the same call as a fetch', () => {
    const code = rawSnippet(params(), openaiResponses);
    expect(code).toContain('fetch("https://app.manifest.build/v1/responses"');
    expect(code).toContain('"Authorization": "Bearer mnfst_test"');
    expect(code).toContain('JSON.stringify(');
  });

  it('carries the format default headers into the fetch snippet', () => {
    expect(rawSnippet(params(), anthropicMessages)).toContain('"anthropic-version": "2023-06-01"');
  });

  it.each([
    ['curl', curlSnippet],
    ['fetch', rawSnippet],
  ])('falls back to a placeholder key in the %s snippet', (_name, snippet) => {
    expect(snippet(params({ apiKey: '' }), openaiChat)).toContain('YOUR_API_KEY');
  });

  // A format that needs no credential must not grow an empty auth header.
  it('emits no auth header for a format that authenticates with none', () => {
    const noAuth = { ...openaiChat, auth: { kind: 'none' } as const };
    expect(curlSnippet(params(), noAuth)).not.toContain('Authorization');
    expect(rawSnippet(params(), noAuth)).not.toContain('Authorization');
  });
});
