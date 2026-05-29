// Code-snippet builders for the SDK preview panel. Kept separate from the
// profile catalog so profiles.ts stays scannable and under the file-size limit.
// Snippets are illustrative (non-streaming) — they mirror the form, they don't
// drive the request (the format does).
import type { ApiFormat, RequestParams } from './formats';
import type { ProfileLang } from './profiles';

const MANIFEST_KEY = 'mnfst_YOUR_KEY';
const GENERIC_KEY = 'YOUR_API_KEY';

function jsonBody(body: unknown, indent = 2): string {
  return JSON.stringify(body, null, indent);
}

function messages(p: RequestParams) {
  const list: Array<{ role: string; content: string }> = [];
  if (p.systemPrompt.trim()) list.push({ role: 'system', content: p.systemPrompt });
  list.push({ role: 'user', content: p.userMessage });
  return list;
}

function indentLines(text: string, spaces: number): string {
  return text.replace(/\n/g, '\n' + ' '.repeat(spaces));
}

// ── Manifest agent / OpenAI-chat profiles ────────────────────────────────

export function openclawSnippet(p: RequestParams): string {
  return `# OpenClaw routes through its built-in OpenAI-compatible client.
# Configure once with the CLI:
openclaw config set models.providers.manifest '{"baseUrl":"${p.baseUrl}/v1","api":"openai-completions","apiKey":"${p.apiKey || MANIFEST_KEY}","models":[{"id":"${p.model}","name":"Manifest Auto"}]}'
openclaw config set agents.defaults.model.primary manifest/${p.model}
openclaw gateway restart`;
}

export function hermesSnippet(p: RequestParams): string {
  return `# Hermes reads its provider from ~/.hermes/config.yaml:
cat <<EOF > ~/.hermes/config.yaml
model:
  provider: custom
  base_url: ${p.baseUrl}/v1
  api_key: ${p.apiKey || MANIFEST_KEY}
  default: ${p.model}
EOF
hermes chat -q '${p.userMessage.replace(/'/g, "'\\''")}'`;
}

export function openaiSdkSnippet(p: RequestParams, lang: ProfileLang): string {
  if (lang === 'python') {
    return `from openai import OpenAI

client = OpenAI(
    base_url="${p.baseUrl}/v1",
    api_key="${p.apiKey || MANIFEST_KEY}",
)

response = client.chat.completions.create(
    model="${p.model}",
    messages=${indentLines(jsonBody(messages(p), 4), 4)},
)
print(response.choices[0].message.content)`;
  }
  return `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${p.baseUrl}/v1",
  apiKey: "${p.apiKey || MANIFEST_KEY}",
});

const response = await client.chat.completions.create({
  model: "${p.model}",
  messages: ${indentLines(jsonBody(messages(p), 2), 2)},
});
console.log(response.choices[0].message.content);`;
}

export function vercelSnippet(p: RequestParams): string {
  return `import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const manifest = createOpenAI({
  baseURL: "${p.baseUrl}/v1",
  apiKey: "${p.apiKey || MANIFEST_KEY}",
});

const { text } = await generateText({
  model: manifest("${p.model}"),
  ${p.systemPrompt ? `system: ${JSON.stringify(p.systemPrompt)},\n  ` : ''}prompt: ${JSON.stringify(p.userMessage)},
});
console.log(text);`;
}

export function langchainSnippet(p: RequestParams, lang: ProfileLang): string {
  if (lang === 'typescript') {
    return `import { ChatOpenAI } from "@langchain/openai";

const llm = new ChatOpenAI({
  model: "${p.model}",
  apiKey: "${p.apiKey || MANIFEST_KEY}",
  configuration: { baseURL: "${p.baseUrl}/v1" },
});

const response = await llm.invoke(${indentLines(jsonBody(messages(p), 2), 2)});
console.log(response.content);`;
  }
  return `from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    base_url="${p.baseUrl}/v1",
    api_key="${p.apiKey || MANIFEST_KEY}",
    model="${p.model}",
)

response = llm.invoke(${indentLines(jsonBody(messages(p), 4), 4)})
print(response.content)`;
}

