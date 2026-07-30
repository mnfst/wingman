import type { Component } from 'solid-js';
import { GitHubIcon } from './icons.jsx';
import { WINGMAN_REPO } from '../content/about';

const DISCORD_INVITE = 'https://discord.gg/FepAked3W7';

interface Props {
  devTools: boolean;
  onToggleDevTools: () => void;
  onOpenAbout: () => void;
}

const DiscordIcon: Component = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.07.07 0 0 0-.073.035c-.211.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.62 12.62 0 0 0-.617-1.25.077.077 0 0 0-.073-.035 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.045-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.42 0-1.333.956-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.335-.956 2.42-2.157 2.42zm7.975 0c-1.183 0-2.157-1.085-2.157-2.42 0-1.333.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.335-.946 2.42-2.157 2.42z" />
  </svg>
);

const InfoIcon: Component = () => (
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
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const WrenchIcon: Component = () => (
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
    <path d="M14.7 6.3a4 4 0 0 0 5 5l-9.6 9.6a2.1 2.1 0 0 1-3-3z" />
    <path d="M14.7 6.3 17.5 3.5" />
  </svg>
);

/**
 * Bruno-style status bar pinned to the bottom: the meta links the app itself
 * never needs live down here rather than competing with the request tabs up
 * top. Dev Tools sits on the right, where Bruno puts it.
 */
const StatusBar: Component<Props> = (props) => {
  return (
    <footer class="statusbar">
      <div class="statusbar__group">
        <a
          href={WINGMAN_REPO}
          target="_blank"
          rel="noopener noreferrer"
          class="statusbar__item"
          title="Source on GitHub"
        >
          <GitHubIcon size={13} />
          <span>GitHub</span>
        </a>
        <a
          href={DISCORD_INVITE}
          target="_blank"
          rel="noopener noreferrer"
          class="statusbar__item"
          title="Join the Manifest Discord"
        >
          <DiscordIcon />
          <span>Discord</span>
        </a>
        <button
          type="button"
          class="statusbar__item"
          onClick={props.onOpenAbout}
          aria-haspopup="dialog"
          title="What Wingman is, and what it is not"
        >
          <InfoIcon />
          <span>About</span>
        </button>
      </div>

      <div class="statusbar__group">
        <button
          type="button"
          class="statusbar__item"
          classList={{ 'statusbar__item--on': props.devTools }}
          onClick={props.onToggleDevTools}
          aria-pressed={props.devTools}
          title={
            props.devTools
              ? 'Hide the raw request and response panes'
              : 'Show the raw request and response panes'
          }
        >
          <WrenchIcon />
          <span>Dev Tools</span>
        </button>
        <span class="statusbar__version" title="Wingman version">
          v{__APP_VERSION__}
        </span>
      </div>
    </footer>
  );
};

export default StatusBar;
