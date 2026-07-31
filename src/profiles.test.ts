import { describe, expect, it } from 'vitest';
import { PROFILES, PROFILE_BY_ID, profilesForFormat, resolveProfileId } from './profiles';
import { FORMAT_BY_ID, type ApiFormat, type RequestParams } from './formats';
import type { SnippetContext } from './snippets';
import type { Profile, ProfileLang } from './profiles';

const params: RequestParams = {
  baseUrl: 'https://app.manifest.build',
  apiKey: 'mnfst_test',
  model: 'auto',
  systemPrompt: 'be terse',
  userMessage: 'hello',
};

/** What the Code panel hands a client's snippet builder. */
function contextFor(profile: Profile, lang: ProfileLang, format: ApiFormat): SnippetContext {
  const clientHeaders = { ...(format.defaultHeaders ?? {}), ...profile.headers(params) };
  return {
    params,
    lang,
    format,
    headers: { ...clientHeaders },
    clientHeaders,
    key: { hidden: true, envName: 'MANIFEST_API_KEY', value: params.apiKey },
  };
}

describe('resolveProfileId', () => {
  // Settings and saved history outlive the catalog. Both ids below were real
  // clients until cURL and Raw were merged into one Default client.
  it('maps the retired cURL and Raw ids onto Default', () => {
    expect(resolveProfileId('curl')).toBe('default');
    expect(resolveProfileId('raw')).toBe('default');
  });

  it('leaves a live id alone', () => {
    expect(resolveProfileId('openclaw')).toBe('openclaw');
    expect(resolveProfileId('default')).toBe('default');
  });

  it('passes an unknown id straight through for the caller to reject', () => {
    expect(resolveProfileId('nope')).toBe('nope');
  });

  it('resolves every alias to a client that exists', () => {
    for (const id of ['curl', 'raw']) {
      expect(PROFILE_BY_ID[resolveProfileId(id)]).toBeDefined();
    }
  });
});

describe('the Default client', () => {
  const plain = PROFILE_BY_ID['default']!;

  it('works with every wire format', () => {
    expect(plain.formats).toEqual(['openai-chat', 'openai-responses', 'anthropic-messages']);
  });

  // The old cURL client set a User-Agent that browsers strip from every fetch,
  // which is exactly why it was indistinguishable from Raw.
  it('adds no fingerprint headers', () => {
    expect(
      plain.headers({ baseUrl: '', apiKey: '', model: '', systemPrompt: '', userMessage: '' }),
    ).toEqual({});
  });

  it('leaves headers editable', () => {
    expect(plain.headersLocked ?? false).toBe(false);
  });

  it('offers both a cURL and a fetch rendering', () => {
    expect(plain.langs).toContain('bash');
    expect(plain.langs).toContain('typescript');
  });

  it('is offered whichever format is selected', () => {
    for (const format of ['openai-chat', 'openai-responses', 'anthropic-messages'] as const) {
      expect(profilesForFormat(format).some((p) => p.id === 'default')).toBe(true);
    }
  });
});

describe('the client catalog', () => {
  it('has no duplicate ids', () => {
    expect(new Set(PROFILES.map((p) => p.id)).size).toBe(PROFILES.length);
  });

  it('defaults each client to a language it actually offers', () => {
    for (const p of PROFILES) {
      expect(p.langs).toContain(p.defaultLang);
    }
  });

  it('declares at least one format for every client', () => {
    for (const p of PROFILES) {
      expect(p.formats.length).toBeGreaterThan(0);
      for (const id of p.formats) expect(FORMAT_BY_ID[id]).toBeDefined();
    }
  });

  // Every client is reachable from the UI, so every client's own three
  // contributions (headers, body extras, snippet) have to hold up for each
  // format and language it declares. A catalog entry that throws here is one
  // that would throw the moment it is selected.
  it.each(PROFILES.map((p) => [p.id, p] as const))('builds a request for %s', (_id, profile) => {
    for (const formatId of profile.formats) {
      const format = FORMAT_BY_ID[formatId]!;
      for (const lang of profile.langs) {
        expect(profile.headers(params)).toBeTypeOf('object');
        expect(profile.bodyExtras?.(params) ?? {}).toBeTypeOf('object');
        const code = profile.code(contextFor(profile, lang, format));
        expect(code.length).toBeGreaterThan(0);
        // The snippet has to describe the request on screen, not a stale one.
        expect(code).toContain(params.model);
      }
    }
  });

  // A fingerprint client hides its Headers tab, so the headers it sets are the
  // only ones that will ever go out, so they cannot be empty.
  it('gives every locked client a fingerprint to send', () => {
    for (const p of PROFILES.filter((profile) => profile.headersLocked)) {
      expect(Object.keys(p.headers(params)).length).toBeGreaterThan(0);
    }
  });
});
