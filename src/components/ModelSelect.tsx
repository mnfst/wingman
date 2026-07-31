import { createMemo, createSignal, For, Show, type Component } from 'solid-js';
import { createDismissable } from '../primitives/dismissable';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Model ids fetched from the endpoint's /v1/models. Empty means unknown. */
  models: string[];
}

const ChevronIcon: Component = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/**
 * The model field: free-text input first (any id always works), upgraded to a
 * combobox when the endpoint's /v1/models catalog answered. Typing filters;
 * the chevron shows the full list.
 */
const ModelSelect: Component<Props> = (props) => {
  const { open, openMenu: show, close } = createDismissable('.model-select');
  // While the menu is open, typing filters; the chevron shows everything.
  const [filtering, setFiltering] = createSignal(false);

  const filtered = createMemo(() => {
    if (!filtering()) return props.models;
    const q = props.value.trim().toLowerCase();
    if (!q) return props.models;
    return props.models.filter((m) => m.toLowerCase().includes(q));
  });

  const openMenu = (withFilter: boolean) => {
    // Nothing to pick from: the endpoint's catalog was unavailable, so the
    // field stays a plain free-text input.
    if (props.models.length === 0) return;
    setFiltering(withFilter);
    show();
  };

  const handleSelect = (id: string) => {
    props.onChange(id);
    close();
  };

  return (
    <div class="model-select" classList={{ 'model-select--listed': props.models.length > 0 }}>
      <input
        class="model-select__input"
        type="text"
        value={props.value}
        onInput={(e) => {
          props.onChange(e.currentTarget.value);
          openMenu(true);
        }}
        placeholder="model"
        spellcheck={false}
        autocomplete="off"
        aria-label="Model"
        title="Model id sent in the request body"
      />
      <Show when={props.models.length > 0}>
        <button
          type="button"
          class="model-select__toggle"
          onClick={() => (open() ? close() : openMenu(false))}
          aria-haspopup="listbox"
          aria-expanded={open()}
          aria-label="Choose from available models"
          title={`${props.models.length} models reported by this endpoint`}
        >
          <ChevronIcon />
        </button>
      </Show>
      <Show when={open() && filtered().length > 0}>
        <div class="dd-menu model-select__menu" role="listbox" aria-label="Available models">
          <For each={filtered()}>
            {(m) => (
              <button
                type="button"
                class="dd-menu__item model-select__item"
                classList={{ 'dd-menu__item--active': m === props.value }}
                role="option"
                aria-selected={m === props.value}
                onClick={() => handleSelect(m)}
              >
                {m}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default ModelSelect;
