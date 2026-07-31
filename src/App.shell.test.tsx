// The chrome around the request: Dev Tools, About, sharing, and the global
// keyboard shortcuts.
import { render, screen } from '@solidjs/testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

const fetchMock = vi.fn();

function reply(body: unknown = { model: 'gpt-4o', choices: [{ message: { content: 'Hello!' } }] }) {
  return {
    status: 200,
    statusText: 'OK',
    ok: true,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
    body: null,
  } as unknown as Response;
}

const composer = () => screen.getByLabelText('User message') as HTMLTextAreaElement;
const sendButton = () => screen.getByRole('button', { name: 'Send' });

function typeMessage(text: string) {
  composer().value = text;
  composer().dispatchEvent(new Event('input', { bubbles: true }));
}

async function send() {
  sendButton().click();
  await vi.waitFor(() => expect(screen.getByText('200 OK')).toBeTruthy());
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? Promise.resolve(reply())
      : Promise.reject(new TypeError('Failed to fetch')),
  );
  vi.stubGlobal('fetch', fetchMock);
});

describe('the shell', () => {
  it('hides the wire panes when Dev Tools is turned off', async () => {
    render(() => <App />);
    typeMessage('Say hi');
    await send();
    expect(screen.getByRole('tab', { name: 'Response body' })).toBeTruthy();

    screen.getByText('Dev Tools').closest('button')!.click();

    expect(screen.queryByRole('tab', { name: 'Response body' })).toBeNull();
    expect(screen.getByText('Hello!')).toBeTruthy();
  });

  it('opens and closes the About dialog', () => {
    render(() => <App />);

    screen.getByText('About').click();
    expect(screen.getByRole('dialog')).toBeTruthy();

    screen.getByLabelText('Close').click();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers the report for sharing once there is a response', async () => {
    render(() => <App />);
    typeMessage('Say hi');
    await send();

    screen.getByRole('button', { name: 'Save' }).click();

    expect(screen.getByRole('dialog').textContent).toContain('Save to GitHub Gist');
    // The key is redacted before it can be pasted anywhere.
    expect(screen.getByRole('dialog').textContent).toContain('(none)');

    screen.getByLabelText('Close').click();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('jumps to the generated code', () => {
    render(() => <App />);
    screen.getByRole('tab', { name: /Headers/ }).click();

    screen.getByLabelText('Show this request as code').click();

    expect(screen.getByRole('tab', { name: /Client/ }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('global shortcuts', () => {
  const press = (key: string, mods: Partial<KeyboardEventInit> = {}) =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...mods }));

  it('sends from anywhere', async () => {
    render(() => <App />);
    typeMessage('Say hi');

    press('Enter', { metaKey: true });

    await vi.waitFor(() => expect(screen.getByText('200 OK')).toBeTruthy());
  });

  it('does not send from anywhere when there is nothing to send', () => {
    render(() => <App />);
    typeMessage('   ');

    press('Enter', { ctrlKey: true });

    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('opens a new request', () => {
    render(() => <App />);

    press('O', { metaKey: true, shiftKey: true });

    expect(composer().value).toBe('');
  });

  it('refocuses the message box', () => {
    render(() => <App />);
    (document.activeElement as HTMLElement | null)?.blur();

    press('Escape', { shiftKey: true });

    expect(document.activeElement).toBe(composer());
  });

  it('ignores keys it has no binding for', () => {
    render(() => <App />);
    const before = composer().value;

    press('k', { metaKey: true });

    expect(composer().value).toBe(before);
  });

  // The listener is on the document, so it has to go when the app unmounts.
  it('stops listening once the app unmounts', () => {
    const { unmount } = render(() => <App />);
    const remove = vi.spyOn(document, 'removeEventListener');

    unmount();

    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
