// Both dialogs make the same three promises: Escape closes, focus moves in and
// comes back out, and a click on the backdrop dismisses while a click inside
// does not.
import { createSignal } from 'solid-js';
import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import GistModal from './GistModal.jsx';
import AboutModal from './AboutModal.jsx';
import StatusBar from './StatusBar.jsx';
import TitleBar from './TitleBar.jsx';
import { DOES, DOES_NOT, ECOSYSTEM, TAGLINE } from '../content/about';

const escape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

const clickBackdrop = (selector: string) => {
  const backdrop = document.querySelector(selector)!;
  backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

describe('GistModal', () => {
  const markdown = '# Manifest Wingman — request report';

  it('stays out of the DOM until it is opened', () => {
    render(() => <GistModal open={false} markdown={markdown} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('previews the report', () => {
    render(() => <GistModal open markdown={markdown} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog').textContent).toContain('Manifest Wingman');
    expect(screen.getByText(/Your API key is redacted/)).toBeTruthy();
  });

  it('closes on Escape, on the close button and on the backdrop', () => {
    const onClose = vi.fn();
    const [open, setOpen] = createSignal(true);
    render(() => <GistModal open={open()} markdown={markdown} onClose={onClose} />);

    escape();
    expect(onClose).toHaveBeenCalledTimes(1);

    screen.getByLabelText('Close').click();
    expect(onClose).toHaveBeenCalledTimes(2);

    clickBackdrop('.gist-modal__overlay');
    expect(onClose).toHaveBeenCalledTimes(3);

    setOpen(false);
  });

  it('ignores a click inside the dialog', () => {
    const onClose = vi.fn();
    render(() => <GistModal open markdown={markdown} onClose={onClose} />);

    document
      .querySelector('.gist-modal')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onClose).not.toHaveBeenCalled();
  });

  // The listener must not outlive the dialog, or Escape keeps firing onClose
  // from anywhere in the app.
  it('stops listening for Escape once closed', () => {
    const onClose = vi.fn();
    const [open, setOpen] = createSignal(true);
    render(() => <GistModal open={open()} markdown={markdown} onClose={onClose} />);

    setOpen(false);
    escape();

    expect(onClose).not.toHaveBeenCalled();
  });

  it('moves focus into the dialog and hands it back on close', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const [open, setOpen] = createSignal(false);
    render(() => <GistModal open={open()} markdown={markdown} onClose={() => setOpen(false)} />);

    setOpen(true);
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Close')));

    screen.getByLabelText('Close').click();

    expect(document.activeElement).toBe(opener);
  });

  it('copies the report to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(() => <GistModal open markdown={markdown} onClose={vi.fn()} />);

    screen.getByText('Copy markdown').click();

    await vi.waitFor(() => expect(screen.getByText('Copied')).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith(markdown);
  });

  it('reports a refused copy instead of falsely confirming', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    });
    render(() => <GistModal open markdown={markdown} onClose={vi.fn()} />);

    screen.getByText('Copy markdown').click();

    await vi.waitFor(() =>
      expect(screen.getByText('Browser denied the copy command.')).toBeTruthy(),
    );
  });

  it('falls back to a generic message when the failure carries no reason', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: () => {
        throw new Error('');
      },
    });
    render(() => <GistModal open markdown={markdown} onClose={vi.fn()} />);

    screen.getByText('Copy markdown').click();

    await vi.waitFor(() => expect(screen.getByText('Could not copy')).toBeTruthy());
  });

  // The gist form has no API to fill, so the flow is copy-then-open.
  it('copies before opening the new-gist tab', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    render(() => <GistModal open markdown={markdown} onClose={vi.fn()} />);

    screen.getByText('Copy & open new gist').click();

    await vi.waitFor(() => expect(openSpy).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith(markdown);
    expect(openSpy).toHaveBeenCalledWith(
      'https://gist.github.com/',
      '_blank',
      'noopener,noreferrer',
    );
  });
});

