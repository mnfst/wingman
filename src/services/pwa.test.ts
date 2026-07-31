import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isStandalone, registerServiceWorker } from './pwa';

const realMatchMedia = window.matchMedia;

/** jsdom has no matchMedia, so each test states which display modes are on. */
function stubDisplayModes(...active: string[]) {
  window.matchMedia = ((query: string) =>
    ({
      matches: active.some((mode) => query.includes(mode)),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = realMatchMedia;
  delete (window.navigator as { standalone?: boolean }).standalone;
  vi.restoreAllMocks();
});

describe('isStandalone', () => {
  it('is false in a plain tab', () => {
    stubDisplayModes('browser');
    expect(isStandalone()).toBe(false);
  });

  it.each(['standalone', 'minimal-ui', 'window-controls-overlay'])(
    'is true in display-mode: %s',
    (mode) => {
      stubDisplayModes(mode);
      expect(isStandalone()).toBe(true);
    },
  );

  it('is true on iOS, which reports it on the navigator', () => {
    stubDisplayModes('browser');
    (window.navigator as { standalone?: boolean }).standalone = true;
    expect(isStandalone()).toBe(true);
  });

  it('survives a browser without matchMedia', () => {
    (window as { matchMedia?: typeof window.matchMedia }).matchMedia = undefined;
    expect(isStandalone()).toBe(false);
  });
});

describe('service worker source', () => {
  // Not `import.meta.url`: the jsdom environment resolves it to an http URL.
  const sw = readFileSync(resolve(process.cwd(), 'src/sw.js'), 'utf8');

  // vite.config.ts substitutes these two literals, character for character.
  // Reformat either one and the build ships a worker that precaches a string
  // called "__PRECACHE__" and never notices it has gone stale.
  it('keeps the placeholders the build substitutes', () => {
    expect(sw).toContain("const BUILD_ID = '__BUILD_ID__';");
    expect(sw).toContain("const PRECACHE = ['__PRECACHE__'];");
  });
});

describe('registerServiceWorker', () => {
  it('does nothing where service workers are unavailable', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    expect(() => registerServiceWorker()).not.toThrow();
    // jsdom ships no serviceWorker, so it must not even wait for load.
    expect(spy).not.toHaveBeenCalledWith('load', expect.anything());
  });
});
