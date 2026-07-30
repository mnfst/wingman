// Model catalog lookup: GET {base}/v1/models, the OpenAI-compatible listing
// endpoint that Manifest, OpenAI, Groq, Mistral — and, same shape, Anthropic —
// all expose. Best-effort: any failure (no CORS, 401, not implemented) simply
// yields an empty list and the model field stays free-text.
import type { ApiFormat } from '../formats';

function modelIdsFrom(json: unknown): string[] {
  const data =
    json && typeof json === 'object' && Array.isArray((json as { data?: unknown }).data)
      ? ((json as { data: unknown[] }).data as unknown[])
      : Array.isArray(json)
        ? (json as unknown[])
        : [];
  const ids: string[] = [];
  for (const entry of data) {
    if (typeof entry === 'string') ids.push(entry);
    else if (entry && typeof entry === 'object') {
      const id = (entry as { id?: unknown }).id;
      if (typeof id === 'string' && id) ids.push(id);
    }
  }
  // Dedupe, keep server order — routers put their preferred alias (auto) first.
  return [...new Set(ids)];
}

export async function fetchModels(
  baseUrl: string,
  apiKey: string,
  format: ApiFormat,
  signal: AbortSignal,
): Promise<string[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/models`;
  // Reuse the format's auth scheme + default headers (anthropic-version and
  // the direct-browser-access opt-in are required on Anthropic's /v1/models
  // exactly as on /v1/messages).
  const headers: Record<string, string> = { ...(format.defaultHeaders ?? {}) };
  if (format.auth.kind === 'bearer' && apiKey) headers.Authorization = `Bearer ${apiKey}`;
  else if (format.auth.kind === 'header' && apiKey) headers[format.auth.name] = apiKey;
  try {
    const res = await fetch(url, { headers, signal });
    if (!res.ok) return [];
    return modelIdsFrom(await res.json());
  } catch {
    return [];
  }
}