describe('AboutModal', () => {
  it('stays out of the DOM until it is opened', () => {
    render(() => <AboutModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // The same copy is mirrored as static HTML for crawlers; about.test.ts keeps
  // the two in step, and this checks the modal actually renders it.
  it('renders the tagline, both lists and the ecosystem links', () => {
    render(() => <AboutModal open onClose={vi.fn()} />);
    expect(screen.getByText(TAGLINE)).toBeTruthy();
    for (const item of [...DOES, ...DOES_NOT]) expect(screen.getByText(item)).toBeTruthy();
    for (const link of ECOSYSTEM) {
      // `getAllByText`: some labels also appear in the support links above.
      const hrefs = screen.getAllByText(link.label).map((n) => n.getAttribute('href'));
      expect(hrefs).toContain(link.href);
    }
  });

  it('closes on Escape, on the close button and on the backdrop', () => {
    const onClose = vi.fn();
    render(() => <AboutModal open onClose={onClose} />);

    escape();
    expect(onClose).toHaveBeenCalledTimes(1);

    screen.getByLabelText('Close').click();
    expect(onClose).toHaveBeenCalledTimes(2);

    clickBackdrop('.modal-overlay');
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('ignores a click inside the dialog', () => {
    const onClose = vi.fn();
    render(() => <AboutModal open onClose={onClose} />);

    screen.getByRole('dialog').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('moves focus into the dialog and hands it back on close', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const [open, setOpen] = createSignal(false);
    render(() => <AboutModal open={open()} onClose={() => setOpen(false)} />);

    setOpen(true);
    expect(document.activeElement).toBe(screen.getByLabelText('Close'));

    setOpen(false);
    expect(document.activeElement).toBe(opener);
  });

  it('stops listening for Escape once closed', () => {
    const onClose = vi.fn();
    const [open, setOpen] = createSignal(true);
    render(() => <AboutModal open={open()} onClose={onClose} />);

    setOpen(false);
    escape();

    expect(onClose).not.toHaveBeenCalled();
  });

  // Every outbound link opens in a new tab, so each needs the opener severed.
  it('severs the opener on every outbound link', () => {
    const { container } = render(() => <AboutModal open onClose={vi.fn()} />);
    const links = [...container.querySelectorAll('a')];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.rel).toBe('noopener noreferrer');
  });
});

describe('StatusBar', () => {
  const barProps = (over = {}) => ({
    devTools: true,
    onToggleDevTools: vi.fn(),
    onOpenAbout: vi.fn(),
    ...over,
  });

  it('links to the source and opens About', () => {
    const onOpenAbout = vi.fn();
    render(() => <StatusBar {...barProps({ onOpenAbout })} />);

    expect(screen.getByTitle('Source on GitHub').getAttribute('href')).toBe(
      'https://github.com/mnfst/wingman',
    );

    screen.getByText('About').click();
    expect(onOpenAbout).toHaveBeenCalled();
  });

  it('toggles Dev Tools and reports its state', () => {
    const onToggleDevTools = vi.fn();
    const { unmount } = render(() => <StatusBar {...barProps({ onToggleDevTools })} />);

    const button = screen.getByText('Dev Tools').closest('button')!;
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.title).toMatch(/Hide the raw/);
    button.click();
    expect(onToggleDevTools).toHaveBeenCalled();
    unmount();

    render(() => <StatusBar {...barProps({ devTools: false })} />);
    const off = screen.getByText('Dev Tools').closest('button')!;
    expect(off.getAttribute('aria-pressed')).toBe('false');
    expect(off.title).toMatch(/Show the raw/);
  });

  it('shows the build version', () => {
    render(() => <StatusBar {...barProps()} />);
    expect(screen.getByTitle('Wingman version').textContent).toMatch(/^v\d+\.\d+\.\d+$/);
  });
});

describe('TitleBar', () => {
  // Clicking a product's own logo should not navigate you off the app.
  it('brands the app without linking away, and hosts the tab strip', () => {
    const { container } = render(() => (
      <TitleBar>
        <span data-testid="tabs">tabs</span>
      </TitleBar>
    ));
    expect(screen.getByText('Wingman').closest('a')).toBeNull();
    expect(container.querySelector('.titlebar__tabs')?.textContent).toBe('tabs');
  });
});
