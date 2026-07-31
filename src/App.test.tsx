// The whole app, mounted, with only the network faked. These are the journeys
// a user actually takes — compose, send, read the wire, come back to it — and
// they are the only tests that would catch a component wired to the wrong bit
// of state.
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

/** Send and wait for the response pane to settle. */
async function send() {
  sendButton().click();
  await vi.waitFor(() => expect(screen.getByText('200 OK')).toBeTruthy());
}

/** The open response pane. Read as text: highlighting splits it across spans. */
const pane = () => document.querySelector('.assistant-msg__pane')!;

const requestBody = () => {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
  if (!call) throw new Error('no request was sent');
  return { url: call[0] as string, body: JSON.parse(call[1].body) };
};

beforeEach(() => {
  fetchMock.mockReset();
  // Only the send matters here; the background probes are allowed to fail.
  fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? Promise.resolve(reply())
      : Promise.reject(new TypeError('Failed to fetch')),
  );
  vi.stubGlobal('fetch', fetchMock);
});

describe('first run', () => {
  it('opens on an empty conversation with a message ready to send', () => {
    render(() => <App />);
    expect(screen.getByText('Send message')).toBeTruthy();
    expect(composer().value).toBe('Say hello in one short sentence.');
    expect((sendButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('will not send an empty message', () => {
    render(() => <App />);
    typeMessage('   ');
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('sending a request', () => {
  it('shows the reply and the wire behind it', async () => {
    render(() => <App />);
    typeMessage('Say hi');

    await send();

    expect(screen.getByText('Hello!')).toBeTruthy();
    expect(screen.getByText('gpt-4o')).toBeTruthy();
    expect(requestBody().body).toEqual({
      model: 'auto',
      messages: [{ role: 'user', content: 'Say hi' }],
    });

    screen.getByRole('tab', { name: 'Request body' }).click();
    expect(pane().textContent).toContain('"Say hi"');
  });

  it('turns the sent request into a tab you can come back to', async () => {
    render(() => <App />);
    typeMessage('first question');
    await send();

    // The draft became a history tab, and a new draft is not opened for you.
    const tabs = screen.getAllByRole('tab', { selected: true });
    expect(tabs.some((t) => t.textContent?.includes('first question'))).toBe(true);

    screen.getByLabelText('New request').click();
    expect(composer().value).toBe('');

    screen.getByText('first question').click();
    expect(composer().value).toBe('first question');
    expect(screen.getByText('Hello!')).toBeTruthy();
  });

  it('keeps each tab on its own draft message', async () => {
    render(() => <App />);
    typeMessage('tab one');

    screen.getByLabelText('New request').click();
    typeMessage('tab two');

    screen.getByText('tab one').click();
    expect(composer().value).toBe('tab one');
  });

  it('sends from the composer as well as the request bar', async () => {
    render(() => <App />);
    typeMessage('from the composer');

    screen.getByLabelText('Send message').click();

    await vi.waitFor(() => expect(screen.getByText('200 OK')).toBeTruthy());
    expect(requestBody().body.messages[0].content).toBe('from the composer');
  });

  it('closes a draft tab', () => {
    render(() => <App />);
    typeMessage('keep me');
    screen.getByLabelText('New request').click();

    screen.getAllByLabelText('Close this draft').at(-1)!.click();

    expect(composer().value).toBe('keep me');
  });

  it('deletes a sent request from the strip', async () => {
    render(() => <App />);
    typeMessage('delete me');
    await send();

    screen.getByLabelText('Close and delete this request').click();

    expect(screen.queryByText('delete me')).toBeNull();
    expect(screen.getByText('Send message')).toBeTruthy();
  });
});
