// Reconfiguring the request from the UI: provider, format, credential, model,
// system prompt, headers, client, streaming, and the editable snippet.
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

/** The open response pane. Read as text: highlighting splits it across spans. */
const pane = () => document.querySelector('.assistant-msg__pane')!;

const requestBody = () => {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
  if (!call) throw new Error('no request was sent');
  return { url: call[0] as string, body: JSON.parse(call[1].body) };
};

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? Promise.resolve(reply())
      : Promise.reject(new TypeError('Failed to fetch')),
  );
  vi.stubGlobal('fetch', fetchMock);
});

describe('changing the request', () => {
  it('switches wire format, endpoint and body shape together', async () => {
    render(() => <App />);

    screen.getByRole('button', { name: /Provider preset/ }).click();
    screen.getByText('Anthropic').click();
    typeMessage('Say hi');

    await send();

    expect(requestBody().url).toBe('https://api.anthropic.com/v1/messages');
    expect(requestBody().body).toMatchObject({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'Say hi' }],
    });
  });

  it('sends the system prompt typed in the left pane', async () => {
    render(() => <App />);

    screen.getByRole('tab', { name: /System Prompt/ }).click();
    const prompt = screen.getByLabelText('System prompt') as HTMLTextAreaElement;
    prompt.value = 'Answer in French.';
    prompt.dispatchEvent(new Event('input', { bubbles: true }));

    typeMessage('Say hi');
    await send();

    expect(requestBody().body.messages[0]).toEqual({
      role: 'system',
      content: 'Answer in French.',
    });
  });

  it('sends a header added by hand', async () => {
    render(() => <App />);

    screen.getByRole('tab', { name: /Headers/ }).click();
    screen.getByText('+ Add header').click();
    // Re-queried between edits: each change rebuilds the row, so a reference
    // taken before the first edit points at a node that is no longer mounted.
    const fill = (placeholder: string, value: string) => {
      const input = screen.getByPlaceholderText(placeholder) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    fill('Header name', 'X-Trace');
    fill('Value', 'abc');

    typeMessage('Say hi');
    await send();

    screen.getByRole('tab', { name: 'Request headers' }).click();
    expect(pane().textContent).toContain('X-Trace: abc');
  });

  it('sends the credential and model typed into the request bar', async () => {
    render(() => <App />);

    const key = screen.getByLabelText('API key') as HTMLInputElement;
    key.value = 'mnfst_typed';
    key.dispatchEvent(new Event('input', { bubbles: true }));
    const model = screen.getByLabelText('Model') as HTMLInputElement;
    model.value = 'gpt-4o-mini';
    model.dispatchEvent(new Event('input', { bubbles: true }));

    typeMessage('Say hi');
    await send();

    expect(requestBody().body.model).toBe('gpt-4o-mini');
    screen.getByRole('tab', { name: 'Request headers' }).click();
    expect(pane().textContent).toContain('Bearer mnfst_typed');
  });

  // The format picker is the closest thing an LLM API has to an HTTP method.
  it('switches the endpoint from the format picker alone', async () => {
    render(() => <App />);

    screen.getByRole('button', { name: /POST/ }).click();
    screen.getByText('OpenAI Responses').click();
    typeMessage('Say hi');

    await send();

    expect(requestBody().url).toContain('/v1/responses');
    expect(requestBody().body).toMatchObject({ input: 'Say hi' });
  });

  it('streams when the toggle is on', async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method !== 'POST') return Promise.reject(new TypeError('Failed to fetch'));
      const sse = 'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n';
      const encoder = new TextEncoder();
      return Promise.resolve({
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        text: () => Promise.resolve(sse),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(sse));
            controller.close();
          },
        }),
      } as unknown as Response);
    });
    render(() => <App />);

    screen.getByRole('switch').click();
    typeMessage('Say hi');
    await send();

    expect(requestBody().body.stream).toBe(true);
    expect(screen.getByText('Hi')).toBeTruthy();
  });

  // Editing the snippet takes over the request; resetting hands it back.
  it('runs the edited snippet, then goes back to the form on reset', async () => {
    render(() => <App />);
    screen.getByRole('button', { name: /Default/ }).click();
    screen.getByText('OpenAI SDK').click();

    const editor = () => document.querySelector('.code-view__textarea') as HTMLTextAreaElement;
    editor().value =
      'await new OpenAI({ baseURL: "https://snippet.example.com/v1" }).chat.completions.create({ model: "from-code", messages: [] });';
    editor().dispatchEvent(new Event('input', { bubbles: true }));

    typeMessage('Say hi');
    expect(screen.getByRole('button', { name: 'Run' })).toBeTruthy();
    screen.getByRole('button', { name: 'Run' }).click();
    await vi.waitFor(() => expect(screen.getByText('200 OK')).toBeTruthy());
    expect(requestBody().url).toBe('https://snippet.example.com/v1/chat/completions');

    screen.getByText('Reset').click();

    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
  });

  it('regenerates the snippet for the language picked', () => {
    render(() => <App />);
    screen.getByRole('button', { name: /Default/ }).click();
    screen.getByText('OpenAI SDK').click();

    screen.getByRole('tab', { name: 'python' }).click();

    const editor = document.querySelector('.code-view__textarea') as HTMLTextAreaElement;
    expect(editor.value).toContain('from openai import OpenAI');
  });

  // The Code panel is the part people screenshot, so the key is an env-var
  // reference until they ask for the real thing.
  it('keeps the key out of the snippet until it is revealed', () => {
    render(() => <App />);
    const key = screen.getByLabelText('API key') as HTMLInputElement;
    key.value = 'mnfst_live_secret';
    key.dispatchEvent(new Event('input', { bubbles: true }));

    const editor = () => document.querySelector('.code-view__textarea') as HTMLTextAreaElement;
    expect(editor().value).not.toContain('mnfst_live_secret');

    screen.getByText('Reveal key').click();

    expect(editor().value).toContain('mnfst_live_secret');
    expect(screen.getByText('Hide key')).toBeTruthy();
  });

  // Switching client swaps the fingerprint headers and the captured prompt.
  it('sends as the selected client', async () => {
    render(() => <App />);

    screen.getByRole('button', { name: /Default/ }).click();
    screen.getByText('OpenClaw').click();

    typeMessage('Say hi');
    await send();

    expect(requestBody().body.max_completion_tokens).toBe(8192);
    expect(requestBody().body.messages[0].role).toBe('system');
  });
});

describe('the request never leaving the browser', () => {
  // A base URL that cannot be resolved used to reach `fetch`, which resolved a
  // schemeless value against Wingman's own origin, shipping the key elsewhere.
  it('explains an unusable base URL instead of sending', async () => {
    render(() => <App />);

    const baseUrl = screen.getByLabelText('Base URL') as HTMLInputElement;
    baseUrl.value = '   ';
    baseUrl.dispatchEvent(new Event('input', { bubbles: true }));
    typeMessage('Say hi');
    sendButton().click();

    await vi.waitFor(() => expect(screen.getByText('Invalid base URL')).toBeTruthy());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('explains a request the browser refused to make', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(() => <App />);
    typeMessage('Say hi');

    sendButton().click();

    await vi.waitFor(() => expect(screen.getByText('Failed to fetch')).toBeTruthy());
    expect(screen.getByText(/The browser reports connection failures/)).toBeTruthy();
  });
});
