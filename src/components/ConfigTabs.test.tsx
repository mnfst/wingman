// The left pane: one facet of the request per tab, plus the stream toggle.
import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import ConfigTabs from './ConfigTabs.jsx';
import { profilesForFormat } from '../profiles';

type Props = Parameters<typeof ConfigTabs>[0];

const props = (over: Partial<Props> = {}): Props => ({
  tab: 'client',
  onTabChange: vi.fn(),
  profiles: profilesForFormat('openai-chat'),
  activeProfileId: 'default',
  onSelectProfile: vi.fn(),
  headers: [{ key: 'X-Test', value: '1' }],
  onHeadersChange: vi.fn(),
  onResetHeaders: vi.fn(),
  blockedHeaders: [],
  headersLocked: false,
  systemPrompt: '',
  onSystemPromptChange: vi.fn(),
  sdkCode: 'curl -sS https://example.com',
  sdkLang: 'bash',
  sdkLangOptions: ['bash', 'typescript'],
  onSdkLangChange: vi.fn(),
  onSdkCodeChange: vi.fn(),
  sdkCodeIsEdited: false,
  onResetSdkCode: vi.fn(),
  sdkExecutable: false,
  stream: false,
  onStreamChange: vi.fn(),
  ...over,
});

describe('the tab strip', () => {
  it('reports the tab that was clicked', () => {
    const onTabChange = vi.fn();
    render(() => <ConfigTabs {...props({ onTabChange })} />);

    screen.getByRole('tab', { name: /Headers/ }).click();

    expect(onTabChange).toHaveBeenCalledWith('headers');
  });

  // Tablist keyboard contract: arrows move and activate, and the ends wrap.
  it.each([
    ['ArrowRight', 'client', 'headers'],
    ['ArrowLeft', 'client', 'system'],
    ['ArrowRight', 'system', 'client'],
    ['ArrowLeft', 'headers', 'client'],
  ])('moves %s from %s to %s', (key, from, to) => {
    const onTabChange = vi.fn();
    const { container } = render(() => (
      <ConfigTabs {...props({ tab: from as Props['tab'], onTabChange })} />
    ));

    container
      .querySelector('.config__tablist')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

    expect(onTabChange).toHaveBeenCalledWith(to);
  });

  it('ignores keys that are not arrows', () => {
    const onTabChange = vi.fn();
    const { container } = render(() => <ConfigTabs {...props({ onTabChange })} />);

    container
      .querySelector('.config__tablist')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('keeps only the active tab in the tab order', () => {
    render(() => <ConfigTabs {...props({ tab: 'headers' })} />);
    const focusable = screen.getAllByRole('tab').filter((t) => t.getAttribute('tabindex') === '0');
    expect(focusable.map((t) => t.textContent)).toEqual(['Headers(1)']);
  });

  it('counts the headers and the system prompt on their tabs', () => {
    render(() => <ConfigTabs {...props({ systemPrompt: 'be terse' })} />);
    expect(screen.getByRole('tab', { name: /Headers/ }).textContent).toContain('(1)');
    expect(screen.getByRole('tab', { name: /System Prompt/ }).textContent).toContain('(8)');
  });

  it('does not count a blank header row', () => {
    render(() => <ConfigTabs {...props({ headers: [{ key: '  ', value: '' }] })} />);
    expect(screen.getByRole('tab', { name: /Headers/ }).textContent).not.toContain('(');
  });

  // The browser will silently drop these; the strip has to say so from any tab.
  it('warns on the Headers tab about headers the browser will drop', () => {
    render(() => <ConfigTabs {...props({ blockedHeaders: ['User-Agent'] })} />);
    expect(screen.getByTitle('1 header(s) will be dropped by the browser')).toBeTruthy();
  });

  it('marks the Client tab when the snippet has been edited', () => {
    const { container } = render(() => <ConfigTabs {...props({ sdkCodeIsEdited: true })} />);
    expect(container.querySelector('.config__tab-edited')).not.toBeNull();
  });
});

describe('the stream toggle', () => {
  it('reports the flip', () => {
    const onStreamChange = vi.fn();
    render(() => <ConfigTabs {...props({ onStreamChange })} />);

    screen.getByRole('switch').click();

    expect(onStreamChange).toHaveBeenCalledWith(true);
  });

  it('reflects the current setting', () => {
    render(() => <ConfigTabs {...props({ stream: true })} />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });
});

describe('the Client tab', () => {
  it('describes the selected client', () => {
    render(() => <ConfigTabs {...props()} />);
    expect(screen.getByText(/No client fingerprint/)).toBeTruthy();
  });

  it('explains what a fingerprint client is simulating', () => {
    render(() => <ConfigTabs {...props({ activeProfileId: 'openclaw' })} />);
    expect(screen.getByText(/classifies this the same way/)).toBeTruthy();
  });

  it('falls back to the first client for an id it does not know', () => {
    render(() => <ConfigTabs {...props({ activeProfileId: 'retired' })} />);
    expect(screen.getByText(/Sends OpenClaw's system prompt/)).toBeTruthy();
  });
});

describe('the Client tab code panel', () => {
  it('passes an edit and a language change up', () => {
    const onSdkCodeChange = vi.fn();
    const onSdkLangChange = vi.fn();
    const { container } = render(() => (
      <ConfigTabs {...props({ onSdkCodeChange, onSdkLangChange })} />
    ));

    const textarea = container.querySelector('.code-view__textarea') as HTMLTextAreaElement;
    textarea.value = 'curl -sS https://elsewhere.example.com';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onSdkCodeChange).toHaveBeenCalledWith('curl -sS https://elsewhere.example.com');

    screen.getByRole('tab', { name: 'typescript' }).click();
    expect(onSdkLangChange).toHaveBeenCalledWith('typescript');
  });

  it('offers a reset once the snippet is edited', () => {
    const onResetSdkCode = vi.fn();
    render(() => <ConfigTabs {...props({ sdkCodeIsEdited: true, onResetSdkCode })} />);

    screen.getByText('Reset').click();

    expect(onResetSdkCode).toHaveBeenCalled();
  });
});

describe('the Headers tab', () => {
  it('edits the headers when the client allows it', () => {
    render(() => <ConfigTabs {...props({ tab: 'headers' })} />);
    expect(screen.getByDisplayValue('X-Test')).toBeTruthy();
    expect(screen.getByText('+ Add header')).toBeTruthy();
  });

  it('resets them to the client defaults', () => {
    const onResetHeaders = vi.fn();
    render(() => <ConfigTabs {...props({ tab: 'headers', onResetHeaders })} />);

    screen.getByText('Reset to client defaults').click();

    expect(onResetHeaders).toHaveBeenCalled();
  });

  // Editing a fingerprint client's headers would defeat the simulation, so
  // they are shown read-only instead.
  it('shows them read-only for a fingerprint client', () => {
    render(() => <ConfigTabs {...props({ tab: 'headers', headersLocked: true })} />);
    expect(screen.getByText('X-Test')).toBeTruthy();
    expect(screen.queryByText('+ Add header')).toBeNull();
  });

  it('leaves blank rows out of the read-only list', () => {
    const { container } = render(() => (
      <ConfigTabs
        {...props({
          tab: 'headers',
          headersLocked: true,
          headers: [
            { key: 'X-Test', value: '1' },
            { key: '', value: '' },
          ],
        })}
      />
    ));
    expect(container.querySelectorAll('.headers-locked__row')).toHaveLength(1);
  });
});

describe('the System Prompt tab', () => {
  it('reports what is typed', () => {
    const onSystemPromptChange = vi.fn();
    render(() => <ConfigTabs {...props({ tab: 'system', onSystemPromptChange })} />);

    const textarea = screen.getByLabelText('System prompt') as HTMLTextAreaElement;
    textarea.value = 'be terse';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onSystemPromptChange).toHaveBeenCalledWith('be terse');
  });
});
