import { describe, expect, it } from 'vitest';
import { hasValidHostname, isLoopbackHost, isPrivateHost, normalizeBaseUrl } from './baseUrl';

const CHAT = '/v1/chat/completions';
const MESSAGES = '/v1/messages';

describe('normalizeBaseUrl', () => {
  it('appends the format path to a bare origin', () => {
    const r = normalizeBaseUrl('https://app.manifest.build', CHAT);
    expect(r.valid).toBe(true);
    expect(r.requestUrl).toBe('https://app.manifest.build/v1/chat/completions');
    expect(r.note).toBeUndefined();
  });

  it('ignores trailing slashes', () => {
    expect(normalizeBaseUrl('https://app.manifest.build///', CHAT).requestUrl).toBe(
      'https://app.manifest.build/v1/chat/completions',
    );
  });

  // The reported bug: a base ending in /v1 produced /v1/v1/chat/completions and
  // a 404 that read as "the gateway is broken".
  it('strips a duplicated /v1 segment', () => {
    const r = normalizeBaseUrl('https://staging.manifest.build/v1', CHAT);
    expect(r.requestUrl).toBe('https://staging.manifest.build/v1/chat/completions');
    expect(r.note).toMatch(/duplicate/i);
  });

  it('strips a duplicated /v1 segment with a trailing slash', () => {
    expect(normalizeBaseUrl('https://staging.manifest.build/v1/', CHAT).requestUrl).toBe(
      'https://staging.manifest.build/v1/chat/completions',
    );
  });

  it('strips a fully pasted endpoint', () => {
    const r = normalizeBaseUrl('https://api.openai.com/v1/chat/completions', CHAT);
    expect(r.requestUrl).toBe('https://api.openai.com/v1/chat/completions');
    expect(r.note).toMatch(/v1\/chat\/completions/);
  });

  it('strips a pasted endpoint belonging to another format', () => {
    expect(normalizeBaseUrl('https://api.anthropic.com/v1/messages', MESSAGES).requestUrl).toBe(
      'https://api.anthropic.com/v1/messages',
    );
  });

  it('strips /v1 for the Anthropic format too', () => {
    expect(normalizeBaseUrl('http://localhost:3001/v1', MESSAGES).requestUrl).toBe(
      'http://localhost:3001/v1/messages',
    );
  });

  // Providers whose base URL legitimately carries a path must survive intact.
  it.each([
    ['https://api.groq.com/openai', 'https://api.groq.com/openai/v1/chat/completions'],
    ['https://openrouter.ai/api', 'https://openrouter.ai/api/v1/chat/completions'],
    [
      'https://api.fireworks.ai/inference',
      'https://api.fireworks.ai/inference/v1/chat/completions',
    ],
    [
      'https://dashscope.aliyuncs.com/compatible-mode',
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    ],
  ])('keeps the provider path in %s', (base, expected) => {
    const r = normalizeBaseUrl(base, CHAT);
    expect(r.requestUrl).toBe(expected);
    expect(r.note).toBeUndefined();
  });

  it('keeps a gateway mounted under its own prefix', () => {
    expect(normalizeBaseUrl('https://gw.example.com/api/v1', CHAT).requestUrl).toBe(
      'https://gw.example.com/api/v1/chat/completions',
    );
  });

  it('trims surrounding whitespace instead of building an unparseable URL', () => {
    const r = normalizeBaseUrl('  https://app.manifest.build  ', CHAT);
    expect(r.valid).toBe(true);
    expect(r.requestUrl).toBe('https://app.manifest.build/v1/chat/completions');
  });

  it('infers http:// for a schemeless loopback host', () => {
    const r = normalizeBaseUrl('localhost:52154', CHAT);
    expect(r.valid).toBe(true);
    expect(r.requestUrl).toBe('http://localhost:52154/v1/chat/completions');
    expect(r.note).toMatch(/http:\/\//);
  });

  it('infers https:// for a schemeless public host', () => {
    expect(normalizeBaseUrl('app.manifest.build', CHAT).requestUrl).toBe(
      'https://app.manifest.build/v1/chat/completions',
    );
  });

  it('normalises an uppercase scheme', () => {
    expect(normalizeBaseUrl('HTTP://localhost:3001', CHAT).requestUrl).toBe(
      'http://localhost:3001/v1/chat/completions',
    );
  });

  it('drops a query string rather than mangling the endpoint', () => {
    const r = normalizeBaseUrl('https://app.manifest.build?debug=1', CHAT);
    expect(r.requestUrl).toBe('https://app.manifest.build/v1/chat/completions');
    expect(r.note).toMatch(/query/i);
  });

  // Left unguarded, `fetch` resolved these against Wingman's own origin and
  // shipped the user's API key there.
  it.each([
    ['', /empty/i],
    ['not a url at all', /valid URL/i],
    ['ftp://files.example.com', /not a supported scheme/i],
    ['mailto:someone@example.com', /not a supported scheme/i],
  ])('rejects %s', (input, problem) => {
    const r = normalizeBaseUrl(input, CHAT);
    expect(r.valid).toBe(false);
    expect(r.requestUrl).toBe('');
    expect(r.problem).toMatch(problem);
  });
});

// `new URL()` disagrees across engines: Chrome percent-encodes a space in a
// host and returns a URL, Node and jsdom throw. These cases are the ones
// Chrome would hand back, so they must be rejected by our own check rather
// than by the parser.
describe('hasValidHostname', () => {
  it.each(['localhost', 'app.manifest.build', '127.0.0.1', '[::1]', 'my_host.internal'])(
    'accepts %s',
    (h) => expect(hasValidHostname(h)).toBe(true),
  );
  it.each(['', 'not%20a%20url%20at%20all', 'a b', 'a|b', 'héllo.example.com'])(
    'rejects %s',
    (h) => expect(hasValidHostname(h)).toBe(false),
  );
});

describe('isLoopbackHost', () => {
  it.each(['localhost', 'LOCALHOST', '127.0.0.1', '::1', 'api.localhost'])('%s is loopback', (h) =>
    expect(isLoopbackHost(h)).toBe(true),
  );
  it.each(['app.manifest.build', '8.8.8.8', 'localhost.example.com'])('%s is not loopback', (h) =>
    expect(isLoopbackHost(h)).toBe(false),
  );
});

describe('isPrivateHost', () => {
  it.each(['127.0.0.1', '10.1.2.3', '192.168.1.10', '172.16.0.1', '172.31.255.1', '169.254.1.1'])(
    '%s is private',
    (h) => expect(isPrivateHost(h)).toBe(true),
  );
  it.each(['8.8.8.8', '172.32.0.1', '11.0.0.1', 'app.manifest.build'])('%s is public', (h) =>
    expect(isPrivateHost(h)).toBe(false),
  );
});
