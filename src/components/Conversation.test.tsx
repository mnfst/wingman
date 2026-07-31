// The right pane: the empty state, the sent message, and the response
// inspector. The inspector is where a failure has to become actionable — a bare
// "Failed to fetch" is the thing the diagnostics exist to replace.
import { render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Conversation from './Conversation.jsx';
import AssistantMessage from './AssistantMessage.jsx';
import { openaiChat } from '../formats/openai-chat';
import type { SendResult } from '../send';

const result = (over: Partial<SendResult> = {}): SendResult => ({
  url: 'https://app.manifest.build/v1/chat/completions',
  status: 200,
  statusText: 'OK',
  ok: true,
  durationMs: 412.7,
  requestHeaders: { Authorization: 'Bearer mnfst_test' },
  requestBody: '{"model":"auto"}',
  responseHeaders: { 'content-type': 'application/json' },
  responseBody: '{"choices":[{"message":{"content":"hi"}}]}',
  responseJson: {
    model: 'gpt-4o',
    choices: [{ message: { content: 'hi' } }],
    usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
  },
  ...over,
});

type Props = Parameters<typeof Conversation>[0];

const props = (over: Partial<Props> = {}): Props => ({
  userMessage: 'hello',
  result: result(),
  loading: false,
  hasSent: true,
  format: openaiChat,
  streamingText: '',
  devTools: true,
  ...over,
});

describe('the empty pane', () => {
  it('shows the shortcuts until something is sent', () => {
    render(() => <Conversation {...props({ hasSent: false })} />);
    expect(screen.getByText('Send message')).toBeTruthy();
    expect(screen.getByText('New request')).toBeTruthy();
    expect(screen.queryByText('hello')).toBeNull();
  });
});

describe('the shortcut hints', () => {
  const original = Object.getOwnPropertyDescriptor(Navigator.prototype, 'platform');

  afterEach(() => {
    if (original) Object.defineProperty(Navigator.prototype, 'platform', original);
    vi.resetModules();
  });

  /** Re-import so the module-level platform check runs against the stub. */
  async function shortcutsFor(platform: string | undefined) {
    Object.defineProperty(Navigator.prototype, 'platform', {
      configurable: true,
      get: () => platform,
    });
    vi.resetModules();
    const Fresh = (await import('./Conversation.jsx')).default;
    render(() => <Fresh {...props({ hasSent: false })} />);
  }

  it.each([
    ['MacIntel', '⌘'],
    ['iPhone', '⌘'],
    ['Linux x86_64', 'Ctrl'],
  ])('labels the modifier on %s as %s', async (platform, expected) => {
    await shortcutsFor(platform);
    expect(screen.getAllByText(expected).length).toBeGreaterThan(0);
  });

  // Some browsers have already removed navigator.platform.
  it('falls back to Ctrl when the platform is unreported', async () => {
    await shortcutsFor(undefined);
    expect(screen.getAllByText('Ctrl').length).toBeGreaterThan(0);
  });
});

describe('the transcript', () => {
  it('shows the message that was sent and the reply', () => {
    render(() => <Conversation {...props()} />);
    expect(screen.getByText('hello')).toBeTruthy();
    expect(screen.getByText('hi')).toBeTruthy();
  });

  it('omits the user bubble when the request carried no message', () => {
    const { container } = render(() => <Conversation {...props({ userMessage: '' })} />);
    expect(container.querySelector('.user-msg')).toBeNull();
  });
});

describe('while a request is in flight', () => {
  it('says it is thinking before any token arrives', () => {
    render(() => <Conversation {...props({ loading: true, result: null })} />);
    expect(screen.getByText('Thinking…')).toBeTruthy();
  });

  it('renders the tokens as they stream in', () => {
    render(() => (
      <Conversation {...props({ loading: true, result: null, streamingText: 'partial' })} />
    ));
    expect(screen.getByText('partial')).toBeTruthy();
    expect(screen.queryByText('Thinking…')).toBeNull();
  });
});

describe('the response summary', () => {
  it('reports status, latency, tokens and the model that answered', () => {
    render(() => <AssistantMessage {...props()} />);
    expect(screen.getByText('200 OK')).toBeTruthy();
    expect(screen.getByText(/413 ms/)).toBeTruthy();
    expect(screen.getByText(/4 tok/)).toBeTruthy();
    expect(screen.getByText('(3 in / 1 out)')).toBeTruthy();
    expect(screen.getByText('gpt-4o')).toBeTruthy();
  });

  it('adds time to first token for a streamed response', () => {
    render(() => <AssistantMessage {...props({ result: result({ ttftMs: 88.4 }) })} />);
    expect(screen.getByText(/88 ms TTFT/)).toBeTruthy();
  });

  // Status 0 means the request never reached a server, so there is no code to
  // show — only the reason it never left.
  it('names the reason instead of a status code for a request that never landed', () => {
    render(() => (
      <AssistantMessage
        {...props({ result: result({ status: 0, statusText: 'Invalid base URL', ok: false }) })}
      />
    ));
    expect(screen.getByText('Invalid base URL')).toBeTruthy();
  });

  it('falls back to a generic label when even the reason is missing', () => {
    render(() => (
      <AssistantMessage {...props({ result: result({ status: 0, statusText: '', ok: false }) })} />
    ));
    expect(screen.getByText('Network error')).toBeTruthy();
  });

  it.each([
    ['ok', { status: 200, ok: true }],
    ['warn', { status: 401, ok: false }],
    ['error', { status: 503, ok: false }],
    ['error', { status: 0, ok: false }],
  ])('tones the status pill as %s', (tone, over) => {
    const { container } = render(() => <AssistantMessage {...props({ result: result(over) })} />);
    expect(container.querySelector(`.status-pill--${tone}`)).not.toBeNull();
  });

  it('leaves the token chip off when the response reports no usage', () => {
    render(() => <AssistantMessage {...props({ result: result({ responseJson: {} }) })} />);
    expect(screen.queryByText(/tok/)).toBeNull();
  });
});

describe('failure diagnostics', () => {
  // The two failures a browser-only tool hits most are not fixable on the
  // server, which is where an unqualified "CORS" guess used to send people.
  it('explains a blocked local-network request', () => {
    render(() => (
      <AssistantMessage
        {...props({
          result: result({
            url: 'http://localhost:3001/v1/chat/completions',
            status: 0,
            ok: false,
            error: 'Failed to fetch',
            errorKind: 'local-network',
          }),
        })}
      />
    ));
    expect(screen.getByText('Failed to fetch')).toBeTruthy();
    expect(screen.getByText(/Local Network Access permission/)).toBeTruthy();
  });

  // A request the user cancelled needs no explanation.
  it('says nothing extra about a cancelled request', () => {
    const { container } = render(() => (
      <AssistantMessage
        {...props({ result: result({ status: 0, ok: false, errorKind: 'aborted' }) })}
      />
    ));
    expect(container.querySelector('.assistant-msg__hint')).toBeNull();
  });
});

describe('the response panes', () => {
  it('starts on the assistant output', () => {
    render(() => <AssistantMessage {...props()} />);
    expect(screen.getByText('hi')).toBeTruthy();
  });

  it('says so when the response carries no assistant message', () => {
    render(() => (
      <AssistantMessage {...props({ result: result({ responseJson: { error: 'x' } }) })} />
    ));
    expect(screen.getByText(/No assistant message in this response/)).toBeTruthy();
  });

  it('falls back to the streamed text', () => {
    render(() => (
      <AssistantMessage
        {...props({ result: result({ responseJson: null, streamedText: 'streamed' }) })}
      />
    ));
    expect(screen.getByText('streamed')).toBeTruthy();
  });

  it.each([
    ['Response body', '"model": "gpt-4o"'],
    ['Response headers', 'content-type: application/json'],
    ['Request body', '{"model":"auto"}'],
    ['Request headers', 'Authorization: Bearer mnfst_test'],
  ])('shows the %s pane', (label, expected) => {
    const { container } = render(() => <AssistantMessage {...props()} />);

    screen.getByRole('tab', { name: label }).click();

    expect(container.querySelector('.assistant-msg__pane')?.textContent).toContain(expected);
  });

  // A stream has no single JSON body; the raw SSE is what there is to show.
  it('shows the raw SSE for a streamed response', () => {
    const { container } = render(() => (
      <AssistantMessage
        {...props({ result: result({ isStream: true, responseBody: 'data: {"a":1}' }) })}
      />
    ));

    screen.getByRole('tab', { name: 'Response body' }).click();

    expect(container.querySelector('.assistant-msg__pane')?.textContent).toContain('data:');
  });

  it('marks an empty stream and an empty body', () => {
    const { container, unmount } = render(() => (
      <AssistantMessage
        {...props({ result: result({ isStream: true, responseBody: '', responseJson: null }) })}
      />
    ));
    screen.getByRole('tab', { name: 'Response body' }).click();
    expect(container.querySelector('.assistant-msg__pane')?.textContent).toContain(
      '(empty stream)',
    );
    unmount();

    const second = render(() => (
      <AssistantMessage {...props({ result: result({ responseBody: '', responseJson: null }) })} />
    ));
    screen.getByRole('tab', { name: 'Response body' }).click();
    expect(second.container.querySelector('.assistant-msg__pane')?.textContent).toContain(
      '(empty body)',
    );
  });

  it('marks an empty header set', () => {
    const { container } = render(() => (
      <AssistantMessage {...props({ result: result({ responseHeaders: {} }) })} />
    ));
    screen.getByRole('tab', { name: 'Response headers' }).click();
    expect(container.querySelector('.assistant-msg__pane')?.textContent).toContain('(none)');
  });

  // With Dev Tools off there is no strip to change the pane, so the reply is
  // the only thing that can sensibly be shown.
  it('hides the wire panes when Dev Tools is off', () => {
    render(() => <AssistantMessage {...props({ devTools: false })} />);
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByText('hi')).toBeTruthy();
  });
});
