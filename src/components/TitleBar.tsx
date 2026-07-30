import type { Component, JSX } from 'solid-js';

/**
 * Single top row, browser-style: brand on the left, the request tabs filling
 * the rest. Community and About links live in the status bar at the bottom.
 * The brand is a label, not a link — clicking a product's own logo shouldn't
 * navigate you off the app you're using.
 */
const TitleBar: Component<{ children?: JSX.Element }> = (props) => {
  return (
    <header class="titlebar">
      <span class="titlebar__brand">
        <img src="/wingman.svg" alt="" width="22" height="22" />
        <strong>Wingman</strong>
      </span>
      <div class="titlebar__tabs">{props.children}</div>
    </header>
  );
};

export default TitleBar;
