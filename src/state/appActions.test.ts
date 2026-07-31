// Tabs, history and sharing. The tab strip is history entries oldest-first
// followed by drafts, and every action that removes a tab has to leave exactly
// one other tab selected — never a dead response with nothing highlighted.
import { createRoot } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppState } from './appState';
import { createAppActions } from './appActions';
import { appendHistory, type NewHistoryEntry } from '../services/history';

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

describe('restoring a history entry', () => {
  it('puts the whole request setup and its response back', () => {
    const entry = stored();

    withApp((s, a) => {
      a.restoreFromHistory(entry);

      expect(s.activeHistoryId()).toBe(entry.id);
      expect(s.baseUrl()).toBe('https://gw.example.com');
      expect(s.model()).toBe('auto');
      expect(s.formatId()).toBe('openai-chat');
      expect(s.profile().id).toBe('default');
      expect(s.userMessage()).toBe('stored message');
      expect(s.sentMessage()).toBe('stored message');
      expect(s.systemPrompts().default).toBe('stored prompt');
      expect(s.headerEntries()).toEqual([{ key: 'X-Stored', value: '1' }]);
      expect(s.result()).toMatchObject({ status: 200, ok: true });
    });
  });

  // Entries predate the multi-format work, so the fields it added are optional.
  it('falls back to the defaults for an entry saved before formats existed', () => {
    const entry = stored({ formatId: undefined, url: undefined, streamed: undefined });

    withApp((s, a) => {
      a.restoreFromHistory(entry);
      expect(s.formatId()).toBe('openai-chat');
      expect(s.result()?.url).toBe('https://gw.example.com/v1/chat/completions');
    });
  });

  it('ignores a format id that no longer exists', () => {
    withApp((s, a) => {
      a.restoreFromHistory(stored({ formatId: 'retired-format' }));
      expect(s.formatId()).toBe('openai-chat');
    });
  });

  it('resolves a retired client id through its alias', () => {
    withApp((s, a) => {
      a.restoreFromHistory(stored({ profileId: 'curl' }));
      expect(s.profile().id).toBe('default');
    });
  });

  it('drops a client id that resolves to nothing at all', () => {
    withApp((s, a) => {
      a.restoreFromHistory(stored({ profileId: 'ghost' }));
      expect(s.headerEntries()).not.toEqual([{ key: 'X-Stored', value: '1' }]);
    });
  });

  it('falls back to the client default for a language it cannot use', () => {
    withApp((s, a) => {
      a.restoreFromHistory(stored({ lang: 'rust' }));
      expect(s.lang()).toBe('bash');
    });
  });

  // The provider pill has to agree with the URL it is sitting next to.
  it('re-derives the provider preset from the stored base URL', () => {
    withApp((s, a) => {
      a.restoreFromHistory(stored({ baseUrl: 'https://api.openai.com' }));
      expect(s.provider().id).toBe('openai');
    });
  });

  it('restores the stream toggle when the entry recorded one', () => {
    withApp((s, a) => {
      a.restoreFromHistory(stored({ streamed: true }));
      expect(s.stream()).toBe(true);
    });
  });
});

describe('opening a new request', () => {
  // The common case is firing a second request at the same endpoint.
  it('inherits the setup on screen and starts with an empty message', () => {
    withApp((s, a) => {
      s.selectProvider('anthropic');
      s.setUserMessage('first draft');

      a.handleNewRequest();

      expect(s.drafts()).toHaveLength(2);
      expect(s.userMessage()).toBe('');
      expect(s.provider().id).toBe('anthropic');
    });
  });

  it('parks the message being typed so returning to the tab restores it', () => {
    withApp((s, a) => {
      const first = s.activeDraftId();
      s.setUserMessage('half-written');

      a.handleNewRequest();
      a.selectDraft(first);

      expect(s.userMessage()).toBe('half-written');
    });
  });

  // Without a parked config, retargeting one tab would silently retarget them all.
  it('parks the request setup with the tab, not globally', () => {
    withApp((s, a) => {
      const first = s.activeDraftId();
      s.selectProvider('openai');

      a.handleNewRequest();
      s.selectProvider('anthropic');
      a.selectDraft(first);

      expect(s.provider().id).toBe('openai');
      expect(s.model()).toBe('gpt-4o');
    });
  });

  it('clears the response pane when a draft takes over', () => {
    withApp((s, a) => {
      a.restoreFromHistory(stored());
      expect(s.result()).not.toBeNull();

      a.handleNewRequest();

      expect(s.result()).toBeNull();
      expect(s.hasSent()).toBe(false);
      expect(s.activeHistoryId()).toBeNull();
    });
  });

  it('ignores a request to open a draft that is not there', () => {
    withApp((s, a) => {
      const before = s.activeDraftId();
      a.selectDraft('draft-does-not-exist');
      expect(s.activeDraftId()).toBe(before);
    });
  });
});
