// The four URL-bar pickers. They share the dismiss primitive (tested on its
// own), so what is checked here is each one's own contract: what it shows for
// the active item, what it lists, and what it reports on selection.
import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import FormatDropdown from './FormatDropdown.jsx';
import ProviderDropdown from './ProviderDropdown.jsx';
import ClientSelect, { categoryTag } from './ClientSelect.jsx';
import ModelSelect from './ModelSelect.jsx';
import { FORMATS } from '../formats';
import { PROVIDERS, PROVIDER_BY_ID } from '../providers';
import { PROFILE_BY_ID, profilesForFormat } from '../profiles';

const type = (input: HTMLElement, value: string) => {
  (input as HTMLInputElement).value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('FormatDropdown', () => {
  it('shows POST and the active format path', () => {
    render(() => (
      <FormatDropdown formats={FORMATS} activeId="anthropic-messages" onSelect={vi.fn()} />
    ));
    expect(screen.getByText('POST')).toBeTruthy();
    expect(screen.getByText('/v1/messages')).toBeTruthy();
  });

  it('lists every format and reports the one picked', () => {
    const onSelect = vi.fn();
    render(() => <FormatDropdown formats={FORMATS} activeId="openai-chat" onSelect={onSelect} />);

    screen.getByRole('button', { name: /POST/ }).click();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(FORMATS.length);

    screen.getByText('Anthropic Messages').click();

    expect(onSelect).toHaveBeenCalledWith('anthropic-messages');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('marks the active format as selected', () => {
    render(() => (
      <FormatDropdown formats={FORMATS} activeId="openai-responses" onSelect={vi.fn()} />
    ));
    screen.getByRole('button', { name: /POST/ }).click();
    const selected = screen
      .getAllByRole('option')
      .filter((o) => o.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]?.textContent).toContain('OpenAI Responses');
  });

  // The catalog can outlive a stored id; falling back beats rendering nothing.
  it('falls back to the first format for an id it does not know', () => {
    render(() => <FormatDropdown formats={FORMATS} activeId="retired" onSelect={vi.fn()} />);
    expect(screen.getByText('/v1/chat/completions')).toBeTruthy();
  });
});

describe('ProviderDropdown', () => {
  it('lists every preset and reports the one picked', () => {
    const onSelect = vi.fn();
    render(() => <ProviderDropdown providers={PROVIDERS} activeId="custom" onSelect={onSelect} />);

    screen.getByRole('button', { name: /Provider preset/ }).click();
    expect(screen.getAllByRole('option')).toHaveLength(PROVIDERS.length);

    screen.getByText('Anthropic').click();

    expect(onSelect).toHaveBeenCalledWith('anthropic');
  });

  it('shows the active preset in the button title', () => {
    render(() => <ProviderDropdown providers={PROVIDERS} activeId="groq" onSelect={vi.fn()} />);
    expect(screen.getByRole('button').title).toContain(PROVIDER_BY_ID['groq']?.name);
  });

  it('falls back to the first preset for an id it does not know', () => {
    render(() => <ProviderDropdown providers={PROVIDERS} activeId="retired" onSelect={vi.fn()} />);
    expect(screen.getByRole('button').title).toContain('Custom / Manifest');
  });
});

describe('ClientSelect', () => {
  const profiles = profilesForFormat('openai-chat');

  it('shows the active client with its category tag', () => {
    render(() => <ClientSelect profiles={profiles} activeId="openclaw" onSelect={vi.fn()} />);
    expect(screen.getByText('OpenClaw')).toBeTruthy();
    expect(screen.getAllByText('Agent').length).toBeGreaterThan(0);
  });

  it('lists the compatible clients and reports the one picked', () => {
    const onSelect = vi.fn();
    render(() => <ClientSelect profiles={profiles} activeId="default" onSelect={onSelect} />);

    screen.getByRole('button').click();
    expect(screen.getAllByRole('option')).toHaveLength(profiles.length);

    screen.getByText('LangChain').click();

    expect(onSelect).toHaveBeenCalledWith('langchain');
  });

  it('falls back to the first client for an id it does not know', () => {
    render(() => <ClientSelect profiles={profiles} activeId="retired" onSelect={vi.fn()} />);
    expect(screen.getByRole('button').textContent).toContain(profiles[0]?.label);
  });

  it.each([
    ['openclaw', 'Agent'],
    ['openai-sdk', 'SDK'],
    ['default', 'HTTP'],
  ])('tags %s as %s', (id, tag) => {
    expect(categoryTag(PROFILE_BY_ID[id]!)).toBe(tag);
  });
});

describe('ModelSelect', () => {
  // Any model id has to work, catalog or not. Plenty of endpoints will not
  // list theirs to a browser.
  it('stays a plain free-text field when the catalog is unavailable', () => {
    const onChange = vi.fn();
    render(() => <ModelSelect value="auto" onChange={onChange} models={[]} />);

    const input = screen.getByLabelText('Model');
    type(input, 'my-model');

    expect(onChange).toHaveBeenCalledWith('my-model');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByLabelText('Choose from available models')).toBeNull();
  });

  it('offers the catalog behind the chevron', () => {
    const onChange = vi.fn();
    render(() => <ModelSelect value="auto" onChange={onChange} models={['auto', 'gpt-4o']} />);

    screen.getByLabelText('Choose from available models').click();
    expect(screen.getAllByRole('option')).toHaveLength(2);

    screen.getByText('gpt-4o').click();

    expect(onChange).toHaveBeenCalledWith('gpt-4o');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes again on a second click of the chevron', () => {
    render(() => <ModelSelect value="auto" onChange={vi.fn()} models={['auto']} />);
    const toggle = screen.getByLabelText('Choose from available models');

    toggle.click();
    toggle.click();

    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('filters the list as the user types', () => {
    render(() => (
      <ModelSelect value="gpt" onChange={vi.fn()} models={['auto', 'gpt-4o', 'gpt-4o-mini']} />
    ));

    type(screen.getByLabelText('Model'), 'gpt');

    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'gpt-4o',
      'gpt-4o-mini',
    ]);
  });

  // Typing something no model matches should not leave an empty popover
  // covering the field.
  it('hides the menu when nothing matches', () => {
    render(() => <ModelSelect value="zzz" onChange={vi.fn()} models={['auto']} />);
    type(screen.getByLabelText('Model'), 'zzz');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('shows the whole catalog again once the field is cleared', () => {
    render(() => <ModelSelect value="" onChange={vi.fn()} models={['auto', 'gpt-4o']} />);
    type(screen.getByLabelText('Model'), '   ');
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('shows the whole catalog when opened by the chevron, whatever is typed', () => {
    render(() => <ModelSelect value="gpt" onChange={vi.fn()} models={['auto', 'gpt-4o']} />);
    screen.getByLabelText('Choose from available models').click();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('marks the current value as the selected option', () => {
    render(() => <ModelSelect value="auto" onChange={vi.fn()} models={['auto', 'gpt-4o']} />);
    screen.getByLabelText('Choose from available models').click();
    const selected = screen
      .getAllByRole('option')
      .filter((o) => o.getAttribute('aria-selected') === 'true');
    expect(selected.map((o) => o.textContent)).toEqual(['auto']);
  });
});
