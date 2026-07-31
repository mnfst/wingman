// Boot-time resolution: what the app shows before the user has touched
// anything. Storage round-tripping and the legacy-localStorage purge are
// covered in settings.test.ts; this file is about the resolution order
// (query param → stored value → default) that the dashboard embed depends on.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  entriesFromRecord,
  parseApiKeyMap,
  providerForBaseUrl,
  readApiKeys,
  readQueryParam,
  recordFromEntries,
  resolveBootState,
  resolveInitialFormat,
  resolveInitialProfile,
  resolveInitialProvider,
  STORAGE,
  writeStorage,
} from './settings';
import { MANIFEST_BASE_URL } from '../providers';

const ORIGIN = 'https://wingman.manifest.build';

/**
 * Point `window.location` at a URL. Assignment rather than `history.replaceState`:
 * jsdom refuses to rewrite the document's origin, and the hosted app, not
 * jsdom's default localhost, is the boot case these tests are about.
 */
function visit(search = '') {
  const url = new URL(`${ORIGIN}/${search}`);
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      href: url.href,
      origin: url.origin,
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      search: url.search,
    },
  });
}

beforeEach(() => visit());
afterEach(() => visit());

describe('readQueryParam', () => {
  it('reads a param off the current URL', () => {
    visit('?baseUrl=https://gw.example.com');
    expect(readQueryParam('baseUrl')).toBe('https://gw.example.com');
  });

  it('returns null when the param is absent', () => {
    expect(readQueryParam('baseUrl')).toBeNull();
  });
});

describe('header entry conversion', () => {
  it('round-trips a header record', () => {
    const record = { 'X-A': '1', 'X-B': '2' };
    expect(recordFromEntries(entriesFromRecord(record))).toEqual(record);
  });

  // The editor always keeps a blank row at the bottom for the next header.
  it('drops rows with no name and trims the ones that have one', () => {
    expect(
      recordFromEntries([
        { key: '  X-A  ', value: '1' },
        { key: '   ', value: 'orphan' },
        { key: '', value: '' },
      ]),
    ).toEqual({ 'X-A': '1' });
  });
});

describe('parseApiKeyMap', () => {
  it('parses a stored map', () => {
    expect(parseApiKeyMap('{"openai":"sk-1","anthropic":"sk-ant"}')).toEqual({
      openai: 'sk-1',
      anthropic: 'sk-ant',
    });
  });

  it.each([
    ['nothing stored', ''],
    ['malformed JSON', '{'],
    ['a JSON array', '["sk-1"]'],
    ['a JSON scalar', '"sk-1"'],
    ['null', 'null'],
  ])('yields an empty map for %s', (_label, raw) => {
    expect(parseApiKeyMap(raw)).toEqual({});
  });

  it('drops entries that are not non-empty strings', () => {
    expect(parseApiKeyMap('{"a":"sk-1","b":42,"c":"","d":null}')).toEqual({ a: 'sk-1' });
  });
});

describe('readApiKeys', () => {
  it('reads the stored per-provider map', () => {
    writeStorage(STORAGE.apiKeys, '{"openai":"sk-1"}');
    expect(readApiKeys('openai')).toEqual({ openai: 'sk-1' });
  });

  // Sessions that predate the per-provider map still hold one shared key.
  it('migrates the pre-map shared key onto the active provider', () => {
    writeStorage('wingman:apiKey', 'sk-legacy');
    expect(readApiKeys('groq')).toEqual({ groq: 'sk-legacy' });
    // Migrated once, then the old slot is gone for good.
    expect(sessionStorage.getItem('wingman:apiKey')).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(STORAGE.apiKeys) ?? '{}')).toEqual({
      groq: 'sk-legacy',
    });
  });

  it('never lets the legacy key clobber one already set for that provider', () => {
    writeStorage(STORAGE.apiKeys, '{"groq":"gsk-current"}');
    writeStorage('wingman:apiKey', 'sk-legacy');
    expect(readApiKeys('groq')).toEqual({ groq: 'gsk-current' });
  });
});

describe('resolveInitialProvider', () => {
  // The dashboard drawer passes ?baseUrl=; that endpoint is by definition a
  // Manifest gateway, not one of the public presets.
  it('forces Custom when an embed supplies a base URL', () => {
    writeStorage(STORAGE.provider, 'openai');
    expect(resolveInitialProvider('https://gw.example.com')).toBe('custom');
  });

  it('restores the last-picked preset', () => {
    writeStorage(STORAGE.provider, 'groq');
    expect(resolveInitialProvider(null)).toBe('groq');
  });

  it('falls back to Custom for a preset that no longer exists', () => {
    writeStorage(STORAGE.provider, 'retired-provider');
    expect(resolveInitialProvider(null)).toBe('custom');
  });
});

