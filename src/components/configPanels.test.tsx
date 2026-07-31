// The two panels the config pane hosts: the header table and the snippet.
import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import HeaderEditor from './HeaderEditor.jsx';
import CodePanel from './CodePanel.jsx';

describe('HeaderEditor', () => {
  it('reports a renamed header and a retyped value', () => {
    const onChange = vi.fn();
    render(() => (
      <HeaderEditor entries={[{ key: 'X-Test', value: '1' }]} onChange={onChange} blocked={[]} />
    ));

    const [name, value] = screen.getAllByRole('textbox') as HTMLInputElement[];
    name!.value = 'X-Renamed';
    name!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenLastCalledWith([{ key: 'X-Renamed', value: '1' }]);

    value!.value = '2';
    value!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenLastCalledWith([{ key: 'X-Test', value: '2' }]);
  });

  it('adds and removes rows', () => {
    const onChange = vi.fn();
    render(() => (
      <HeaderEditor entries={[{ key: 'X-Test', value: '1' }]} onChange={onChange} blocked={[]} />
    ));

    screen.getByText('+ Add header').click();
    expect(onChange).toHaveBeenLastCalledWith([
      { key: 'X-Test', value: '1' },
      { key: '', value: '' },
    ]);

    screen.getByLabelText('Remove header X-Test').click();
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  // With one row the "leave the others alone" arm of the update never runs.
  it('leaves the other rows untouched when one is edited', () => {
    const onChange = vi.fn();
    render(() => (
      <HeaderEditor
        entries={[
          { key: 'X-One', value: '1' },
          { key: 'X-Two', value: '2' },
        ]}
        onChange={onChange}
        blocked={[]}
      />
    ));

    const [, , second] = screen.getAllByRole('textbox') as HTMLInputElement[];
    second!.value = 'X-Renamed';
    second!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onChange).toHaveBeenLastCalledWith([
      { key: 'X-One', value: '1' },
      { key: 'X-Renamed', value: '2' },
    ]);
  });

  it('names a blank row by its position', () => {
    render(() => (
      <HeaderEditor entries={[{ key: '', value: '' }]} onChange={vi.fn()} blocked={[]} />
    ));
    expect(screen.getByLabelText('Remove header row 1')).toBeTruthy();
  });

  // Header names are case-insensitive on the wire, so the warning has to be too.
  it('flags a blocked header whatever its casing', () => {
    const { container } = render(() => (
      <HeaderEditor
        entries={[{ key: 'user-agent', value: 'x' }]}
        onChange={vi.fn()}
        blocked={['User-Agent']}
      />
    ));
    expect(container.querySelector('.header-editor__row--blocked')).not.toBeNull();
    expect(screen.getByText('User-Agent')).toBeTruthy();
  });

  it('says nothing when no header is blocked', () => {
    const { container } = render(() => (
      <HeaderEditor entries={[{ key: 'X-Ok', value: '1' }]} onChange={vi.fn()} blocked={[]} />
    ));
    expect(container.querySelector('.header-editor__warning')).toBeNull();
  });
});

describe('CodePanel', () => {
  const panelProps = (over = {}) => ({
    code: 'const a = 1;',
    lang: 'typescript' as const,
    langOptions: ['typescript', 'python'] as const,
    onLangChange: vi.fn(),
    onCodeChange: vi.fn(),
    isEdited: false,
    onReset: vi.fn(),
    executable: true,
    keyHidden: true,
    onToggleKey: vi.fn(),
    keyEnvName: 'MANIFEST_API_KEY',
    hasKey: true,
    ...over,
  });

  it('marks a runnable snippet and explains what Send will do', () => {
    render(() => <CodePanel {...panelProps()} />);
    expect(screen.getByText('runnable')).toBeTruthy();
    expect(screen.getByText(/Send will run the snippet instead/)).toBeTruthy();
  });

  it('marks a preview-only snippet', () => {
    render(() => <CodePanel {...panelProps({ executable: false })} />);
    expect(screen.getByText('preview only')).toBeTruthy();
    expect(screen.getByText(/change either one and the other follows/)).toBeTruthy();
  });

  it('offers a reset once the snippet is edited', () => {
    const onReset = vi.fn();
    render(() => <CodePanel {...panelProps({ isEdited: true, onReset })} />);
    expect(screen.getByText('edited')).toBeTruthy();

    screen.getByText('Reset').click();

    expect(onReset).toHaveBeenCalled();
  });

  it('switches language, labelling bash as cURL', () => {
    const onLangChange = vi.fn();
    render(() => (
      <CodePanel {...panelProps({ langOptions: ['bash', 'typescript'], onLangChange })} />
    ));

    screen.getByRole('tab', { name: 'cURL' }).click();

    expect(onLangChange).toHaveBeenCalledWith('bash');
  });

  it('reports an edit to the snippet', () => {
    const onCodeChange = vi.fn();
    const { container } = render(() => <CodePanel {...panelProps({ onCodeChange })} />);

    const textarea = container.querySelector('textarea')!;
    textarea.value = 'const b = 2;';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onCodeChange).toHaveBeenCalledWith('const b = 2;');
  });

  // The Code panel is the part people screenshot, so the key is an env-var
  // reference until they explicitly ask for the real thing.
  it('names the env var the snippet reads, and offers to reveal the key', () => {
    const onToggleKey = vi.fn();
    render(() => <CodePanel {...panelProps({ onToggleKey })} />);

    expect(screen.getByText(/safe to paste into an issue/)).toBeTruthy();
    expect(screen.getAllByText('MANIFEST_API_KEY').length).toBeGreaterThan(0);

    screen.getByText('Reveal key').click();

    expect(onToggleKey).toHaveBeenCalled();
  });

  it('offers to hide it again once revealed', () => {
    render(() => <CodePanel {...panelProps({ keyHidden: false })} />);
    expect(screen.getByText('Hide key').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText(/safe to paste into an issue/)).toBeNull();
  });

  // Nothing to hide, so no toggle to press.
  it('drops the toggle when there is no key', () => {
    render(() => <CodePanel {...panelProps({ hasKey: false })} />);
    expect(screen.queryByText('Reveal key')).toBeNull();
  });

  it('hides the language toggle when there is only one', () => {
    render(() => <CodePanel {...panelProps({ langOptions: ['typescript'] })} />);
    expect(screen.queryByLabelText('Code language')).toBeNull();
  });
});
