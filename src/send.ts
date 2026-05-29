import type { AuthScheme, StreamParser } from './formats/types';
import { readSse } from './services/sse';

export interface SendInput {
  url: string;
  apiKey: string;
  /** How to attach the key. Defaults to bearer (used by the SDK runners). */
  auth?: AuthScheme;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface SendResult {
  url: string;
  status: number;
  statusText: string;
  ok: boolean;
  durationMs: number;
  requestHeaders: Record<string, string>;
  requestBody: string;
  responseHeaders: Record<string, string>;
  responseBody: string;
  responseJson: unknown | null;
  error?: string;
  errorKind?: 'network' | 'cors' | 'mixed-content' | 'aborted' | 'unknown';
  /** True when the request was sent with stream:true and read as SSE. */
  isStream?: boolean;
  /** Assistant text assembled from the stream (streamed requests only). */
  streamedText?: string;
  /** Time to first token, ms (streamed requests only). */
  ttftMs?: number;
}

export interface StreamOptions {
  createParser: () => StreamParser;
  onDelta: (text: string) => void;
}

const FORBIDDEN_HEADER_PREFIXES = ['proxy-', 'sec-'];
const FORBIDDEN_HEADERS = new Set([
  'accept-charset',
  'accept-encoding',
  'access-control-request-headers',
  'access-control-request-method',
  'connection',
  'content-length',
  'cookie',
  'cookie2',
  'date',
  'dnt',
  'expect',
  'feature-policy',
  'host',
  'keep-alive',
  'origin',
  'referer',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'user-agent',
  'via',
]);

/**
 * Browsers reject some headers (e.g. User-Agent, Sec-*, Host) when set via fetch.
 * Filter them out and surface what was dropped so the UI can warn the user.
 */
export function partitionHeaders(headers: Record<string, string>): {
  allowed: Record<string, string>;
  blocked: string[];
} {
  const allowed: Record<string, string> = {};
  const blocked: string[] = [];
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    const isForbidden =
      FORBIDDEN_HEADERS.has(lower) ||
      FORBIDDEN_HEADER_PREFIXES.some((prefix) => lower.startsWith(prefix));
    if (isForbidden) {
      blocked.push(key);
    } else {
      allowed[key] = value;
    }
  }
  return { allowed, blocked };
}

/** Final request headers: Content-Type + caller headers + key per auth scheme. */
function buildHeaders(input: SendInput, extra?: Record<string, string>): Record<string, string> {
  const { allowed } = partitionHeaders(input.headers);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...allowed,
    ...extra,
  };
  const auth = input.auth ?? { kind: 'bearer' };
  if (input.apiKey) {
    if (auth.kind === 'bearer') headers.Authorization = `Bearer ${input.apiKey}`;
    else if (auth.kind === 'header') headers[auth.name] = input.apiKey;
  }
  return headers;
}

function collectHeaders(response: Response): Record<string, string> {
  const out: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function sendRequest(input: SendInput): Promise<SendResult> {
  const finalHeaders = buildHeaders(input);
  const requestBody = JSON.stringify(input.body, null, 2);

  const start = performance.now();
  try {
    const response = await fetch(input.url, {
      method: 'POST',
      headers: finalHeaders,
      body: requestBody,
    });
    const text = await response.text();
    return {
      url: input.url,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      durationMs: performance.now() - start,
      requestHeaders: finalHeaders,
      requestBody,
      responseHeaders: collectHeaders(response),
      responseBody: text,
      responseJson: tryParseJson(text),
    };
  } catch (err) {
    return errorResult(input, finalHeaders, requestBody, err, performance.now() - start);
  }
}

/**
 * Send with stream:true and read the response as SSE, pushing each event
 * through the format's StreamParser. Non-OK responses (and bodyless ones) fall
 * back to a buffered read — provider error payloads are JSON, not a stream.
 */
export async function sendRequestStreaming(
  input: SendInput,
  opts: StreamOptions,
): Promise<SendResult> {
  const finalHeaders = buildHeaders(input, { Accept: 'text/event-stream' });
  const requestBody = JSON.stringify(input.body, null, 2);
  const start = performance.now();

  let response: Response;
  try {
    response = await fetch(input.url, { method: 'POST', headers: finalHeaders, body: requestBody });
  } catch (err) {
    return errorResult(input, finalHeaders, requestBody, err, performance.now() - start);
  }

  const base = {
    url: input.url,
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    requestHeaders: finalHeaders,
    requestBody,
    responseHeaders: collectHeaders(response),
    isStream: true as const,
  };

  if (!response.ok || !response.body) {
    const text = await response.text();
    return {
      ...base,
      durationMs: performance.now() - start,
      responseBody: text,
      responseJson: tryParseJson(text),
    };
  }

  const parser = opts.createParser();
  const rawChunks: string[] = [];
  let assembled = '';
  let finalJson: unknown | null = null;
  let ttftMs: number | undefined;
  let error: string | undefined;

  try {
    for await (const evt of readSse(response.body)) {
      rawChunks.push(evt.event ? `event: ${evt.event}\ndata: ${evt.data}` : `data: ${evt.data}`);
      const delta = parser.push(evt);
      if (delta.text) {
        if (ttftMs === undefined) ttftMs = performance.now() - start;
        assembled += delta.text;
        opts.onDelta(delta.text);
      }
      if (delta.final !== undefined && delta.final !== null) finalJson = delta.final;
      if (delta.done) break;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return {
    ...base,
    durationMs: performance.now() - start,
    responseBody: rawChunks.join('\n\n'),
    responseJson: finalJson,
    streamedText: assembled,
    ttftMs,
    error,
  };
}

function errorResult(
  input: SendInput,
  finalHeaders: Record<string, string>,
  requestBody: string,
  err: unknown,
  durationMs: number,
): SendResult {
  return {
    url: input.url,
    status: 0,
    statusText: 'Network error',
    ok: false,
    durationMs,
    requestHeaders: finalHeaders,
    requestBody,
    responseHeaders: {},
    responseBody: '',
    responseJson: null,
    error: err instanceof Error ? err.message : String(err),
    errorKind: classifyError(err, input.url),
  };
}

function classifyError(err: unknown, url: string): SendResult['errorKind'] {
  if (err instanceof DOMException && err.name === 'AbortError') return 'aborted';
  const msg = err instanceof Error ? err.message : String(err);
  // Mixed content: page is HTTPS but the target URL is HTTP
  try {
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      const target = new URL(url);
      if (target.protocol === 'http:') return 'mixed-content';
    }
  } catch {
    /* malformed URL handled below */
  }
  // `TypeError: Failed to fetch` covers DNS, connection refused, AND CORS
  // preflight rejection. We can't distinguish them from JS, so default to
  // "network" — the UI explains both possibilities.
  if (/fetch/i.test(msg) || err instanceof TypeError) return 'network';
  return 'unknown';
}
