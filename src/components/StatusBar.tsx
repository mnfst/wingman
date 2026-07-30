import type { Component } from 'solid-js';
import { GitHubIcon } from './icons.jsx';
import InstallButton from './InstallButton.jsx';
import { WINGMAN_REPO } from '../content/about';

interface Props {
  devTools: boolean;
  onToggleDevTools: () => void;
  onOpenAbout: () => void;
}

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
        <InstallButton />
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
