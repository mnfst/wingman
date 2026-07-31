/**
 * PWA plumbing: the service-worker registration and the browser's install
 * offer.
 *
 * Wingman installs cleanly because there is nothing to install. It is a
 * static SPA that talks straight to whatever endpoint you type. The worker
 * only caches Wingman's own shell (see public/sw.js); keys, prompts and
 * responses stay where they always were, in `sessionStorage` and the tab.
 */

/** Chrome's install offer. Not in lib.dom, so it is declared where it is used. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** True when the page is already running as an installed app rather than a tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari predates display-mode and reports it here instead.
  if ((window.navigator as { standalone?: boolean }).standalone === true) return true;
  if (typeof window.matchMedia !== 'function') return false;
  return ['standalone', 'minimal-ui', 'window-controls-overlay'].some(
    (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
  );
}

/**
 * Registers the worker after load, so it never competes with the first paint.
 * A no-op where service workers are unavailable (Firefox private windows, any
 * insecure origin that isn't localhost).
 *
 * The URL carries no version: the worker's bytes already change every build
 * (vite.config.ts bakes the asset list into it), which is what the browser
 * compares to decide there is a new one to install.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    // Failing to register costs offline support and nothing else, so it stays
    // silent rather than shouting in the console of a browser that can't.
    void navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
