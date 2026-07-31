import { createSignal, For, onCleanup, Show, type Component } from 'solid-js';
import type { Provider } from '../providers';

interface Props {
  providers: readonly Provider[];
  activeId: string;
  onSelect: (id: string) => void;
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

/**
 * Provider preset picker embedded at the left edge of the URL input, like a
 * protocol chip: click the logo to swap in a well-known provider's base URL,
 * wire format, and default model. Typing in the URL flips back to Custom.
 */
const ProviderDropdown: Component<Props> = (props) => {
  const [open, setOpen] = createSignal(false);

  const active = () => props.providers.find((p) => p.id === props.activeId) ?? props.providers[0]!;

  const close = () => setOpen(false);

  const onDocumentClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.provider-dd')) close();
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
    <div class="provider-dd">
      <button
        type="button"
        class="provider-dd__btn"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open()}
        title={`Provider preset: ${active().name}. ${active().subtitle}`}
      >
        <img class="provider-dd__icon" src={active().icon} alt="" width="18" height="18" />
        <ChevronIcon />
      </button>
      <Show when={open()}>
        <div class="dd-menu provider-dd__menu" role="listbox" aria-label="Choose a provider preset">
          <For each={props.providers}>
            {(p) => (
              <button
                type="button"
                class="dd-menu__item"
                classList={{ 'dd-menu__item--active': p.id === props.activeId }}
                role="option"
                aria-selected={p.id === props.activeId}
                onClick={() => handleSelect(p.id)}
                title={p.subtitle}
              >
                <img class="dd-menu__icon" src={p.icon} alt="" width="22" height="22" />
                <span class="dd-menu__body">
                  <span class="dd-menu__line">
                    <span class="dd-menu__label">{p.name}</span>
                  </span>
                  <span class="dd-menu__blurb dd-menu__mono">{p.baseUrlLabel}</span>
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

export default ProviderDropdown;
