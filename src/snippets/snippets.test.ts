import { describe, expect, it } from 'vitest';
import { PROFILES, PROFILE_BY_ID, type Profile, type ProfileLang } from '../profiles';
import { FORMAT_BY_ID, type ApiFormat } from '../formats';
import { autoHeaders, parseSnippet, type SnippetContext } from './index';
import { blockAfter, containsEnvRef, escapeRegex, unquote } from './literals';
import { entriesFromRecord } from '../services/settings';

const KEY = 'mnfst_live_9f3ab21c';
const PARAMS = {
  baseUrl: 'https://gateway.example.com',
  apiKey: KEY,
  model: 'claude-sonnet-4-5',
  systemPrompt: 'Answer in one sentence.',
  userMessage: 'Say hello in one short sentence.',
};

function contextFor(
  profile: Profile,
  lang: ProfileLang,
  patch: Partial<SnippetContext> = {},
): SnippetContext {
  const format = FORMAT_BY_ID[profile.formats[0]!] as ApiFormat;
  const clientHeaders = { ...(format.defaultHeaders ?? {}), ...profile.headers(PARAMS) };
  return {
    params: PARAMS,
    lang,
    format,
    headers: { ...clientHeaders },
    clientHeaders,
    key: { hidden: true, envName: 'MANIFEST_API_KEY', value: KEY },
    ...patch,
  };
}

/** Every client, in every language it offers. */
const COMBINATIONS: Array<{ profile: Profile; lang: ProfileLang }> = PROFILES.flatMap((profile) =>
  profile.langs.map((lang) => ({ profile, lang })),
);

const label = (profile: Profile, lang: ProfileLang) => `${profile.id} (${lang})`;

describe('hiding the API key', () => {
  it.each(COMBINATIONS)('keeps $profile.id ($lang) free of the key', ({ profile, lang }) => {
    const code = profile.code(contextFor(profile, lang));
    expect(code, label(profile, lang)).not.toContain(KEY);
    expect(code, label(profile, lang)).toContain('MANIFEST_API_KEY');
  });

  it.each(COMBINATIONS)(
    'prints the key in $profile.id ($lang) once revealed',
    ({ profile, lang }) => {
      const key = { hidden: false, envName: 'MANIFEST_API_KEY', value: KEY };
      expect(profile.code(contextFor(profile, lang, { key })), label(profile, lang)).toContain(KEY);
    },
  );

  // Reading `os.environ` without importing it is a NameError, not a snippet.
  it('imports os for the Python snippets that reference it', () => {
    for (const { profile, lang } of COMBINATIONS) {
      if (lang !== 'python') continue;
      const code = profile.code(contextFor(profile, lang));
      expect(code.includes('os.environ') && !code.startsWith('import os'), profile.id).toBe(false);
    }
  });

  // The reference is only useful if it's the same secret the request uses, so
  // it must never come back as a literal the user then has to un-paste.
  it.each(COMBINATIONS)(
    'never reads the reference back as a key ($profile.id, $lang)',
    ({ profile, lang }) => {
      const ctx = contextFor(profile, lang);
      const patch = parseSnippet(profile.code(ctx), {
        format: ctx.format,
        autoHeaders: autoHeaders(ctx),
      });
      expect(patch.apiKey, label(profile, lang)).toBeUndefined();
    },
  );
});

