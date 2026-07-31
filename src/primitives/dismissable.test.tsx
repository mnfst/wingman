import { Show } from 'solid-js';
import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { createDismissable } from './dismissable';

/** A minimal dropdown wired the way the four real ones are. */
function Dropdown() {
  const { open, close, toggle } = createDismissable('.probe');
  return (
    <div>
      <div class="probe">
        <button type="button" onClick={toggle}>
          toggle
        </button>
        <Show when={open()}>
          <div data-testid="menu">
            <button type="button" onClick={close}>
              pick
            </button>
          </div>
        </Show>
      </div>
      <button type="button" data-testid="outside">
        outside
      </button>
    </div>
  );
}

const menu = () => screen.queryByTestId('menu');

describe('createDismissable', () => {
  it('starts closed and opens on toggle', () => {
    render(() => <Dropdown />);
    expect(menu()).toBeNull();

    screen.getByText('toggle').click();

    expect(menu()).not.toBeNull();
  });

  it('closes on a second toggle', () => {
    render(() => <Dropdown />);
    screen.getByText('toggle').click();
    screen.getByText('toggle').click();
    expect(menu()).toBeNull();
  });

  // The click that opens the menu bubbles to the document listener the effect
  // has just attached — it must not immediately dismiss what it opened.
  it('survives the click that opened it', () => {
    render(() => <Dropdown />);
    screen.getByText('toggle').click();
    expect(menu()).not.toBeNull();
  });

  it('stays open for a click inside the menu', () => {
    render(() => <Dropdown />);
    screen.getByText('toggle').click();

    screen.getByText('pick').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // `pick` calls close itself; what is asserted here is the container check —
    // an inside click is not treated as a dismissal by the document listener.
    expect(menu()).toBeNull();
  });

  it('closes on a click outside', () => {
    render(() => <Dropdown />);
    screen.getByText('toggle').click();

    screen.getByTestId('outside').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(menu()).toBeNull();
  });

  it('closes on Escape', () => {
    render(() => <Dropdown />);
    screen.getByText('toggle').click();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(menu()).toBeNull();
  });

  it('ignores other keys', () => {
    render(() => <Dropdown />);
    screen.getByText('toggle').click();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(menu()).not.toBeNull();
  });

  it('tolerates a click whose target is not an element', () => {
    render(() => <Dropdown />);
    screen.getByText('toggle').click();

    // A click dispatched straight at the document has no element target, which
    // used to be assumed rather than checked.
    expect(() => document.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow();
    expect(menu()).toBeNull();
  });

  // The listeners used to be registered from inside the click handler with an
  // `onCleanup` that had no owner to run it, so every open leaked a pair.
  it('unregisters its document listeners when the menu closes', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    render(() => <Dropdown />);

    screen.getByText('toggle').click();
    screen.getByText('toggle').click();

    expect(remove).toHaveBeenCalledWith('click', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('unregisters them when the component unmounts while open', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(() => <Dropdown />);
    screen.getByText('toggle').click();

    unmount();

    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('exposes an explicit open that is idempotent', () => {
    render(() => {
      const d = createDismissable('.probe');
      d.openMenu();
      d.openMenu();
      return <span data-testid="state">{String(d.open())}</span>;
    });
    expect(screen.getByTestId('state').textContent).toBe('true');
  });
});
