import type { Component, JSX } from 'solid-js';

/**
 * Single top row, browser-style: brand on the left, the request tabs filling
 * the rest. Community and About links live in the status bar at the bottom.
 */
const TitleBar: Component<{ children?: JSX.Element }> = (props) => {
  return (
    <header class="titlebar">
      <a
        href="https://manifest.build"
        target="_blank"
        rel="noopener noreferrer"
        class="titlebar__brand"
        title="Wingman — by manifest.build"
      >
        <img src="/wingman.svg" alt="" width="22" height="22" />
        <strong>Wingman</strong>
      </a>
      <div class="titlebar__tabs">{props.children}</div>
    </header>
  );
};

export default TitleBar;
