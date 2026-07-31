// Shared jsdom setup. Wingman is browser-only, so the gaps that matter are the
// browser APIs jsdom does not implement: every one of them is reached by code
// under test, and an unstubbed call throws inside a component and shows up as
// an unrelated render failure.
import { cleanup } from '@solidjs/testing-library';
import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  // Explicit, because the library only auto-registers this when Vitest's
  // globals are on and they are not. Without it a rendered App is never
  // disposed: its document-level shortcut listener stays live and the next
  // test's ⌘Enter fires a send from the previous test's component.
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

// jsdom implements neither, and both are called from render paths: the request
// tab strip scrolls the active tab into view, and the code panes offer a Copy
// button.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: () => Promise.resolve() },
  });
}
