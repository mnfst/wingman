import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DOES,
  DOES_HEADING,
  DOES_NOT,
  DOES_NOT_HEADING,
  ECOSYSTEM,
  ECOSYSTEM_HEADING,
  ECOSYSTEM_INTRO,
  LICENSE_NOTE,
  LICENSE_URL,
  TAGLINE,
  WINGMAN_REPO,
} from './about';

// The About modal is client-rendered and only mounts on click, so the copy is
// mirrored as static HTML in index.html for crawlers that never run JavaScript.
// These tests fail when one copy is edited and the other is not.

// Not `import.meta.url`: the jsdom environment resolves it to an http URL.
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

// `[^>]*` rather than a literal tag: the formatter is free to spread the
// opening tag's attributes over several lines.
const section = html.match(/<section[^>]*id="about-wingman"[\s\S]*?<\/section>/)?.[0] ?? '';

/** Visible text of the section: tags dropped, entities decoded, spaces collapsed. */
const text = section
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  // A tag between a word and its punctuation ("...<a>MIT license</a>.") left a
  // space behind when the tag was dropped.
  .replace(/ ([.,;:!?])/g, '$1')
  .trim();

describe('about copy in index.html', () => {
  it('ships the section in the HTML response', () => {
    expect(section).not.toBe('');
  });

  // Clipping keeps the copy in the accessibility tree and in the index;
  // display:none and the hidden attribute both get it discounted or dropped.
  it('is clipped rather than hidden', () => {
    expect(section).not.toMatch(/display:\s*none/);
    expect(section).not.toMatch(/<section[^>]*\shidden[\s=>]/);
    expect(section).toMatch(/clip-path:\s*inset\(50%\)/);
  });

  it('carries the tagline and both headings', () => {
    expect(text).toContain(TAGLINE);
    expect(text).toContain(DOES_HEADING);
    expect(text).toContain(DOES_NOT_HEADING);
  });

  it.each([...DOES, ...DOES_NOT])('carries the bullet %j', (bullet) => {
    expect(text).toContain(bullet);
  });

  it('carries the license note, with the licence and repo linked', () => {
    expect(text).toContain(LICENSE_NOTE);
    expect(section).toContain(LICENSE_URL);
    expect(section).toContain(WINGMAN_REPO);
  });

  it('carries the ecosystem intro', () => {
    expect(text).toContain(ECOSYSTEM_HEADING);
    expect(text).toContain(ECOSYSTEM_INTRO);
  });

  it.each(ECOSYSTEM)('carries the $label link', (link) => {
    expect(text).toContain(link.label);
    expect(text).toContain(link.description);
    expect(section).toContain(`href="${link.href}"`);
  });
});

describe('about links', () => {
  it.each([...ECOSYSTEM.map((l) => l.href), WINGMAN_REPO, LICENSE_URL])(
    'points %s at https',
    (href) => {
      expect(href).toMatch(/^https:\/\//);
    },
  );
});
