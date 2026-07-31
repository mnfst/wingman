// Open/close state for the URL bar's dropdowns (format, provider, client,
// model). All four want the same contract — click outside or press Escape to
// dismiss — and all four used to inline it, each registering its document
// listeners from inside the click handler and unregistering them with
// `onCleanup`. That never ran: `onCleanup` binds to the *current owner*, and an
// event handler has none, so every open leaked a pair of document listeners
// (and logged Solid's "cleanups created outside a createRoot" warning). Driving
// the listeners from an effect keeps them tied to the component's lifetime.
import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js';

export interface Dismissable {
  /** True while the menu is open. */
  open: Accessor<boolean>;
  openMenu: () => void;
  close: () => void;
  toggle: () => void;
}

/**
 * @param containerSelector CSS selector for the dropdown's root element. A
 * click landing inside it is the user operating the menu, not dismissing it.
 */
export function createDismissable(containerSelector: string): Dismissable {
  const [open, setOpen] = createSignal(false);
  const close = () => setOpen(false);

  createEffect(() => {
    if (!open()) return;
    const onDocumentClick = (e: MouseEvent) => {
      // `closest` only exists on Element, and a click's target need not be one
      // — the document itself is a valid target, and calling through to it
      // threw inside the listener instead of dismissing the menu.
      const target = e.target;
      if (!(target instanceof Element) || !target.closest(containerSelector)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onKeyDown);
    });
  });

  return {
    open,
    openMenu: () => setOpen(true),
    close,
    toggle: () => setOpen((current) => !current),
  };
}