describe('reading an edited snippet back', () => {
  const roundTrip = (profile: Profile, lang: ProfileLang, ctx = contextFor(profile, lang)) =>
    parseSnippet(profile.code(ctx), { format: ctx.format, autoHeaders: autoHeaders(ctx) });

  it.each(COMBINATIONS)('recovers the base URL from $profile.id ($lang)', ({ profile, lang }) => {
    expect(roundTrip(profile, lang).baseUrl, label(profile, lang)).toBe(PARAMS.baseUrl);
  });

  it.each(COMBINATIONS)('recovers the model from $profile.id ($lang)', ({ profile, lang }) => {
    expect(roundTrip(profile, lang).model, label(profile, lang)).toBe(PARAMS.model);
  });

  // OpenClaw's snippet only writes a provider config, so there's no message in it
  // to recover, and claiming otherwise would blank the composer.
  it.each(COMBINATIONS.filter((c) => c.profile.id !== 'openclaw'))(
    'recovers the user message from $profile.id ($lang)',
    ({ profile, lang }) => {
      expect(roundTrip(profile, lang).userMessage, label(profile, lang)).toBe(PARAMS.userMessage);
    },
  );

  it.each(COMBINATIONS.filter((c) => !c.profile.omitsSystemPrompt))(
    'recovers the system prompt from $profile.id ($lang)',
    ({ profile, lang }) => {
      expect(roundTrip(profile, lang).systemPrompt, label(profile, lang)).toBe(PARAMS.systemPrompt);
    },
  );

  it('reads the revealed key back as the key', () => {
    const profile = PROFILE_BY_ID['openai-sdk']!;
    const key = { hidden: false, envName: 'MANIFEST_API_KEY', value: KEY };
    const ctx = contextFor(profile, 'typescript', { key });
    expect(roundTrip(profile, 'typescript', ctx).apiKey).toBe(KEY);
  });

  it('reads a key typed straight into the snippet', () => {
    const profile = PROFILE_BY_ID['openai-sdk']!;
    const ctx = contextFor(profile, 'typescript');
    const edited = profile.code(ctx).replace('process.env.MANIFEST_API_KEY', '"sk-typed-by-hand"');
    const patch = parseSnippet(edited, { format: ctx.format, autoHeaders: autoHeaders(ctx) });
    expect(patch.apiKey).toBe('sk-typed-by-hand');
  });

  it('clears the system prompt when its message is deleted from the code', () => {
    const profile = PROFILE_BY_ID['openai-sdk']!;
    const ctx = contextFor(profile, 'typescript');
    const withoutSystem = profile.code({
      ...ctx,
      params: { ...PARAMS, systemPrompt: '' },
    });
    const patch = parseSnippet(withoutSystem, {
      format: ctx.format,
      autoHeaders: autoHeaders(ctx),
    });
    expect(patch.systemPrompt).toBe('');
    expect(patch.userMessage).toBe(PARAMS.userMessage);
  });

  // The snippet appends the endpoint path the format owns; forgetting to strip
  // it again grows a `/v1` on every keystroke.
  it('strips the path the snippet added back off the base URL', () => {
    const profile = PROFILE_BY_ID['openai-sdk']!;
    const ctx = contextFor(profile, 'typescript');
    expect(profile.code(ctx)).toContain('https://gateway.example.com/v1');
    expect(roundTrip(profile, 'typescript', ctx).baseUrl).toBe('https://gateway.example.com');
  });
});

describe('headers in the snippet', () => {
  const custom = { 'X-Trace-Id': 'abc-123' };

  it('spells out every header in the cURL snippet', () => {
    const profile = PROFILE_BY_ID['default']!;
    const ctx = contextFor(profile, 'bash', { headers: { ...custom } });
    const code = profile.code(ctx);
    expect(code).toContain('-H "X-Trace-Id: abc-123"');
    expect(code).toContain('-H "Authorization: Bearer $MANIFEST_API_KEY"');
  });

  it('reads them back without the auth header it injected', () => {
    const profile = PROFILE_BY_ID['default']!;
    const ctx = contextFor(profile, 'bash', { headers: { ...custom } });
    const patch = parseSnippet(profile.code(ctx), {
      format: ctx.format,
      autoHeaders: autoHeaders(ctx),
    });
    expect(patch.headers).toEqual(custom);
  });

  it('does the same for the fetch rendering', () => {
    const profile = PROFILE_BY_ID['default']!;
    const ctx = contextFor(profile, 'typescript', { headers: { ...custom } });
    const code = profile.code(ctx);
    expect(code).toContain('`Bearer ${process.env.MANIFEST_API_KEY}`');
    const patch = parseSnippet(code, { format: ctx.format, autoHeaders: autoHeaders(ctx) });
    expect(patch.headers).toEqual(custom);
  });

  // An SDK stamps its own fingerprint, so the snippet only declares the extras.
  it('declares only the extras for an SDK client', () => {
    const profile = PROFILE_BY_ID['openai-sdk']!;
    const base = contextFor(profile, 'typescript');
    expect(profile.code(base)).not.toContain('defaultHeaders');

    const ctx = { ...base, headers: { ...base.clientHeaders, ...custom } };
    const code = profile.code(ctx);
    expect(code).toContain('defaultHeaders');
    expect(code).toContain('"X-Trace-Id": "abc-123"');
    expect(code).not.toContain('X-Stainless-Lang');

    const patch = parseSnippet(code, { format: ctx.format, autoHeaders: autoHeaders(ctx) });
    expect(patch.headers).toEqual(custom);
  });

  it('reports no headers for a snippet that declares none', () => {
    const profile = PROFILE_BY_ID['openai-sdk']!;
    const ctx = contextFor(profile, 'typescript');
    const patch = parseSnippet(profile.code(ctx), {
      format: ctx.format,
      autoHeaders: autoHeaders(ctx),
    });
    expect(patch.headers).toEqual({});
  });

  // A hand-written Authorization is the user's, not the one we inject for them.
  it('keeps an Authorization header the user set themselves', () => {
    const profile = PROFILE_BY_ID['default']!;
    const headers = { Authorization: 'Bearer deliberately-wrong' };
    const ctx = contextFor(profile, 'bash', { headers });
    const patch = parseSnippet(profile.code(ctx), {
      format: ctx.format,
      autoHeaders: autoHeaders(ctx),
    });
    expect(patch.headers).toEqual(headers);
  });
});

