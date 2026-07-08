import { createSignal, For, onCleanup, Show, type Component } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { Provider } from '../providers';

interface Props {
  providers: readonly Provider[];
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

// Preset picker for the Base URL field: choose a provider (OpenAI, Anthropic,
// Mistral, …) to auto-fill its base URL + wire format, or stay on "Custom" to
// type any endpoint. The menu is rendered through a Portal with fixed
// positioning so it escapes the composer wrap's `overflow: hidden` (which
// clips the rounded panel) instead of being cut off behind the fields below.
const ProviderDropdown: Component<Props> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [pos, setPos] = createSignal({ left: 0, bottom: 0, width: 0 });
  let btnRef: HTMLButtonElement | undefined;

  const active = () => props.providers.find((p) => p.id === props.activeId) ?? props.providers[0]!;

  // Anchor the menu just above the button (the composer sits at the bottom of
  // the viewport, so there's room above but not below).
  const reposition = () => {
    if (!btnRef) return;
    const r = btnRef.getBoundingClientRect();
    setPos({ left: r.left, bottom: window.innerHeight - r.top + 6, width: r.width });
  };

  const onDocumentClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.provider-dd') && !target.closest('.provider-dd__menu')) close();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };

  const removeListeners = () => {
    document.removeEventListener('click', onDocumentClick);
    document.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
  };

  const close = () => {
    setOpen(false);
    removeListeners();
  };

  const toggle = () => {
    if (open()) {
      close();
      return;
    }
    reposition();
    setOpen(true);
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', reposition);
    // Capture-phase: catch scrolls in any ancestor (the thread) that shift the button.
    window.addEventListener('scroll', reposition, true);
  };

  onCleanup(removeListeners);

  const handleSelect = (id: string) => {
    props.onSelect(id);
    close();
  };

  return (
    <div class="profile-dd provider-dd">
      <button
        type="button"
        ref={btnRef}
        class="profile-dd__btn provider-dd__btn"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open()}
      >
        <img class="profile-dd__icon" src={active().icon} alt="" width="22" height="22" />
        <span class="provider-dd__btn-body">
          <span class="profile-dd__label">{active().name}</span>
          <span class="provider-dd__btn-url">{active().baseUrlLabel}</span>
        </span>
        <ChevronIcon />
      </button>
      <Show when={open()}>
        <Portal>
          <div
            class="profile-dd__menu provider-dd__menu"
            role="listbox"
            aria-label="Choose a provider preset"
            style={{
              left: `${pos().left}px`,
              bottom: `${pos().bottom}px`,
              width: `${pos().width}px`,
            }}
          >
            <For each={props.providers}>
              {(p) => (
                <button
                  type="button"
                  class="profile-dd__item"
                  classList={{ 'profile-dd__item--active': p.id === props.activeId }}
                  role="option"
                  aria-selected={p.id === props.activeId}
                  onClick={() => handleSelect(p.id)}
                  title={p.subtitle}
                >
                  <img class="profile-dd__item-icon" src={p.icon} alt="" width="22" height="22" />
                  <span class="profile-dd__item-body">
                    <span class="profile-dd__item-line">
                      <span class="profile-dd__item-label">{p.name}</span>
                    </span>
                    <span class="profile-dd__item-blurb provider-dd__item-url">
                      {p.baseUrlLabel}
                    </span>
                  </span>
                  <Show when={p.id === props.activeId}>
                    <span class="profile-dd__item-check" aria-hidden="true">
                      <CheckIcon />
                    </span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </Portal>
      </Show>
    </div>
  );
};

export default ProviderDropdown;
