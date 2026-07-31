import { describe, expect, it } from 'vitest';
import { highlight } from './highlight';

// The result is injected with innerHTML, so the one property that has to hold
// for every input is that nothing reaches the DOM as live markup.

describe('highlight', () => {
  // One sample per language the app actually asks for: the code panel, the
  // response-body pane, the header panes and the gist preview.
  it.each([
    ['json', '{"a": 1}'],
    ['typescript', 'const a = 1;'],
    ['python', 'import os'],
    ['bash', 'cat <<EOF > config.yaml'],
    ['http', 'content-type: application/json'],
    ['markdown', '# Heading'],
  ])('marks up %s', (language, sample) => {
    expect(highlight(sample, language)).toContain('<span class="hljs-');
  });

  it.each([
    ['ts', 'typescript'],
    ['js', 'typescript'],
    ['py', 'python'],
    ['sh', 'bash'],
    ['shell', 'bash'],
  ])('resolves the %s alias to %s', (alias, canonical) => {
    expect(highlight('const a = 1;', alias)).toBe(highlight('const a = 1;', canonical));
  });

  // The response-headers pane asks for "text", which is not a registered
  // language — it must come back escaped rather than raw.
  it('escapes rather than highlights an unregistered language', () => {
    expect(highlight('<img src=x onerror=alert(1)>', 'text')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
  });

  it('escapes the ampersand before the angle brackets', () => {
    expect(highlight('a & <b>', 'text')).toBe('a &amp; &lt;b&gt;');
  });

  // A provider can return anything at all; ignoreIllegals keeps a payload that
  // is not valid in the claimed language from throwing mid-render.
  it('does not throw on a payload that is invalid for the language', () => {
    expect(() => highlight('}{ not json at all', 'json')).not.toThrow();
  });

  it('leaves an empty string empty', () => {
    expect(highlight('', 'json')).toBe('');
  });

  it('never emits an unescaped script tag', () => {
    expect(highlight('{"x":"</script><script>alert(1)</script>"}', 'json')).not.toContain(
      '<script>',
    );
  });
});
