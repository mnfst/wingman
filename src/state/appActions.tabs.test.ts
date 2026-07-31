// Closing a tab, clearing the strip, and sharing a result. Every action here
// removes something, and each has to leave exactly one other tab selected,
// never a dead response with nothing highlighted.
import { createRoot } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppState } from './appState';
import { createAppActions } from './appActions';
import { appendHistory, listHistory, type NewHistoryEntry } from '../services/history';

const fetchMock = vi.fn();

const stored = (over: Partial<NewHistoryEntry> = {}) =>
  appendHistory({
    profileId: 'default',
    profileLabel: 'Default',
    formatId: 'openai-chat',
    formatLabel: 'OpenAI Chat Completions',
    streamed: false,
    url: 'https://gw.example.com/v1/chat/completions',
    baseUrl: 'https://gw.example.com',
    model: 'auto',
    systemPrompt: 'stored prompt',
    userMessage: 'stored message',
    lang: 'bash',
    headers: { 'X-Stored': '1' },
    status: 200,
    statusText: 'OK',
    ok: true,
    durationMs: 10,
    assistantText: 'hi',
    requestBody: '{}',
    requestHeaders: {},
    responseBody: '{}',
    responseHeaders: {},
    responseJson: { choices: [{ message: { content: 'hi' } }] },
    ...over,
  });

function withApp(
  fn: (s: ReturnType<typeof createAppState>, a: ReturnType<typeof createAppActions>) => void,
) {
  createRoot((dispose) => {
    const s = createAppState();
    fn(s, createAppActions(s));
    dispose();
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', fetchMock);
});

describe('closing a tab', () => {
  it('hands over to the tab on the right', () => {
    withApp((s, a) => {
      const first = s.activeDraftId();
      a.handleNewRequest();
      const second = s.activeDraftId();
      a.selectDraft(first);

      a.closeDraft(first);

      expect(s.activeDraftId()).toBe(second);
    });
  });

  it('falls back to the tab on the left when the closed one was last', () => {
    withApp((s, a) => {
      const first = s.activeDraftId();
      a.handleNewRequest();
      const second = s.activeDraftId();

      a.closeDraft(second);

      expect(s.activeDraftId()).toBe(first);
    });
  });

  // Nothing left to fall back to: an empty tab beats a dead response with no
  // tab highlighted.
  it('opens a fresh tab when the last one closes', () => {
    withApp((s, a) => {
      const only = s.activeDraftId();

      a.closeDraft(only);

      expect(s.drafts()).toHaveLength(1);
      expect(s.drafts()[0]?.id).not.toBe(only);
      expect(s.userMessage()).toBe('');
    });
  });

  it('leaves the selection alone when closing a tab that is not open', () => {
    withApp((s, a) => {
      const active = s.activeDraftId();
      a.handleNewRequest();
      const other = s.activeDraftId();
      a.selectDraft(active);

      a.closeDraft(other);

      expect(s.activeDraftId()).toBe(active);
      expect(s.drafts()).toHaveLength(1);
    });
  });

  it('deletes the history entry a closed history tab stood for', () => {
    const entry = stored();

    withApp((s, a) => {
      a.restoreFromHistory(entry);

      a.handleDelete(entry.id);

      expect(listHistory()).toHaveLength(0);
      expect(s.activeHistoryId()).toBeNull();
      expect(s.result()).toBeNull();
    });
  });

  it('crosses from a deleted history tab onto the neighbouring one', () => {
    const older = stored({ userMessage: 'older' });
    const newer = stored({ userMessage: 'newer' });

    withApp((s, a) => {
      a.restoreFromHistory(older);

      a.handleDelete(older.id);

      expect(s.activeHistoryId()).toBe(newer.id);
      expect(s.userMessage()).toBe('newer');
    });
  });

  it('deletes a history entry that is not the open tab without moving the selection', () => {
    const entry = stored();

    withApp((s, a) => {
      const draft = s.activeDraftId();

      a.handleDelete(entry.id);

      expect(listHistory()).toHaveLength(0);
      expect(s.activeDraftId()).toBe(draft);
    });
  });
});

describe('clearing all history', () => {
  it('asks first, and does nothing when refused', () => {
    stored();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );

    withApp((_s, a) => {
      a.handleClear();
      expect(listHistory()).toHaveLength(1);
    });
  });

  it('empties the strip and falls back to a draft tab', () => {
    const entry = stored();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );

    withApp((s, a) => {
      a.restoreFromHistory(entry);

      a.handleClear();

      expect(listHistory()).toHaveLength(0);
      expect(s.history()).toEqual([]);
      expect(s.activeHistoryId()).toBeNull();
      expect(s.result()).toBeNull();
    });
  });

  it('opens a fresh tab when there was no draft to fall back to', () => {
    const entry = stored();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );

    withApp((s, a) => {
      a.restoreFromHistory(entry);
      s.setDrafts([]);

      a.handleClear();

      expect(s.drafts()).toHaveLength(1);
      expect(s.activeHistoryId()).toBeNull();
    });
  });

  it('never prompts when the strip holds no history', () => {
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmMock);

    withApp((_s, a) => {
      a.handleClear();
      expect(confirmMock).not.toHaveBeenCalled();
    });
  });

  it('leaves the open draft alone when a history tab was not showing', () => {
    stored();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );

    withApp((s, a) => {
      const draft = s.activeDraftId();
      s.setUserMessage('unsent');

      a.handleClear();

      expect(s.activeDraftId()).toBe(draft);
      expect(s.userMessage()).toBe('unsent');
    });
  });
});

describe('saving a request as a gist', () => {
  it('builds the report and opens the modal', () => {
    const entry = stored();

    withApp((s, a) => {
      a.restoreFromHistory(entry);

      a.handleSaveToGist();

      expect(s.gistModalOpen()).toBe(true);
      expect(s.gistMarkdown()).toContain('# Manifest Wingman request report');
      expect(s.gistMarkdown()).toContain('> hi');
      expect(s.saveStatus()).toBe('saved');
    });
  });

  it('does nothing when there is no response to report', () => {
    withApp((s, a) => {
      a.handleSaveToGist();
      expect(s.gistModalOpen()).toBe(false);
    });
  });

  it('settles the button back to idle', () => {
    vi.useFakeTimers();
    const entry = stored();

    withApp((s, a) => {
      a.restoreFromHistory(entry);
      a.handleSaveToGist();

      vi.advanceTimersByTime(3000);

      expect(s.saveStatus()).toBe('idle');
    });
    vi.useRealTimers();
  });
});

describe('focusing the composer', () => {
  it('focuses the message box when it is on the page', () => {
    const textarea = document.createElement('textarea');
    textarea.className = 'chatbox__textarea';
    document.body.appendChild(textarea);

    withApp((_s, a) => {
      a.focusComposer();
      expect(document.activeElement).toBe(textarea);
    });
  });

  it('does nothing when the message box is not mounted', () => {
    withApp((_s, a) => {
      expect(() => a.focusComposer()).not.toThrow();
    });
  });
});
