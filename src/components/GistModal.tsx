import { createSignal, onCleanup, Show, type Component } from 'solid-js';
import { highlight } from '../services/highlight';
import { copyText } from '../services/clipboard';
import { CloseIcon, GitHubIcon } from './icons.jsx';

interface Props {
  open: boolean;
  markdown: string;
  onClose: () => void;
}

const NEW_GIST_URL = 'https://gist.github.com/';

const GistModal: Component<Props> = (props) => {
  const [copied, setCopied] = createSignal(false);
  const [copyError, setCopyError] = createSignal<string | null>(null);
  let closeBtnRef: HTMLButtonElement | undefined;
  let previousFocus: HTMLElement | null = null;

  const close = () => {
    setCopied(false);
    setCopyError(null);
    props.onClose();
    // Hand focus back to whatever opened the dialog (the Save button).
    previousFocus?.focus();
    previousFocus = null;
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };

  const handleCopy = async () => {
    setCopyError(null);
    const result = await copyText(props.markdown);
    if (result.ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } else {
      setCopyError(result.reason || 'Could not copy');
    }
  };

  const handleOpenAndCopy = async () => {
    await handleCopy();
    window.open(NEW_GIST_URL, '_blank', 'noopener,noreferrer');
  };

  // Track keyboard listener while open.
  // Solid's effect-via-prop pattern: only attach when open changes to true.
  let attached = false;
  const sync = () => {
    if (props.open && !attached) {
      document.addEventListener('keydown', onKey);
      attached = true;
      // Move focus into the dialog once it exists in the DOM.
      previousFocus = document.activeElement as HTMLElement | null;
      queueMicrotask(() => closeBtnRef?.focus());
    } else if (!props.open && attached) {
      document.removeEventListener('keydown', onKey);
      attached = false;
    }
  };
  // Run sync once on render and whenever props.open flips.
  // (Effect-style via createSignal getter — Solid re-runs the JSX accessors.)
  const _open = () => {
    sync();
    return props.open;
  };
  onCleanup(() => {
    if (attached) document.removeEventListener('keydown', onKey);
  });

  const highlighted = () => highlight(props.markdown, 'markdown');

  return (
    <Show when={_open()}>
      <div
        class="gist-modal__overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gist-modal-title"
      >
        <div class="gist-modal">
          <header class="gist-modal__head">
            <div class="gist-modal__title">
              <GitHubIcon size={16} />
              <strong id="gist-modal-title">Save to GitHub Gist</strong>
            </div>
            <button
              type="button"
              class="gist-modal__close"
              ref={closeBtnRef}
              onClick={close}
              aria-label="Close"
              title="Close (Esc)"
            >
              <CloseIcon />
            </button>
          </header>
          <p class="gist-modal__hint">
            Copy this markdown report and paste it into the new gist tab. API keys are redacted for
            safe sharing.
          </p>
          <div class="gist-modal__preview">
            <pre class="code-view__pre">
              <code class="hljs language-markdown" innerHTML={highlighted()} />
            </pre>
          </div>
          <Show when={copyError()}>
            <p class="gist-modal__error">{copyError()}</p>
          </Show>
          <footer class="gist-modal__actions">
            <button type="button" class="gist-modal__btn-secondary" onClick={handleCopy}>
              <Show
                when={copied()}
                fallback={
                  <>
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy markdown
                  </>
                }
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Copied
              </Show>
            </button>
            <button type="button" class="gist-modal__btn-primary" onClick={handleOpenAndCopy}>
              Copy & open new gist
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
          </footer>
        </div>
      </div>
    </Show>
  );
};

export default GistModal;
