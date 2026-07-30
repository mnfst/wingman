import { createEffect, For, onCleanup, Show, type Component } from 'solid-js';
import {
  DOES,
  DOES_HEADING,
  DOES_NOT,
  DOES_NOT_HEADING,
  ECOSYSTEM,
  ECOSYSTEM_INTRO,
  LICENSE_NOTE,
  TAGLINE,
  WINGMAN_REPO,
} from '../content/about';
import { CloseIcon, GitHubIcon } from './icons.jsx';

interface Props {
  open: boolean;
  onClose: () => void;
}

const CheckIcon: Component = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm4.7 7.7l-5.6 5.6a1 1 0 01-1.42 0L7.3 12.9a1 1 0 011.4-1.4l1.67 1.66 4.9-4.9a1 1 0 011.42 1.42z" />
  </svg>
);

const CrossIcon: Component = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm3.54 12.12a1 1 0 01-1.42 1.42L12 13.41l-2.12 2.13a1 1 0 01-1.42-1.42L10.59 12 8.46 9.88a1 1 0 011.42-1.42L12 10.59l2.12-2.13a1 1 0 011.42 1.42L13.41 12z" />
  </svg>
);

const AboutModal: Component<Props> = (props) => {
  let closeButton: HTMLButtonElement | undefined;
  let previousFocus: HTMLElement | null = null;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.onClose();
  };

  createEffect(() => {
    if (!props.open) return;
    document.addEventListener('keydown', onKeyDown);
    // Move focus into the dialog so Escape and Tab act on it, not on the page
    // behind it, and hand it back to the opener on close.
    previousFocus = document.activeElement as HTMLElement | null;
    closeButton?.focus();
    onCleanup(() => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
      previousFocus = null;
    });
  });

  return (
    <Show when={props.open}>
      <div
        class="modal-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
      >
        <div
          class="about-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-modal-title"
        >
          <header class="about-modal__head">
            <div class="about-modal__brand">
              <img src="/favicon.svg" alt="" class="about-modal__logo" width="32" height="32" />
              <div>
                <h2 id="about-modal-title" class="about-modal__name">
                  Wingman
                </h2>
                <p class="about-modal__tagline">{TAGLINE}</p>
              </div>
            </div>
            <button
              type="button"
              ref={closeButton}
              class="about-modal__close"
              onClick={props.onClose}
              aria-label="Close"
              title="Close (Esc)"
            >
              <CloseIcon />
            </button>
          </header>

          <div class="about-modal__body">
            <div class="about-modal__cols">
              <section>
                <h3 class="about-modal__label">{DOES_HEADING}</h3>
                <ul class="about-modal__list">
                  <For each={DOES}>
                    {(item) => (
                      <li class="about-modal__item about-modal__item--yes">
                        <CheckIcon />
                        <span>{item}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </section>
              <section>
                <h3 class="about-modal__label">{DOES_NOT_HEADING}</h3>
                <ul class="about-modal__list">
                  <For each={DOES_NOT}>
                    {(item) => (
                      <li class="about-modal__item about-modal__item--no">
                        <CrossIcon />
                        <span>{item}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </section>
            </div>

            <hr class="about-modal__rule" />

            <p class="about-modal__note">{LICENSE_NOTE}</p>
            <a
              href={WINGMAN_REPO}
              target="_blank"
              rel="noopener noreferrer"
              class="about-modal__star"
            >
              <GitHubIcon />
              <span>Star Wingman on GitHub</span>
            </a>

            <hr class="about-modal__rule" />

            <section class="about-modal__eco">
              <p class="about-modal__eco-intro">{ECOSYSTEM_INTRO}</p>
              <ul class="about-modal__eco-list">
                <For each={ECOSYSTEM}>
                  {(link) => (
                    <li>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="about-modal__eco-link"
                      >
                        {link.label}
                      </a>
                      <span class="about-modal__eco-desc"> — {link.description}</span>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default AboutModal;