describe('header entries round-trip through the editor shape', () => {
  it('survives entriesFromRecord', () => {
    const profile = PROFILE_BY_ID['default']!;
    const headers = { 'X-One': '1', 'X-Two': '2' };
    const ctx = contextFor(profile, 'bash', { headers });
    const patch = parseSnippet(profile.code(ctx), {
      format: ctx.format,
      autoHeaders: autoHeaders(ctx),
    });
    expect(entriesFromRecord(patch.headers ?? {})).toEqual([
      { key: 'X-One', value: '1' },
      { key: 'X-Two', value: '2' },
    ]);
  });
});

// A few corners of the snippet plumbing the round-trip sweep above never
// reaches: formats that need no credential, and the literal reader's fallbacks.
describe('snippet plumbing corners', () => {
  it('spells out no auth header for a format that authenticates with none', () => {
    const profile = PROFILE_BY_ID['default']!;
    const ctx = contextFor(profile, 'bash');
    const noAuth = { ...ctx.format, auth: { kind: 'none' } as const };

    expect(autoHeaders({ ...ctx, format: noAuth })).toEqual({
      'Content-Type': 'application/json',
    });
  });

  // The Headers tab already lists them, so the snippet must not print a second
  // copy under its own name.
  it('leaves out the headers the request already carries', () => {
    const profile = PROFILE_BY_ID['default']!;
    const ctx = contextFor(profile, 'bash');

    expect(
      autoHeaders({
        ...ctx,
        headers: { authorization: 'Bearer typed-by-hand', 'content-type': 'text/plain' },
      }),
    ).toEqual({});
  });
});

describe('headers the user added on top of a client', () => {
  // The snippet only spells out what the SDK would not send by itself, so a
  // hand-added header has to appear as a keyword argument.
  it.each(['python', 'typescript'] as const)('prints them in the %s SDK snippet', (lang) => {
    const profile = PROFILE_BY_ID['openai-sdk']!;
    const ctx = contextFor(profile, lang);
    const code = profile.code({
      ...ctx,
      headers: { ...ctx.clientHeaders, 'X-Trace': 'abc' },
    });
    expect(code).toContain('X-Trace');
    expect(code).toContain('abc');
  });
});

describe('reading literals back', () => {
  it('unescapes a double-quoted string, half-typed escape and all', () => {
    expect(unquote('"a\\nb"')).toBe('a\nb');
    // Mid-edit the string is not valid JSON yet; it still has to read back.
    expect(unquote('"trailing\\"')).toBe('trailing\\');
  });

  it('unescapes a shell-quoted string', () => {
    expect(unquote("'it'\\''s fine'")).toBe("it's fine");
  });

  it('unescapes a template literal', () => {
    expect(unquote('`a\\`b`')).toBe('a`b');
  });

  it('leaves anything that is not a quoted literal alone', () => {
    expect(unquote('process.env.KEY')).toBe('process.env.KEY');
    expect(unquote('"')).toBe('"');
  });

  // Half-typed code is the normal state of the editor, so neither of these may
  // throw or return a truncated block.
  it('returns null when the block never closes', () => {
    expect(blockAfter('create({ model: "auto"', /create\(\{/)).toBeNull();
  });

  it('returns null when the pattern never matches, or opens no block', () => {
    expect(blockAfter('nothing here', /create\(/)).toBeNull();
    expect(blockAfter('create(model)', /create\(/)).toBeNull();
  });

  it('reads a block whose strings carry the closing bracket', () => {
    expect(blockAfter('messages: [{ "content": "a ] b" }]', /messages:\s*\[/)).toBe(
      '[{ "content": "a ] b" }]',
    );
  });

  // The parser builds patterns out of values the user typed; an unescaped one
  // would either throw or match the wrong thing.
  it('escapes a literal before it becomes part of a pattern', () => {
    expect(new RegExp(escapeRegex('a+b(c)')).test('a+b(c)')).toBe(true);
    expect(escapeRegex('a.b')).toBe('a\\.b');
  });

  // Reading one of these back into the key field would replace the user's key
  // with the reference that was standing in for it.
  it.each([
    '$MANIFEST_API_KEY',
    'process.env.OPENAI_API_KEY',
    'os.environ["ANTHROPIC_API_KEY"]',
    'Bearer ${process.env.KEY}',
    'import.meta.env.VITE_KEY',
  ])('treats %s as a reference, not a secret', (value) => {
    expect(containsEnvRef(value)).toBe(true);
  });

  it('treats a real key as a secret', () => {
    expect(containsEnvRef('mnfst_live_9f3ab21c')).toBe(false);
  });
});
