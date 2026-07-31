// The tab strip. Order is the contract: sent requests oldest → newest, then
// the drafts, so a fresh send appears at the right edge like a new browser tab.
import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import RequestTabs from './RequestTabs.jsx';
import type { HistoryEntry } from '../services/history';
import type { DraftTab } from '../state/drafts';

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: 'h1',
  timestamp: Date.now(),
  profileId: 'default',
  profileLabel: 'Default',
  baseUrl: 'https://app.manifest.build',
  model: 'auto',
  systemPrompt: '',
  userMessage: 'first message',
  lang: 'bash',
  headers: {},
  status: 200,
  statusText: 'OK',
  ok: true,
  durationMs: 12,
  assistantText: 'hi',
  requestBody: '{}',
  requestHeaders: {},
  responseBody: '{}',
  responseHeaders: {},
  responseJson: null,
  ...over,
});

type Props = Parameters<typeof RequestTabs>[0];

const props = (over: Partial<Props> = {}): Props => ({
  entries: [],
  activeId: null,
  onSelect: vi.fn(),
  onDelete: vi.fn(),
  onClear: vi.fn(),
  drafts: [{ id: 'd1', message: '' }] as DraftTab[],
  activeDraftId: 'd1',
  onSelectDraft: vi.fn(),
  onCloseDraft: vi.fn(),
  onNewRequest: vi.fn(),
  ...over,
});

const tabLabels = (container: HTMLElement) =>
  [...container.querySelectorAll('.reqtab__label')].map((n) => n.textContent);

describe('tab order', () => {
  // `entries` arrives newest-first from storage; the strip reverses it.
  it('runs sent requests oldest to newest, then the drafts', () => {
    const { container } = render(() => (
      <RequestTabs
        {...props({
          entries: [
            entry({ id: 'h2', userMessage: 'newer' }),
            entry({ id: 'h1', userMessage: 'older' }),
          ],
          drafts: [{ id: 'd1', message: 'a draft' }],
        })}
      />
    ));

    expect(tabLabels(container)).toEqual(['older', 'newer', 'a draft']);
  });

  it('labels an empty request and an untitled draft', () => {
    const { container } = render(() => (
      <RequestTabs
        {...props({
          entries: [entry({ userMessage: '' })],
          drafts: [{ id: 'd1', message: '' }],
        })}
      />
    ));

    expect(tabLabels(container)).toEqual(['(empty)', 'Untitled']);
  });

  it('labels a draft with the first line of its message', () => {
    const { container } = render(() => (
      <RequestTabs {...props({ drafts: [{ id: 'd1', message: '  line one\nline two' }] })} />
    ));
    expect(tabLabels(container)).toEqual(['line one']);
  });
});

describe('selection', () => {
  it('marks the open history tab, not the draft', () => {
    render(() => <RequestTabs {...props({ entries: [entry()], activeId: 'h1' })} />);
    const selected = screen
      .getAllByRole('tab')
      .filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]?.textContent).toContain('first message');
  });

  it('marks the open draft when no history tab is open', () => {
    render(() => <RequestTabs {...props({ entries: [entry()], activeId: null })} />);
    const selected = screen
      .getAllByRole('tab')
      .filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]?.textContent).toBe('Untitled');
  });

  it('reports the entry behind the tab that was clicked', () => {
    const onSelect = vi.fn();
    const target = entry();
    render(() => <RequestTabs {...props({ entries: [target], onSelect })} />);

    screen.getByText('first message').click();

    expect(onSelect).toHaveBeenCalledWith(target);
  });

  it('reports the draft that was clicked', () => {
    const onSelectDraft = vi.fn();
    render(() => <RequestTabs {...props({ onSelectDraft })} />);

    screen.getByText('Untitled').click();

    expect(onSelectDraft).toHaveBeenCalledWith('d1');
  });
});

describe('closing', () => {
  // The close button sits inside the tab; without stopPropagation, closing one
  // tab would also select it.
  it('closes a request without selecting it', () => {
    const onDelete = vi.fn();
    const onSelect = vi.fn();
    render(() => <RequestTabs {...props({ entries: [entry()], onDelete, onSelect })} />);

    screen.getByLabelText('Close and delete this request').click();

    expect(onDelete).toHaveBeenCalledWith('h1');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes a draft without selecting it', () => {
    const onCloseDraft = vi.fn();
    const onSelectDraft = vi.fn();
    render(() => <RequestTabs {...props({ onCloseDraft, onSelectDraft })} />);

    screen.getByLabelText('Close this draft').click();

    expect(onCloseDraft).toHaveBeenCalledWith('d1');
    expect(onSelectDraft).not.toHaveBeenCalled();
  });
});

describe('the strip actions', () => {
  it('opens a new request', () => {
    const onNewRequest = vi.fn();
    render(() => <RequestTabs {...props({ onNewRequest })} />);

    screen.getByLabelText('New request').click();

    expect(onNewRequest).toHaveBeenCalled();
  });

  // Nothing to clear, so no button to press.
  it('offers Clear all only once something has been sent', () => {
    const { unmount } = render(() => <RequestTabs {...props()} />);
    expect(screen.queryByLabelText('Clear all history')).toBeNull();
    unmount();

    const onClear = vi.fn();
    render(() => <RequestTabs {...props({ entries: [entry()], onClear })} />);
    screen.getByLabelText('Clear all history').click();
    expect(onClear).toHaveBeenCalled();
  });
});

describe('status and identity', () => {
  it.each([
    ['ok', { status: 200, ok: true }],
    ['warn', { status: 404, ok: false }],
    ['err', { status: 500, ok: false }],
    ['err', { status: 0, ok: false }],
  ])('flags a %s outcome on the tab', (tone, over) => {
    const { container } = render(() => <RequestTabs {...props({ entries: [entry(over)] })} />);
    expect(container.querySelector(`.reqtab__dot--${tone}`)).not.toBeNull();
  });

  it('shows the client icon, falling back for a retired client', () => {
    const { container } = render(() => (
      <RequestTabs
        {...props({
          entries: [entry({ id: 'h2', profileId: 'openclaw' }), entry({ profileId: 'retired' })],
        })}
      />
    ));
    const sources = [...container.querySelectorAll('.reqtab__icon')].map((n) =>
      n.getAttribute('src'),
    );
    expect(sources).toEqual(['/icons/other.svg', '/icons/openclaw.png']);
  });

  it('spells out a network failure in the tooltip', () => {
    render(() => <RequestTabs {...props({ entries: [entry({ status: 0, ok: false })] })} />);
    expect(screen.getByText('first message').closest('button')?.title).toContain('network error');
  });

  // A send appends at the far right, which is off-screen once the strip fills.
  it('scrolls the active tab into view', async () => {
    const scrollIntoView = vi.fn();
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(scrollIntoView);

    render(() => <RequestTabs {...props({ entries: [entry()], activeId: 'h1' })} />);
    await new Promise((resolve) => queueMicrotask(() => resolve(null)));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });
});
