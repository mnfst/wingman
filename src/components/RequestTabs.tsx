import { createEffect, createMemo, For, Show, type Component } from 'solid-js';
import { PROFILE_BY_ID } from '../profiles';
import { formatRelativeTime, type HistoryEntry } from '../services/history';

interface Props {
  entries: HistoryEntry[];
  activeId: string | null;
  onSelect: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  /** Switch to the draft tab, keeping its unsent text. */
  onSelectDraft: () => void;
  /** Start a fresh draft (+ button). */
  onNewRequest: () => void;
}

const PlusIcon: Component = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const TrashIcon: Component = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

function statusTone(entry: HistoryEntry): 'ok' | 'warn' | 'err' {
  if (entry.ok) return 'ok';
  if (entry.status >= 400 && entry.status < 500) return 'warn';
  return 'err';
}

/**
 * Postman/browser-style horizontal request tabs: every history entry is a tab
 * (oldest → newest, left → right), plus an "Untitled" draft tab while nothing
 * is restored. Replaces the old vertical history sidebar.
 */
const RequestTabs: Component<Props> = (props) => {
  let scrollRef: HTMLDivElement | undefined;

  // Oldest first so a fresh send appears at the right edge, like a new browser tab.
  const ordered = createMemo(() => [...props.entries].reverse());

  // Keep the active tab visible when it changes (a send appends at the far right).
  createEffect(() => {
    void props.activeId;
    void props.entries.length;
    queueMicrotask(() => {
      scrollRef
        ?.querySelector('.reqtab--active')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  });

  return (
    <div class="reqtabs">
      <div class="reqtabs__scroll" role="tablist" aria-label="Request history" ref={scrollRef}>
        <For each={ordered()}>
          {(entry) => (
            <div
              class="reqtab"
              classList={{ 'reqtab--active': entry.id === props.activeId }}
              role="presentation"
            >
              <button
                type="button"
                class="reqtab__main"
                role="tab"
                aria-selected={entry.id === props.activeId}
                onClick={() => props.onSelect(entry)}
                title={`${entry.profileLabel} · ${entry.status || 'network error'} · ${formatRelativeTime(entry.timestamp)}\n${entry.userMessage}`}
              >
                <img
                  class="reqtab__icon"
                  src={PROFILE_BY_ID[entry.profileId]?.icon ?? '/icons/other.svg'}
                  alt=""
                  width="14"
                  height="14"
                />
                <span class="reqtab__label">{entry.userMessage || '(empty)'}</span>
                <span
                  class="reqtab__dot"
                  classList={{ [`reqtab__dot--${statusTone(entry)}`]: true }}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                class="reqtab__close"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onDelete(entry.id);
                }}
                aria-label="Close and delete this request"
                title="Close and delete"
              >
                ×
              </button>
            </div>
          )}
        </For>
        {/* The draft tab is always present, like Postman's Untitled Request —
            it's where + and ⌘⇧O land, and where unsent text lives. */}
        <div
          class="reqtab reqtab--draft"
          classList={{ 'reqtab--active': props.activeId === null }}
          role="presentation"
        >
          <button
            type="button"
            class="reqtab__main"
            role="tab"
            aria-selected={props.activeId === null}
            onClick={props.onSelectDraft}
            title="Draft request"
          >
            <span class="reqtab__label">Untitled</span>
          </button>
        </div>
      </div>
      <button
        type="button"
        class="reqtabs__action"
        onClick={props.onNewRequest}
        title="New request"
        aria-label="New request"
      >
        <PlusIcon />
      </button>
      <Show when={props.entries.length > 0}>
        <button
          type="button"
          class="reqtabs__action reqtabs__action--danger"
          onClick={props.onClear}
          title="Clear all history"
          aria-label="Clear all history"
        >
          <TrashIcon />
        </button>
      </Show>
    </div>
  );
};

export default RequestTabs;
