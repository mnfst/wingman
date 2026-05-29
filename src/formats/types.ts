// The API format is the wire protocol Wingman speaks to a provider: the
// endpoint path, how the key is attached, the request body shape, how to read
// the response, and how to parse a streamed (SSE) response. It's orthogonal to
// the agent/SDK `Profile` (which only contributes fingerprint headers, a
// system-prompt default, and a code snippet). One format → every provider that
// speaks it (OpenAI-compatible, Anthropic, …).

export type ApiFormatId = 'openai-chat' | 'openai-responses' | 'anthropic-messages';

/** How the API key is attached to the request. */
export type AuthScheme =
  | { kind: 'bearer' } // Authorization: Bearer <key>
  | { kind: 'header'; name: string } // e.g. x-api-key: <key>
  | { kind: 'none' };

/** Canonical request parameters, shared by every format and profile. */
export interface RequestParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
}

export interface Usage {
  in?: number;
  out?: number;
  total?: number;
}

/** One step of a streamed response, produced by a StreamParser. */
export interface StreamDelta {
  /** Incremental assistant text to append to the live output. */
  text?: string;
  /** A complete response object (usage/model/text live here once known). */
  final?: unknown;
  /** The stream has ended. */
  done?: boolean;
}

/**
 * Stateful per-request SSE interpreter. Stateful (not a pure function) because
 * some formats — Anthropic especially — split the final usage across several
 * events (input tokens in `message_start`, output tokens in `message_delta`),
 * so the parser accumulates and emits a single assembled `final` at the end.
 */
export interface StreamParser {
  push(evt: { event?: string; data: string }): StreamDelta;
}

export interface ApiFormat {
  id: ApiFormatId;
  label: string;
  blurb: string;
  /** Provider icon shown in the format dropdown. */
  icon: string;
  docsUrl: string;
  /** Endpoint path appended to the base URL, e.g. `/v1/chat/completions`. */
  path: string;
  /** Hint shown in the Base URL field for this format. */
  placeholderBaseUrl?: string;
  auth: AuthScheme;
  /** Headers every request in this format needs (e.g. anthropic-version). */
  defaultHeaders?: Record<string, string>;
  /** When set, the connection bar probes this path for a health badge. */
  healthPath?: string;
  /** True when the format mandates max_tokens (Anthropic). Drives UI hints. */
  requiresMaxTokens?: boolean;
  buildBody(params: RequestParams, opts: { stream: boolean }): Record<string, unknown>;
  extractText(json: unknown): string | null;
  extractUsage(json: unknown): Usage | null;
  extractModel(json: unknown): string | null;
  createStreamParser(): StreamParser;
}
