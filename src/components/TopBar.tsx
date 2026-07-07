import type { Component } from 'solid-js';
import CommunityMenu from './CommunityMenu.jsx';

const TopBar: Component = () => {
  return (
    <header class="topbar">
      <div class="topbar__brand">
        <a
          href="https://manifest.build"
          target="_blank"
          rel="noopener noreferrer"
          class="topbar__logo-link"
          title="manifest.build"
        >
          <img
            src="/wingman.svg"
            alt="Wingman"
            class="topbar__logo"
            width="28"
            height="28"
          />
        </a>
        <span class="topbar__divider" aria-hidden="true">
          /
        </span>
        <div class="topbar__title">
          <strong>Wingman</strong>
        </div>
      </div>
      <CommunityMenu />
    </header>
  );
};

export default TopBar;
