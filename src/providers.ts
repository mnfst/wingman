// Provider presets for the Base URL field. Each preset maps a well-known LLM
// provider to the base URL + wire format Wingman should speak, so a user can
// send straight to OpenAI / Anthropic / Mistral / … without hunting for the
// endpoint or figuring out the request shape.
//
// Base URLs follow Wingman's convention: they do NOT include the version/path
// suffix — the selected `ApiFormat` appends it (`/v1/chat/completions` for
// OpenAI-compatible, `/v1/messages` for Anthropic). So every preset here is a
// provider whose endpoint is exactly `{baseUrl}/v1/chat/completions` (Bearer)
// or `{baseUrl}/v1/messages` (x-api-key). Providers needing a different wire
// path/format (Google Gemini's native generateContent, Z.ai's /api/paas/v4,
// GitHub Copilot, Pioneer's X-API-Key, local runtimes, …) are intentionally
// left out until Wingman gains those formats.
//
// Sourced from the Manifest router catalog: packages/shared `SHARED_PROVIDERS`
// + packages/backend `PROVIDER_ENDPOINTS`.

import type { ApiFormatId } from './formats';

export interface Provider {
  /** Stable id, persisted under `wingman:provider`. */
  id: string;
  /** Display name shown in the dropdown and pill. */
  name: string;
  /**
   * Base URL Wingman points at. Empty string marks the "Custom" preset: the
   * user types their own host (a Manifest gateway or any OpenAI-compatible
   * endpoint) and the Base URL field stays fully free-text.
   */
  baseUrl: string;
  /** Small label under the name (the host, or a hint for Custom). */
  baseUrlLabel: string;
  /** Wire format to switch to when this preset is picked. */
  formatId: ApiFormatId;
  /** Provider logo, served from /public. */
  icon: string;
  /** One-line example-models hint. */
  subtitle: string;
  /** API-key input placeholder — hints the provider's key prefix. */
  apiKeyPlaceholder: string;
  /**
   * Model pre-filled when the preset is picked. Unlike Manifest's `auto`
   * router, provider APIs need a concrete model id, so each preset ships a
   * sensible default. Best-effort — the Model field stays editable.
   */
  defaultModel: string;
}

/** The default preset: today's behaviour (free-text base URL → Manifest). */
export const DEFAULT_PROVIDER_ID = 'custom';

/**
 * Canonical Manifest Cloud gateway. Pre-filled as the default Base URL on the
 * hosted app so the primary use case — testing a Manifest gateway — works
 * without typing (or mistyping) the host. Note it's `app.manifest.build`, not
 * `api.manifest.build`: the latter has no TLS cert. This host speaks the
 * OpenAI/Anthropic-compatible wire format (`{host}/v1/chat/completions`,
 * `{host}/v1/messages`). Source: manifest.build llms.txt.
 */
export const MANIFEST_BASE_URL = 'https://app.manifest.build';

