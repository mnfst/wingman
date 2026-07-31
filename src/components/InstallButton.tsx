import { createSignal, onCleanup, onMount, Show, type Component } from 'solid-js';
import { isStandalone, type BeforeInstallPromptEvent } from '../services/pwa';

const DownloadIcon: Component = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M4 20h16" />
  </svg>
);

/**
 * The install entry in the status bar. It only appears once the browser has
 * offered a prompt. Anywhere that can't install (Firefox, an iOS tab, an
 * already-installed window) the item never shows rather than promising
 * something that won't happen.
 */
const InstallButton: Component = () => {
  const [prompt, setPrompt] = createSignal<BeforeInstallPromptEvent | null>(null);

  // Taking the event over suppresses Chrome's own mini-infobar, which is the
  // point: the offer belongs in the status bar with the other meta links.
  const onOffer = (e: Event) => {
    e.preventDefault();
    setPrompt(e as BeforeInstallPromptEvent);
  };
  const onInstalled = () => setPrompt(null);

  onMount(() => {
    window.addEventListener('beforeinstallprompt', onOffer);
    window.addEventListener('appinstalled', onInstalled);
  });
  onCleanup(() => {
    window.removeEventListener('beforeinstallprompt', onOffer);
    window.removeEventListener('appinstalled', onInstalled);
  });

  const install = async () => {
    const offer = prompt();
    if (!offer) return;
    // The event is single-use, so it goes whether or not the user accepts;
    // Chrome fires a fresh one when it decides to offer again.
    setPrompt(null);
    await offer.prompt();
    await offer.userChoice;
  };

  return (
    <Show when={prompt() && !isStandalone()}>
      <button
        type="button"
        class="statusbar__item statusbar__item--install"
        onClick={() => void install()}
        title="Install Wingman as an app"
      >
        <DownloadIcon />
        <span>Install</span>
      </button>
    </Show>
  );
};

export default InstallButton;
