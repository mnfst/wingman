import { createSignal, For, onCleanup, Show, type Component } from 'solid-js';
import type { Profile } from '../profiles';

interface Props {
  profiles: readonly Profile[];
  activeId: string;
  onSelect: (id: string) => void;
}

const ChevronIcon: Component = () => (
  <svg
    width="11"
    height="11"
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

const CheckIcon: Component = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const categoryTag = (p: Profile) =>
  p.category === 'personal' ? 'Agent' : p.category === 'app' ? 'SDK' : 'Raw';

/**
 * Client picker in the Postman "auth type" idiom: one compact select-looking
 * control instead of a wall of cards. The menu carries the detail (icon, tag,
 * one-line blurb); the selected client's blurb renders under the control.
 */
const ClientSelect: Component<Props> = (props) => {
  const [open, setOpen] = createSignal(false);

  const active = () => props.profiles.find((p) => p.id === props.activeId) ?? props.profiles[0]!;

  const close = () => setOpen(false);

  const onDocumentClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.client-select')) close();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };

  const toggle = () => {
    const next = !open();
    setOpen(next);
    if (next) {
      document.addEventListener('click', onDocumentClick);
      document.addEventListener('keydown', onKeyDown);
      onCleanup(() => {
        document.removeEventListener('click', onDocumentClick);
        document.removeEventListener('keydown', onKeyDown);
      });
    }
  };

  const handleSelect = (id: string) => {
    props.onSelect(id);
    close();
  };

  return (
    <div class="client-select">
      <button
        type="button"
        class="client-select__btn"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open()}
      >
        <img class="client-select__icon" src={active().icon} alt="" width="18" height="18" />
        <span class="client-select__label">{active().label}</span>
        <span class="client-select__tag">{categoryTag(active())}</span>
        <ChevronIcon />
      </button>
      <Show when={open()}>
        <div class="dd-menu client-select__menu" role="listbox" aria-label="Choose a client">
          <For each={props.profiles}>
            {(p) => (
              <button
                type="button"
                class="dd-menu__item"
                classList={{ 'dd-menu__item--active': p.id === props.activeId }}
                role="option"
                aria-selected={p.id === props.activeId}
                onClick={() => handleSelect(p.id)}
              >
                <img class="dd-menu__icon" src={p.icon} alt="" width="22" height="22" />
                <span class="dd-menu__body">
                  <span class="dd-menu__line">
                    <span class="dd-menu__label">{p.label}</span>
                    <span class="client-select__item-tag">{categoryTag(p)}</span>
                  </span>
                  <span class="dd-menu__blurb">{p.blurb}</span>
                </span>
                <Show when={p.id === props.activeId}>
                  <span class="dd-menu__check" aria-hidden="true">
                    <CheckIcon />
                  </span>
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default ClientSelect;