// ── Format-native SDK profiles ────────────────────────────────────────────

export function openaiResponsesSnippet(p: RequestParams, lang: ProfileLang): string {
  if (lang === 'python') {
    return `from openai import OpenAI

client = OpenAI(
    base_url="${p.baseUrl}/v1",
    api_key="${p.apiKey || GENERIC_KEY}",
)

response = client.responses.create(
    model="${p.model}",
    ${p.systemPrompt.trim() ? `instructions=${JSON.stringify(p.systemPrompt)},\n    ` : ''}input=${JSON.stringify(p.userMessage)},
)
print(response.output_text)`;
  }
  return `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${p.baseUrl}/v1",
  apiKey: "${p.apiKey || GENERIC_KEY}",
});

const response = await client.responses.create({
  model: "${p.model}",
  ${p.systemPrompt.trim() ? `instructions: ${JSON.stringify(p.systemPrompt)},\n  ` : ''}input: ${JSON.stringify(p.userMessage)},
});
console.log(response.output_text);`;
}

export function anthropicSdkSnippet(p: RequestParams, lang: ProfileLang): string {
  const maxTokens = p.maxTokens ?? 1024;
  if (lang === 'python') {
    return `import anthropic

client = anthropic.Anthropic(
    base_url="${p.baseUrl}",
    api_key="${p.apiKey || GENERIC_KEY}",
)

message = client.messages.create(
    model="${p.model}",
    max_tokens=${maxTokens},
    ${p.systemPrompt.trim() ? `system=${JSON.stringify(p.systemPrompt)},\n    ` : ''}messages=[{"role": "user", "content": ${JSON.stringify(p.userMessage)}}],
)
print(message.content[0].text)`;
  }
  return `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  baseURL: "${p.baseUrl}",
  apiKey: "${p.apiKey || GENERIC_KEY}",
});

const message = await client.messages.create({
  model: "${p.model}",
  max_tokens: ${maxTokens},
  ${p.systemPrompt.trim() ? `system: ${JSON.stringify(p.systemPrompt)},\n  ` : ''}messages: [{ role: "user", content: ${JSON.stringify(p.userMessage)} }],
});
console.log(message.content[0].type === "text" ? message.content[0].text : "");`;
}

// ── Generic, format-aware cURL + fetch ────────────────────────────────────

function authHeaderPair(format: ApiFormat, apiKey: string): [string, string] | null {
  const key = apiKey || GENERIC_KEY;
  if (format.auth.kind === 'bearer') return ['Authorization', `Bearer ${key}`];
  if (format.auth.kind === 'header') return [format.auth.name, key];
  return null;
}

export function curlSnippet(p: RequestParams, format: ApiFormat): string {
  const url = `${p.baseUrl}${format.path}`;
  const headerLines = ['-H "Content-Type: application/json"'];
  const auth = authHeaderPair(format, p.apiKey);
  if (auth) headerLines.unshift(`-H "${auth[0]}: ${auth[1]}"`);
  for (const [k, v] of Object.entries(format.defaultHeaders ?? {})) {
    headerLines.push(`-H "${k}: ${v}"`);
  }
  const body = jsonBody(format.buildBody(p, { stream: false }), 2).replace(/'/g, "'\\''");
  return `curl -sS -X POST ${url} \\
  ${headerLines.join(' \\\n  ')} \\
  -d '${body}'`;
}

export function rawSnippet(p: RequestParams, format: ApiFormat): string {
  const url = `${p.baseUrl}${format.path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = authHeaderPair(format, p.apiKey);
  if (auth) headers[auth[0]] = auth[1];
  Object.assign(headers, format.defaultHeaders ?? {});
  return `# Plain fetch — no User-Agent override.
fetch("${url}", {
  method: "POST",
  headers: ${indentLines(jsonBody(headers, 2), 2)},
  body: JSON.stringify(${indentLines(jsonBody(format.buildBody(p, { stream: false }), 2), 2)}),
});`;
}
