import { For, Show, type Component } from 'solid-js';
import type { ApiFormat } from '../formats';
import { createDismissable } from '../primitives/dismissable';

interface Props {
  formats: readonly ApiFormat[];
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

/**
 * The "method selector" slot of the URL bar. Every LLM call is a POST, so the
 * verb is a fixed Postman-orange label and the dropdown picks the wire format
 * (the endpoint path) instead, the closest thing an LLM API has to a method.
 */
const FormatDropdown: Component<Props> = (props) => {
  const { open, close, toggle } = createDismissable('.format-dd');

  const active = () => props.formats.find((f) => f.id === props.activeId) ?? props.formats[0]!;

  const handleSelect = (id: string) => {
    props.onSelect(id);
    close();
  };

  return (
    <div class="format-dd">
      <button
        type="button"
        class="format-dd__btn"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open()}
        title={`${active().label}: ${active().blurb}`}
      >
        <span class="format-dd__method">POST</span>
        <span class="format-dd__path">{active().path}</span>
        <ChevronIcon />
      </button>
      <Show when={open()}>
        <div class="dd-menu format-dd__menu" role="listbox" aria-label="Choose API format">
          <For each={props.formats}>
            {(f) => (
              <button
                type="button"
                class="dd-menu__item"
                classList={{ 'dd-menu__item--active': f.id === props.activeId }}
                role="option"
                aria-selected={f.id === props.activeId}
                onClick={() => handleSelect(f.id)}
              >
                <img class="dd-menu__icon" src={f.icon} alt="" width="22" height="22" />
                <span class="dd-menu__body">
                  <span class="dd-menu__line">
                    <span class="dd-menu__label">{f.label}</span>
                    <span class="dd-menu__mono">{f.path}</span>
                  </span>
                  <span class="dd-menu__blurb">{f.blurb}</span>
                </span>
                <Show when={f.id === props.activeId}>
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

export default FormatDropdown;