describe('resolveInitialFormat', () => {
  it('honours an explicit ?format=', () => {
    visit('?format=anthropic-messages');
    expect(resolveInitialFormat('custom')).toBe('anthropic-messages');
  });

  it('ignores a ?format= naming a format that does not exist', () => {
    visit('?format=soap');
    expect(resolveInitialFormat('custom')).toBe('openai-chat');
  });

  // A concrete preset speaks one wire format; letting a stored format override
  // it would point the Anthropic preset at /v1/chat/completions.
  it("takes a concrete preset's own format over anything stored", () => {
    writeStorage(STORAGE.format, 'openai-chat');
    expect(resolveInitialFormat('anthropic')).toBe('anthropic-messages');
  });

  it('restores the stored format under the Custom preset', () => {
    writeStorage(STORAGE.format, 'openai-responses');
    expect(resolveInitialFormat('custom')).toBe('openai-responses');
  });

  it('falls back to the default for a stored format that no longer exists', () => {
    writeStorage(STORAGE.format, 'retired-format');
    expect(resolveInitialFormat('custom')).toBe('openai-chat');
  });
});

describe('resolveInitialProfile', () => {
  // Impersonating a real agent is opt-in, so a fresh visit lands on Default.
  it('starts on the neutral Default client', () => {
    expect(resolveInitialProfile('openai-chat')).toBe('default');
  });

  it('restores a stored client that fits the format', () => {
    writeStorage(STORAGE.profile, 'openclaw');
    expect(resolveInitialProfile('openai-chat')).toBe('openclaw');
  });

  it('ignores a stored client the format cannot use', () => {
    writeStorage(STORAGE.profile, 'openclaw');
    expect(resolveInitialProfile('anthropic-messages')).toBe('default');
  });

  it('resolves a retired client id through its alias', () => {
    writeStorage(STORAGE.profile, 'curl');
    expect(resolveInitialProfile('openai-chat')).toBe('default');
  });
});

describe('providerForBaseUrl', () => {
  it('matches a preset so the pill stays in sync when history is restored', () => {
    expect(providerForBaseUrl('https://api.openai.com')).toBe('openai');
  });

  it('ignores a trailing slash', () => {
    expect(providerForBaseUrl('https://api.groq.com/openai//')).toBe('groq');
  });

  it('calls anything unrecognised Custom', () => {
    expect(providerForBaseUrl('https://gw.internal.example.com')).toBe('custom');
  });

  // The Custom preset's own base URL is the empty string; an empty input must
  // not "match" it and must not match every other preset either.
  it('does not match a preset on an empty base URL', () => {
    expect(providerForBaseUrl('')).toBe('custom');
  });
});

describe('resolveBootState', () => {
  it('starts on Custom pointed at the Manifest gateway', () => {
    expect(resolveBootState()).toEqual({
      providerId: 'custom',
      baseUrl: MANIFEST_BASE_URL,
      apiKeys: {},
      formatId: 'openai-chat',
    });
  });

  // The embed's params have to survive a reload, so they are written through.
  it('adopts and persists the embed query params', () => {
    visit('?baseUrl=https://gw.example.com&apiKey=mnfst_embed&format=anthropic-messages');

    const boot = resolveBootState();

    expect(boot).toEqual({
      providerId: 'custom',
      baseUrl: 'https://gw.example.com',
      apiKeys: { custom: 'mnfst_embed' },
      formatId: 'anthropic-messages',
    });
    expect(sessionStorage.getItem(STORAGE.baseUrl)).toBe('https://gw.example.com');
    expect(JSON.parse(sessionStorage.getItem(STORAGE.apiKeys) ?? '{}')).toEqual({
      custom: 'mnfst_embed',
    });
  });

  // The field is not free-text under a concrete preset, so the catalog wins and
  // a stale stored URL can never drift onto the wrong provider.
  it("takes a concrete preset's base URL from the catalog", () => {
    writeStorage(STORAGE.provider, 'anthropic');
    writeStorage(STORAGE.baseUrl, 'https://stale.example.com');

    expect(resolveBootState()).toMatchObject({
      providerId: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      formatId: 'anthropic-messages',
    });
  });

  it('restores a base URL typed under the Custom preset', () => {
    writeStorage(STORAGE.baseUrl, 'http://localhost:3001');
    expect(resolveBootState().baseUrl).toBe('http://localhost:3001');
  });

  it('clears what an older build left in localStorage', () => {
    localStorage.setItem(STORAGE.baseUrl, 'https://old.example.com');
    resolveBootState();
    expect(localStorage.getItem(STORAGE.baseUrl)).toBeNull();
  });
});