export const PROVIDERS: readonly Provider[] = [
  {
    id: 'custom',
    name: 'Custom / Manifest',
    baseUrl: '',
    baseUrlLabel: 'Your Manifest gateway or any base URL',
    formatId: 'openai-chat',
    icon: '/icons/providers/manifest.svg',
    subtitle: 'Point at a Manifest gateway or any OpenAI-compatible endpoint',
    apiKeyPlaceholder: 'mnfst_...',
    defaultModel: 'auto',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    baseUrlLabel: 'api.openai.com',
    formatId: 'openai-chat',
    icon: '/icons/providers/openai.svg',
    subtitle: 'GPT-4o, GPT-4.1, o3, o4-mini',
    apiKeyPlaceholder: 'sk-...',
    defaultModel: 'gpt-4o',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    baseUrlLabel: 'api.anthropic.com',
    formatId: 'anthropic-messages',
    icon: '/icons/providers/anthropic.svg',
    subtitle: 'Claude Opus, Sonnet, Haiku',
    apiKeyPlaceholder: 'sk-ant-...',
    defaultModel: 'claude-sonnet-4-5',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai',
    baseUrlLabel: 'api.mistral.ai',
    formatId: 'openai-chat',
    icon: '/icons/providers/mistral.svg',
    subtitle: 'Mistral Large, Codestral, Pixtral',
    apiKeyPlaceholder: 'your Mistral API key',
    defaultModel: 'mistral-large-latest',
  },
  {
    id: 'cohere',
    name: 'Cohere',
    baseUrl: 'https://api.cohere.ai/compatibility',
    baseUrlLabel: 'api.cohere.ai/compatibility',
    formatId: 'openai-chat',
    icon: '/icons/providers/cohere.svg',
    subtitle: 'Command A, Command R+',
    apiKeyPlaceholder: 'your Cohere API key',
    defaultModel: 'command-a-plus-05-2026',
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai',
    baseUrlLabel: 'api.groq.com/openai',
    formatId: 'openai-chat',
    icon: '/icons/providers/groq.svg',
    subtitle: 'Llama, Gemma, Mixtral',
    apiKeyPlaceholder: 'gsk_...',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    baseUrlLabel: 'api.deepseek.com',
    formatId: 'openai-chat',
    icon: '/icons/providers/deepseek.svg',
    subtitle: 'DeepSeek V3, DeepSeek R1',
    apiKeyPlaceholder: 'sk-...',
    defaultModel: 'deepseek-chat',
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai',
    baseUrlLabel: 'api.x.ai',
    formatId: 'openai-chat',
    icon: '/icons/providers/xai.svg',
    subtitle: 'Grok 4, Grok 3',
    apiKeyPlaceholder: 'xai-...',
    defaultModel: 'grok-3',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api',
    baseUrlLabel: 'openrouter.ai/api',
    formatId: 'openai-chat',
    icon: '/icons/providers/openrouter.svg',
    subtitle: 'Hundreds of models behind one key',
    apiKeyPlaceholder: 'sk-or-...',
    defaultModel: 'openrouter/auto',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    baseUrl: 'https://router.huggingface.co',
    baseUrlLabel: 'router.huggingface.co',
    formatId: 'openai-chat',
    icon: '/icons/providers/huggingface.svg',
    subtitle: 'Open models, served by partner providers',
    apiKeyPlaceholder: 'hf_...',
    defaultModel: 'openai/gpt-oss-120b',
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference',
    baseUrlLabel: 'api.fireworks.ai/inference',
    formatId: 'openai-chat',
    icon: '/icons/providers/fireworks.svg',
    subtitle: 'Llama, DeepSeek, Qwen, Kimi',
    apiKeyPlaceholder: 'fw_...',
    defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai',
    baseUrlLabel: 'api.cerebras.ai',
    formatId: 'openai-chat',
    icon: '/icons/providers/cerebras.svg',
    subtitle: 'Llama, GPT-OSS',
    apiKeyPlaceholder: 'csk-...',
    defaultModel: 'llama-3.3-70b',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com',
    baseUrlLabel: 'integrate.api.nvidia.com',
    formatId: 'openai-chat',
    icon: '/icons/providers/nvidia.svg',
    subtitle: 'Nemotron, Llama, Mistral',
    apiKeyPlaceholder: 'nvapi-...',
    defaultModel: 'meta/llama-3.3-70b-instruct',
  },
  {
    id: 'qwen',
    name: 'Alibaba Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
    baseUrlLabel: 'dashscope.aliyuncs.com/compatible-mode',
    formatId: 'openai-chat',
    icon: '/icons/providers/qwen.svg',
    subtitle: 'Qwen Max, Plus, Turbo',
    apiKeyPlaceholder: 'sk-...',
    defaultModel: 'qwen-max',
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    baseUrl: 'https://api.moonshot.ai',
    baseUrlLabel: 'api.moonshot.ai',
    formatId: 'openai-chat',
    icon: '/icons/providers/moonshot.svg',
    subtitle: 'Kimi K2, Moonshot v1',
    apiKeyPlaceholder: 'sk-...',
    defaultModel: 'kimi-latest',
  },
  {
    id: 'nous',
    name: 'Nous Research',
    baseUrl: 'https://inference-api.nousresearch.com',
    baseUrlLabel: 'inference-api.nousresearch.com',
    formatId: 'openai-chat',
    icon: '/icons/providers/nousresearch.svg',
    subtitle: 'Hermes 4',
    apiKeyPlaceholder: 'your Nous API key',
    defaultModel: 'Hermes-4-70B',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.io',
    baseUrlLabel: 'api.minimax.io',
    formatId: 'openai-chat',
    icon: '/icons/providers/minimax.svg',
    subtitle: 'MiniMax M2, Text-01',
    apiKeyPlaceholder: 'your MiniMax API key',
    defaultModel: 'MiniMax-Text-01',
  },
  {
    id: 'ollama-cloud',
    name: 'Ollama Cloud',
    baseUrl: 'https://ollama.com',
    baseUrlLabel: 'ollama.com',
    formatId: 'openai-chat',
    icon: '/icons/providers/ollama.svg',
    subtitle: 'Llama, Qwen, Gemma, DeepSeek',
    apiKeyPlaceholder: 'your Ollama key',
    defaultModel: 'gpt-oss:120b',
  },
];

export const PROVIDER_BY_ID: Record<string, Provider> = Object.fromEntries(
  PROVIDERS.map((p) => [p.id, p]),
);

/** The Custom/Manifest preset — the only one whose base URL is user-editable. */
export const CUSTOM_PROVIDER: Provider = PROVIDER_BY_ID[DEFAULT_PROVIDER_ID]!;
