import type { Component, JSX } from 'solid-js';

/**
 * Single top row, browser-style: brand on the left, the request tabs filling
 * the rest. Community and About links live in the status bar at the bottom.
 * The brand is a label, not a link — clicking a product's own logo shouldn't
 * navigate you off the app you're using.
 *
 * It is also the h1: without it the only heading on the rendered page would be
 * the clipped one in index.html, and a page whose entire heading structure is
 * invisible reads badly to a search engine. The clipped h1 stays there for
 * crawlers that never run JavaScript, so two exist — which HTML5 allows.
 *
 * The mark is /favicon.svg rather than a second copy of the same artwork: the
 * browser has already fetched it for the tab icon, so this costs no request.
 */
const TitleBar: Component<{ children?: JSX.Element }> = (props) => {
  return (
    <header class="titlebar">
      <h1 class="titlebar__brand">
        <img src="/favicon.svg" alt="" width="22" height="22" />
        <strong>Wingman</strong>
      </h1>
      <div class="titlebar__tabs">{props.children}</div>
    </header>
  );
};

export default TitleBar;
