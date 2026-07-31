// Snippets for the SDK clients. Each one declares the same four things the
// form holds (base URL, key, model, messages) plus any header the user added
// on top of the SDK's own fingerprint, so the panel is a faithful rendering of
// the request and can be read back into the form.
import {
  extraHeaders,
  GENERIC_KEY_PLACEHOLDER,
  indentLines,
  jsonBody,
  keyExpr,
  messages,
  needsOsImport,
  type SnippetContext,
} from './context';

/** `defaultHeaders: { … },` for a JS object literal, or nothing. */
function tsHeaders(ctx: SnippetContext, name = 'defaultHeaders', indent = 2): string {
  const extra = extraHeaders(ctx);
  if (Object.keys(extra).length === 0) return '';
  const pad = ' '.repeat(indent);
  return `\n${pad}${name}: ${indentLines(jsonBody(extra, 2), indent)},`;
}

/** `default_headers={…},` for a Python keyword argument, or nothing. */
function pyHeaders(ctx: SnippetContext, name = 'default_headers', indent = 4): string {
  const extra = extraHeaders(ctx);
  if (Object.keys(extra).length === 0) return '';
  const pad = ' '.repeat(indent);
  return `\n${pad}${name}=${indentLines(jsonBody(extra, 4), indent)},`;
}

/** `import os`, only when the key is a `os.environ[…]` reference. */
function osImport(ctx: SnippetContext): string {
  return needsOsImport(ctx) ? 'import os\n' : '';
}

export function openaiSdkSnippet(ctx: SnippetContext): string {
  const p = ctx.params;
  if (ctx.lang === 'python') {
    return `${osImport(ctx)}from openai import OpenAI

client = OpenAI(
    base_url="${p.baseUrl}/v1",
    api_key=${keyExpr(ctx)},${pyHeaders(ctx)}
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
  apiKey: ${keyExpr(ctx)},${tsHeaders(ctx)}
});

const response = await client.chat.completions.create({
  model: "${p.model}",
  messages: ${indentLines(jsonBody(messages(p), 2), 2)},
});
console.log(response.choices[0].message.content);`;
}

export function vercelSnippet(ctx: SnippetContext): string {
  const p = ctx.params;
  return `import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const manifest = createOpenAI({
  baseURL: "${p.baseUrl}/v1",
  apiKey: ${keyExpr(ctx)},${tsHeaders(ctx, 'headers')}
});

const { text } = await generateText({
  model: manifest("${p.model}"),
  ${p.systemPrompt ? `system: ${JSON.stringify(p.systemPrompt)},\n  ` : ''}prompt: ${JSON.stringify(p.userMessage)},
});
console.log(text);`;
}

export function langchainSnippet(ctx: SnippetContext): string {
  const p = ctx.params;
  if (ctx.lang === 'typescript') {
    return `import { ChatOpenAI } from "@langchain/openai";

const llm = new ChatOpenAI({
  model: "${p.model}",
  apiKey: ${keyExpr(ctx)},
  configuration: { baseURL: "${p.baseUrl}/v1" },${tsHeaders(ctx)}
});

const response = await llm.invoke(${indentLines(jsonBody(messages(p), 2), 2)});
console.log(response.content);`;
  }
  return `${osImport(ctx)}from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    base_url="${p.baseUrl}/v1",
    api_key=${keyExpr(ctx)},
    model="${p.model}",${pyHeaders(ctx)}
)

response = llm.invoke(${indentLines(jsonBody(messages(p), 4), 4)})
print(response.content)`;
}

export function openaiResponsesSnippet(ctx: SnippetContext): string {
  const p = ctx.params;
  if (ctx.lang === 'python') {
    return `${osImport(ctx)}from openai import OpenAI

client = OpenAI(
    base_url="${p.baseUrl}/v1",
    api_key=${keyExpr(ctx, GENERIC_KEY_PLACEHOLDER)},${pyHeaders(ctx)}
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
  apiKey: ${keyExpr(ctx, GENERIC_KEY_PLACEHOLDER)},${tsHeaders(ctx)}
});

const response = await client.responses.create({
  model: "${p.model}",
  ${p.systemPrompt.trim() ? `instructions: ${JSON.stringify(p.systemPrompt)},\n  ` : ''}input: ${JSON.stringify(p.userMessage)},
});
console.log(response.output_text);`;
}

export function anthropicSdkSnippet(ctx: SnippetContext): string {
  const p = ctx.params;
  const maxTokens = p.maxTokens ?? 1024;
  if (ctx.lang === 'python') {
    return `${osImport(ctx)}import anthropic

client = anthropic.Anthropic(
    base_url="${p.baseUrl}",
    api_key=${keyExpr(ctx, GENERIC_KEY_PLACEHOLDER)},${pyHeaders(ctx)}
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
  apiKey: ${keyExpr(ctx, GENERIC_KEY_PLACEHOLDER)},${tsHeaders(ctx)}
});

const message = await client.messages.create({
  model: "${p.model}",
  max_tokens: ${maxTokens},
  ${p.systemPrompt.trim() ? `system: ${JSON.stringify(p.systemPrompt)},\n  ` : ''}messages: [{ role: "user", content: ${JSON.stringify(p.userMessage)} }],
});
console.log(message.content[0].type === "text" ? message.content[0].text : "");`;
}
