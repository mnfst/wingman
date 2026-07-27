import { afterEach, describe, expect, it } from 'vitest';
import { classifyFetchFailure, describeFailure } from './diagnostics';

/** Point `window.location` at an origin so the address-space branches can run. */
function setPageOrigin(href: string): void {
  Object.defineProperty(window, 'location', {
    value: new URL(href),
    writable: true,
    configurable: true,
  });
}

const failedToFetch = new TypeError('Failed to fetch');

afterEach(() => setPageOrigin('http://localhost:3002/'));

describe('classifyFetchFailure', () => {
  it('reports an aborted request', () => {
    const err = new DOMException('aborted', 'AbortError');
    expect(classifyFetchFailure(err, 'https://app.manifest.build/v1/chat/completions')).toBe(
      'aborted',
    );
  });

  // The reported failure: hosted HTTPS Wingman in the dashboard drawer calling
  // a loopback dev gateway. Chrome gates this behind the Local Network Access
  // permission, so no server-side CORS change can fix it — calling it "CORS"
  // is what sent people editing allow-lists that were already correct.
  it.each([
    'http://localhost:52154/v1/chat/completions',
    'http://127.0.0.1:3001/v1/chat/completions',
    'http://192.168.1.20:3001/v1/chat/completions',
  ])('flags %s from an HTTPS page as a local-network block', (url) => {
    setPageOrigin('https://wingman.manifest.build/');
    expect(classifyFetchFailure(failedToFetch, url)).toBe('local-network');
  });

  it('flags a public plain-HTTP target from an HTTPS page as mixed content', () => {
    setPageOrigin('https://wingman.manifest.build/');
    expect(classifyFetchFailure(failedToFetch, 'http://api.example.com/v1/chat/completions')).toBe(
      'mixed-content',
    );
  });

  it('does not blame the local network for a public HTTPS target', () => {
    setPageOrigin('https://wingman.manifest.build/');
    expect(classifyFetchFailure(failedToFetch, 'https://app.manifest.build/v1/chat/completions')).toBe(
      'network',
    );
  });

  // Same address space: loopback page to loopback gateway is allowed, so a
  // failure here really is "not running, or CORS".
  it('reports a plain network failure when the page is itself on localhost', () => {
    setPageOrigin('http://localhost:3002/');
    expect(classifyFetchFailure(failedToFetch, 'http://localhost:52154/v1/chat/completions')).toBe(
      'network',
    );
  });

  it('gives up rather than guessing on an unparseable URL', () => {
    expect(classifyFetchFailure(failedToFetch, 'not a url')).toBe('unknown');
  });
});

describe('describeFailure', () => {
  it('names Local Network Access and does not tell the user to fix CORS', () => {
    setPageOrigin('https://wingman.manifest.build/');
    const advice = describeFailure('local-network', 'http://localhost:52154/v1/chat/completions');
    expect(advice.label).toBe('local network blocked');
    expect(advice.detail).toMatch(/Local Network Access/);
    expect(advice.detail).toMatch(/localhost:52154/);
    expect(advice.detail).not.toMatch(/allow-list/);
  });

  it('offers both causes for an ambiguous network failure', () => {
    const advice = describeFailure('network', 'http://localhost:59999/v1/chat/completions');
    expect(advice.label).toBe('unreachable');
    expect(advice.detail).toMatch(/nothing listening/);
    expect(advice.detail).toMatch(/CORS/);
  });

  it('explains mixed content in terms of the page origin', () => {
    setPageOrigin('https://wingman.manifest.build/');
    const advice = describeFailure('mixed-content', 'http://api.example.com/v1/chat/completions');
    expect(advice.detail).toMatch(/https:\/\/wingman\.manifest\.build/);
    expect(advice.detail).toMatch(/api\.example\.com/);
  });
});
