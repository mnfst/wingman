// The request bar: address, credential, model, Send. Two things matter beyond
// wiring: the key is never revealed unasked when the provider changes, and the
// health badge never claims more than the probe actually checked.
import { render, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import UrlBar from './UrlBar.jsx';
import { FORMATS } from '../formats';
import { PROVIDERS } from '../providers';
import type { HealthStatus } from '../services/healthCheck';

type Props = Parameters<typeof UrlBar>[0];

const props = (over: Partial<Props> = {}): Props => ({
  formats: FORMATS,
  activeFormatId: 'openai-chat',
  onSelectFormat: vi.fn(),
  providers: PROVIDERS,
  activeProviderId: 'custom',
  onSelectProvider: vi.fn(),
  baseUrl: 'https://app.manifest.build',
  onBaseUrlChange: vi.fn(),
  baseUrlPlaceholder: 'https://your-manifest.example.com',
  requestUrl: 'https://app.manifest.build/v1/chat/completions',
  apiKey: '',
  apiKeyPlaceholder: 'mnfst_...',
  onApiKeyChange: vi.fn(),
  model: 'auto',
  onModelChange: vi.fn(),
  modelList: [],
  healthStatus: { kind: 'idle' },
  loading: false,
  canSend: true,
  onSend: vi.fn(),
  willRunCode: false,
  canSave: false,
  onSaveToGist: vi.fn(),
  saveStatus: 'idle',
  onOpenCode: vi.fn(),
  ...over,
});

const keyInput = () => screen.getByLabelText('API key') as HTMLInputElement;

describe('the address and credential fields', () => {
  it('reports what is typed in the base URL', () => {
    const onBaseUrlChange = vi.fn();
    render(() => <UrlBar {...props({ onBaseUrlChange })} />);

    const input = screen.getByLabelText('Base URL') as HTMLInputElement;
    input.value = 'http://localhost:3001';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onBaseUrlChange).toHaveBeenCalledWith('http://localhost:3001');
  });

  it('shows the URL a send will actually POST to', () => {
    render(() => <UrlBar {...props()} />);
    expect(screen.getByLabelText('Base URL').title).toBe(
      'POST https://app.manifest.build/v1/chat/completions',
    );
  });

  it('reports a credential typed into the key field', () => {
    const onApiKeyChange = vi.fn();
    render(() => <UrlBar {...props({ onApiKeyChange })} />);

    keyInput().value = 'mnfst_typed';
    keyInput().dispatchEvent(new Event('input', { bubbles: true }));

    expect(onApiKeyChange).toHaveBeenCalledWith('mnfst_typed');
  });

  // The three embedded pickers each report through the bar, not around it.
  it('reports a format, provider and model chosen from the embedded pickers', () => {
    const onSelectFormat = vi.fn();
    const onSelectProvider = vi.fn();
    const onModelChange = vi.fn();
    render(() => (
      <UrlBar
        {...props({ onSelectFormat, onSelectProvider, onModelChange, modelList: ['auto'] })}
      />
    ));

    screen.getByRole('button', { name: /POST/ }).click();
    screen.getByText('Anthropic Messages').click();
    expect(onSelectFormat).toHaveBeenCalledWith('anthropic-messages');

    screen.getByRole('button', { name: /Provider preset/ }).click();
    screen.getByText('Groq').click();
    expect(onSelectProvider).toHaveBeenCalledWith('groq');

    screen.getByLabelText('Choose from available models').click();
    screen.getByRole('option', { name: 'auto' }).click();
    expect(onModelChange).toHaveBeenCalledWith('auto');
  });

  it('masks the key until it is revealed', () => {
    render(() => <UrlBar {...props({ apiKey: 'mnfst_secret' })} />);
    expect(keyInput().type).toBe('password');

    screen.getByLabelText('Show API key').click();

    expect(keyInput().type).toBe('text');
  });

  it('cannot reveal an empty key field', () => {
    render(() => <UrlBar {...props()} />);
    expect((screen.getByLabelText('Show API key') as HTMLButtonElement).disabled).toBe(true);
  });

  // A different provider means a different secret in the field.
  it('re-masks the key when the provider changes', () => {
    const [activeProviderId, setProviderId] = createSignal('custom');
    render(() => (
      <UrlBar {...props({ apiKey: 'mnfst_secret' })} activeProviderId={activeProviderId()} />
    ));
    screen.getByLabelText('Show API key').click();
    expect(keyInput().type).toBe('text');

    setProviderId('openai');

    expect(keyInput().type).toBe('password');
  });
});

describe('sending', () => {
  it('submits the form', () => {
    const onSend = vi.fn();
    render(() => <UrlBar {...props({ onSend })} />);

    screen.getByRole('button', { name: 'Send' }).click();

    expect(onSend).toHaveBeenCalled();
  });

  it('refuses to send when there is no message to send', () => {
    const onSend = vi.fn();
    const { container } = render(() => <UrlBar {...props({ canSend: false, onSend })} />);

    container
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send' }).title).toBe('Type a message below to send');
  });

  // Editing the snippet changes what Send does, so it has to change what Send
  // says: "Run", not "Send".
  it('reads as Run when the edited snippet will drive the request', () => {
    render(() => <UrlBar {...props({ willRunCode: true })} />);
    expect(screen.getByRole('button', { name: 'Run' }).title).toMatch(/Run edited SDK code/);
  });

  it('shows a spinner in place of the label while loading', () => {
    const { container } = render(() => <UrlBar {...props({ loading: true })} />);
    expect(container.querySelector('.urlbar__send .spinner')).not.toBeNull();
  });
});

