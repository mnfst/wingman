// Persistence + boot-time resolution helpers for App state. Pure functions —
// no signals here — so App/appState stay focused on wiring.
import type { HeaderEntry } from '../components/HeaderEditor.jsx';
import { PROFILES, profilesForFormat } from '../profiles';
import { FORMAT_BY_ID, DEFAULT_FORMAT_ID, type ApiFormatId } from '../formats';
import { PROVIDERS, PROVIDER_BY_ID, DEFAULT_PROVIDER_ID, CUSTOM_PROVIDER } from '../providers';
import { defaultBaseUrl } from './baseUrl';

export const STORAGE = {
  baseUrl: 'wingman:baseUrl',
  apiKeys: 'wingman:apiKeys',
  model: 'wingman:model',
  profile: 'wingman:profile',
  format: 'wingman:format',
  stream: 'wingman:stream',
  provider: 'wingman:provider',
};

// The pre-per-provider slot: a single key shared by every provider. Read once
// on boot and folded into the map (see `readApiKeys`), then dropped.
const LEGACY_API_KEY = 'wingman:apiKey';

// API keys are stored in sessionStorage (cleared on tab close) instead of
// localStorage so contributors don't leave a long-lived `mnfst_*` token in
// disk-backed browser storage. Everything else (base URL, model, profile,
// system prompts, history) stays in localStorage since it's not sensitive.
const SENSITIVE_KEYS = new Set<string>([STORAGE.apiKeys, LEGACY_API_KEY]);

function storageFor(key: string): Storage {
  return SENSITIVE_KEYS.has(key) ? sessionStorage : localStorage;
}

export function readStorage(key: string, fallback: string): string {
  try {
    const value = storageFor(key).getItem(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    storageFor(key).setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function removeStorage(key: string): void {
  try {
    storageFor(key).removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readQueryParam(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URL(window.location.href).searchParams.get(key);
  } catch {
    return null;
  }
}

export function entriesFromRecord(record: Record<string, string>): HeaderEntry[] {
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}

export function recordFromEntries(entries: HeaderEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of entries) {
    if (key.trim()) out[key.trim()] = value;
  }
  return out;
}

// An external embed (?baseUrl=…, e.g. the Manifest dashboard drawer) is always
// the Custom/Manifest preset. Otherwise restore the last-picked preset.
export function resolveInitialProvider(baseUrlParam: string | null): string {
  if (baseUrlParam) return DEFAULT_PROVIDER_ID;
  const stored = readStorage(STORAGE.provider, DEFAULT_PROVIDER_ID);
  return PROVIDER_BY_ID[stored] ? stored : DEFAULT_PROVIDER_ID;
}

export function resolveInitialFormat(providerId: string): ApiFormatId {
  const param = readQueryParam('format');
  if (param && FORMAT_BY_ID[param]) return param as ApiFormatId;
  // A concrete provider preset dictates its own wire format.
  const preset = PROVIDER_BY_ID[providerId];
  if (preset && preset.id !== DEFAULT_PROVIDER_ID) return preset.formatId;
  const stored = readStorage(STORAGE.format, DEFAULT_FORMAT_ID);
  return FORMAT_BY_ID[stored] ? (stored as ApiFormatId) : DEFAULT_FORMAT_ID;
}

// Match a base URL back to a preset (used when restoring history) so the
// provider pill stays in sync; anything unrecognised is "Custom".
export function providerForBaseUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, '');
  const match = PROVIDERS.find((p) => p.baseUrl && p.baseUrl === trimmed);
  return match ? match.id : DEFAULT_PROVIDER_ID;
}

/** API keys keyed by provider id. Only non-empty keys are kept. */
export type ApiKeyMap = Record<string, string>;

export function parseApiKeyMap(raw: string): ApiKeyMap {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: ApiKeyMap = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value) out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

// Keys are held per provider rather than globally: each provider issues its own
// credential, so a single shared key meant switching preset silently carried an
// `sk-…` into an Anthropic `x-api-key` header (a guaranteed 401) with no way to
// get the previous key back short of re-pasting it.
export function readApiKeys(currentProviderId: string): ApiKeyMap {
  const map = parseApiKeyMap(readStorage(STORAGE.apiKeys, ''));
  // A session that predates the map still has the old shared key. Attribute it
  // to the provider that was selected when it was typed and drop the old slot.
  const legacy = readStorage(LEGACY_API_KEY, '');
  if (legacy) {
    removeStorage(LEGACY_API_KEY);
    if (!map[currentProviderId]) {
      map[currentProviderId] = legacy;
      writeStorage(STORAGE.apiKeys, JSON.stringify(map));
    }
  }
  return map;
}

export function resolveInitialProfile(formatId: ApiFormatId): string {
  const compatible = profilesForFormat(formatId);
  const stored = readStorage(STORAGE.profile, '');
  if (compatible.some((p) => p.id === stored)) return stored;
  // First-run default: the neutral Raw client — no fingerprint headers, no
  // giant captured system prompt — mirroring the "Custom / Manifest" provider
  // default. Impersonation is opt-in, not the landing state.
  const raw = compatible.find((p) => p.id === 'raw');
  return raw?.id ?? compatible[0]?.id ?? PROFILES[0]!.id;
}

export interface BootState {
  providerId: string;
  baseUrl: string;
  apiKeys: ApiKeyMap;
  formatId: ApiFormatId;
}

/**
 * Everything the app needs before the first render: the active provider, base
 * URL, key map, and wire format — resolved from query params (`?baseUrl=`,
 * `?apiKey=`, `?format=` — the Manifest dashboard embed), then storage, then
 * defaults. Query-param values are persisted so a reload keeps them.
 */
export function resolveBootState(): BootState {
  const baseUrlParam = readQueryParam('baseUrl');
  const apiKeyParam = readQueryParam('apiKey');
  const providerId = resolveInitialProvider(baseUrlParam);
  const provider = PROVIDER_BY_ID[providerId] ?? CUSTOM_PROVIDER;
  // For a concrete preset, the base URL comes from the catalog (the field is
  // only free-text in Custom mode, so it can't drift). Custom falls back to the
  // ?baseUrl= param, stored value, or the localhost dev guess.
  const baseUrl =
    baseUrlParam ??
    (provider.id !== DEFAULT_PROVIDER_ID
      ? provider.baseUrl
      : readStorage(STORAGE.baseUrl, defaultBaseUrl()));
  const apiKeys = readApiKeys(providerId);
  if (apiKeyParam) apiKeys[providerId] = apiKeyParam;
  if (baseUrlParam) writeStorage(STORAGE.baseUrl, baseUrlParam);
  if (apiKeyParam) writeStorage(STORAGE.apiKeys, JSON.stringify(apiKeys));
  return { providerId, baseUrl, apiKeys, formatId: resolveInitialFormat(providerId) };
}
