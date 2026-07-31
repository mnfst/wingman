import { describe, expect, it } from 'vitest';
import { PROFILES, PROFILE_BY_ID, profilesForFormat, resolveProfileId } from './profiles';

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

  // Catalog order is what the client menu renders, so it's a product decision,
  // not an accident of editing.
  it('leads with the OpenAI SDK, then the other SDKs, then the agents', () => {
    expect(PROFILES[0]!.id).toBe('openai-sdk');
    const modes = PROFILES.map((p) => p.mode);
    expect(modes.lastIndexOf('sdk')).toBeLessThan(modes.indexOf('agent'));
  });

  it('keeps Default last', () => {
    expect(PROFILES.at(-1)!.id).toBe('default');
  });

  // Both agent clients only show up under openai-chat, so that's the one list
  // where the whole ordering is visible at once.
  it('orders the openai-chat menu SDKs first, agents next, Default last', () => {
    expect(profilesForFormat('openai-chat').map((p) => p.id)).toEqual([
      'openai-sdk',
      'vercel-ai-sdk',
      'langchain',
      'openclaw',
      'hermes',
      'default',
    ]);
  });

  it('defaults each client to a language it actually offers', () => {
    for (const p of PROFILES) {
      expect(p.langs).toContain(p.defaultLang);
    }
  });
});
