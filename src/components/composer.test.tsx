// The message box and the editable code view: the two places the user types
// something the request is built from.
import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import ChatComposer from './ChatComposer.jsx';
import CodeView from './CodeView.jsx';

describe('ChatComposer', () => {
  const composerProps = (over = {}) => ({
    userMessage: 'hello',
    onUserMessageChange: vi.fn(),
    loading: false,
    onSend: vi.fn(),
    willRunCode: false,
    ...over,
  });

  it('reports what is typed', () => {
    const onUserMessageChange = vi.fn();
    render(() => <ChatComposer {...composerProps({ onUserMessageChange })} />);

    const textarea = screen.getByLabelText('User message') as HTMLTextAreaElement;
    textarea.value = 'typed';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onUserMessageChange).toHaveBeenCalledWith('typed');
  });

  // Chat convention: Enter sends, Shift+Enter inserts a newline.
  it('sends on Enter but not on Shift+Enter', () => {
    const onSend = vi.fn();
    render(() => <ChatComposer {...composerProps({ onSend })} />);
    const textarea = screen.getByLabelText('User message');

    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
    );
    expect(onSend).not.toHaveBeenCalled();

    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onSend).toHaveBeenCalledOnce();
  });

  it('does not send an empty message', () => {
    const onSend = vi.fn();
    render(() => <ChatComposer {...composerProps({ userMessage: '   ', onSend })} />);

    screen
      .getByLabelText('User message')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onSend).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Send message') as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not send while a request is already in flight', () => {
    const onSend = vi.fn();
    const { container } = render(() => (
      <ChatComposer {...composerProps({ loading: true, onSend })} />
    ));

    container
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(onSend).not.toHaveBeenCalled();
    expect(container.querySelector('.spinner')).not.toBeNull();
  });

  it('submits the form', () => {
    const onSend = vi.fn();
    const { container } = render(() => <ChatComposer {...composerProps({ onSend })} />);

    container
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(onSend).toHaveBeenCalled();
  });

  it('reads as Run when the edited snippet will drive the request', () => {
    render(() => <ChatComposer {...composerProps({ willRunCode: true })} />);
    expect(screen.getByLabelText('Run code').title).toMatch(/Run edited SDK code/);
  });

  // ChatGPT-style: the box grows with the content, including when a tab switch
  // drops a long message into it.
  it('grows to fit the message', () => {
    const textarea = () => screen.getByLabelText('User message') as HTMLTextAreaElement;
    render(() => <ChatComposer {...composerProps({ userMessage: 'one\ntwo\nthree' })} />);
    expect(textarea().style.height).toMatch(/px$/);
  });
});

describe('CodeView', () => {
  it('renders read-only code with no editor', () => {
    const { container } = render(() => <CodeView code="const a = 1;" language="typescript" />);
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelector('code')?.textContent).toContain('const a = 1;');
  });

  it('reports an edit when it is editable', () => {
    const onChange = vi.fn();
    const { container } = render(() => (
      <CodeView code="const a = 1;" language="typescript" editable onChange={onChange} />
    ));

    const textarea = container.querySelector('textarea')!;
    textarea.value = 'const b = 2;';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith('const b = 2;');
  });

  it('copies the code and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(() => <CodeView code="const a = 1;" language="typescript" />);

    screen.getByText('Copy').click();
    await vi.waitFor(() => expect(screen.getByText('Copied')).toBeTruthy());

    expect(writeText).toHaveBeenCalledWith('const a = 1;');
  });

  it('stays quiet when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(() => <CodeView code="const a = 1;" language="typescript" />);

    screen.getByText('Copy').click();
    await Promise.resolve();

    expect(screen.getByText('Copy')).toBeTruthy();
  });

  // Without the pad, the caret on a trailing empty line drifts above the box.
  it('pads a trailing newline so the last line stays visible', () => {
    const { container } = render(() => (
      <CodeView code={'const a = 1;\n'} language="typescript" editable onChange={vi.fn()} />
    ));
    expect(container.querySelector('code')?.textContent?.endsWith(' ')).toBe(true);
  });

  it('mirrors the textarea scroll onto the highlighted layer', () => {
    const { container } = render(() => (
      <CodeView code="const a = 1;" language="typescript" editable onChange={vi.fn()} />
    ));
    const textarea = container.querySelector('textarea')!;
    const pre = container.querySelector('.code-view__pre--bg') as HTMLPreElement;

    textarea.scrollTop = 40;
    textarea.scrollLeft = 12;
    textarea.dispatchEvent(new Event('scroll', { bubbles: true }));

    expect(pre.scrollTop).toBe(40);
    expect(pre.scrollLeft).toBe(12);
  });
});