describe('saving and the code jump', () => {
  // Always rendered so Send never shifts sideways when the first result lands.
  it('offers Save only once there is a result', () => {
    const { unmount } = render(() => <UrlBar {...props()} />);
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    unmount();

    render(() => <UrlBar {...props({ canSave: true })} />);
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('confirms the copy after saving', () => {
    render(() => <UrlBar {...props({ canSave: true, saveStatus: 'saved' })} />);
    expect(screen.getByRole('button', { name: 'Copied' }).title).toMatch(
      /Paste it into the GitHub/,
    );
  });

  it('blocks a second save while one is in flight', () => {
    render(() => <UrlBar {...props({ canSave: true, saveStatus: 'saving' })} />);
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('reports a failed save', () => {
    const { container } = render(() => (
      <UrlBar {...props({ canSave: true, saveStatus: 'error' })} />
    ));
    expect(container.querySelector('.urlbar__save--error')).not.toBeNull();
  });

  it('jumps to the generated code', () => {
    const onOpenCode = vi.fn();
    render(() => <UrlBar {...props({ onOpenCode })} />);

    screen.getByLabelText('Show this request as code').click();

    expect(onOpenCode).toHaveBeenCalled();
  });

  it('reports the save request', () => {
    const onSaveToGist = vi.fn();
    render(() => <UrlBar {...props({ canSave: true, onSaveToGist })} />);
    screen.getByRole('button', { name: 'Save' }).click();
    expect(onSaveToGist).toHaveBeenCalled();
  });
});

describe('the base URL hint line', () => {
  it('stays silent when nothing was normalised', () => {
    const { container } = render(() => <UrlBar {...props()} />);
    expect(container.querySelector('.urlbar__hint')).toBeNull();
  });

  // Pasting a full endpoint or a `/v1` base is the most common way to get a 404
  // out of a healthy gateway, so what normalisation did has to be visible.
  it('explains what normalisation changed', () => {
    render(() => <UrlBar {...props({ baseUrlNote: 'Removed a duplicate "/v1" segment.' })} />);
    expect(screen.getByText('Removed a duplicate "/v1" segment.')).toBeTruthy();
    expect(screen.getByText('https://app.manifest.build/v1/chat/completions')).toBeTruthy();
  });

  it('replaces the hint with the problem when the URL is unusable', () => {
    const { container } = render(() => (
      <UrlBar {...props({ baseUrlProblem: "That isn't a valid URL.", baseUrlNote: 'ignored' })} />
    ));
    expect(screen.getByText("That isn't a valid URL.")).toBeTruthy();
    expect(screen.queryByText('ignored')).toBeNull();
    expect(container.querySelector('.urlbar__url--invalid')).not.toBeNull();
  });
});

describe('the health badge', () => {
  it('is absent until a probe has run', () => {
    render(() => <UrlBar {...props()} />);
    expect(screen.getByLabelText('Gateway health').textContent).toBe('');
  });

  // A green badge only ever proves the health endpoint answered, so it names
  // the URL it probed rather than implying the send will work.
  it('names the probed URL when the gateway answers', () => {
    const status: HealthStatus = {
      kind: 'ok',
      latencyMs: 42,
      probedUrl: 'https://app.manifest.build/api/v1/health',
    };
    render(() => <UrlBar {...props({ healthStatus: status })} />);

    const badge = screen.getByText('healthy');
    expect(badge.title).toBe(
      'Health check succeeded in 42 ms. Probed https://app.manifest.build/api/v1/health',
    );
    expect(badge.className).toContain('health-badge--ok');
  });

  it.each<[string, HealthStatus, string]>([
    ['…', { kind: 'checking' }, 'health-badge--warn'],
    ['invalid URL', { kind: 'invalid', message: 'Base URL is empty.' }, 'health-badge--err'],
    [
      'local network blocked',
      {
        kind: 'failed',
        failure: 'local-network',
        label: 'local network blocked',
        message: 'blocked by the browser',
        probedUrl: 'http://localhost:3001/api/v1/health',
      },
      'health-badge--err',
    ],
    [
      'not a gateway',
      { kind: 'not-a-gateway', message: 'returned HTML', probedUrl: 'https://x.example.com' },
      'health-badge--err',
    ],
    [
      'HTTP 404',
      {
        kind: 'http-error',
        status: 404,
        statusText: 'Not Found',
        probedUrl: 'https://x.example.com',
      },
      'health-badge--err',
    ],
  ])('reads %s', (label, status, tone) => {
    render(() => <UrlBar {...props({ healthStatus: status })} />);
    const badge = screen.getByText(label);
    expect(badge.className).toContain(tone);
    expect(badge.title).not.toBe('');
  });
});
