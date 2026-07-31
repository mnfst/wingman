import { describe, expect, it, vi } from 'vitest';
import {
  appendHistory,
  clearHistory,
  deleteHistory,
  formatRelativeTime,
  listHistory,
  type NewHistoryEntry,
} from './history';
import { STORAGE } from './settings';

const entry = (over: Partial<NewHistoryEntry> = {}): NewHistoryEntry => ({
  profileId: 'default',
  profileLabel: 'Default',
  baseUrl: 'https://app.manifest.build',
  model: 'auto',
  systemPrompt: '',
  userMessage: 'hi',
  lang: 'bash',
  headers: {},
  status: 200,
  statusText: 'OK',
  ok: true,
  durationMs: 12,
  assistantText: 'hello',
  requestBody: '{}',
  requestHeaders: {},
  responseBody: '{}',
  responseHeaders: {},
  responseJson: null,
  ...over,
});

describe('appendHistory', () => {
  it('stamps an id and a timestamp', () => {
    const stored = appendHistory(entry());
    expect(stored.id).toBeTruthy();
    expect(stored.timestamp).toBeGreaterThan(0);
  });

  // Newest first: the tab strip reverses this to render oldest → newest.
  it('puts the newest entry at the head', () => {
    appendHistory(entry({ userMessage: 'first' }));
    appendHistory(entry({ userMessage: 'second' }));
    expect(listHistory().map((e) => e.userMessage)).toEqual(['second', 'first']);
  });

  it('gives every entry a distinct id', () => {
    const ids = new Set([appendHistory(entry()).id, appendHistory(entry()).id]);
    expect(ids.size).toBe(2);
  });

  // Not every browser context exposes crypto.randomUUID (older Safari, and any
  // insecure origin), and a request must still be recordable there.
  it('falls back to a generated id when randomUUID is unavailable', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('unavailable');
    });
    vi.stubGlobal('crypto', {});
    expect(appendHistory(entry()).id).toMatch(/^hist_/);
  });

  // Prompts and responses are large; an unbounded list would fill the session
  // quota and start losing writes silently.
  it('keeps at most 50 entries', () => {
    for (let i = 0; i < 55; i += 1) appendHistory(entry({ userMessage: `msg-${i}` }));
    const all = listHistory();
    expect(all).toHaveLength(50);
    expect(all[0]?.userMessage).toBe('msg-54');
    expect(all.at(-1)?.userMessage).toBe('msg-5');
  });

  // A full quota must not take the request down with it — the response is
  // already on screen; only the historical record is lost.
  it('survives a storage write failure', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => appendHistory(entry())).not.toThrow();
  });
});

describe('listHistory', () => {
  it('is empty in a fresh session', () => {
    expect(listHistory()).toEqual([]);
  });

  it('ignores a corrupted store rather than throwing on boot', () => {
    sessionStorage.setItem(STORAGE.history, 'not json');
    expect(listHistory()).toEqual([]);
  });

  it('ignores a store holding something other than a list', () => {
    sessionStorage.setItem(STORAGE.history, '{"nope":true}');
    expect(listHistory()).toEqual([]);
  });

  it('survives a storage read failure', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    expect(listHistory()).toEqual([]);
  });
});

describe('deleteHistory and clearHistory', () => {
  it('removes one entry and leaves the rest', () => {
    const first = appendHistory(entry({ userMessage: 'first' }));
    appendHistory(entry({ userMessage: 'second' }));
    deleteHistory(first.id);
    expect(listHistory().map((e) => e.userMessage)).toEqual(['second']);
  });

  it('ignores an id that is not there', () => {
    appendHistory(entry());
    deleteHistory('nope');
    expect(listHistory()).toHaveLength(1);
  });

  it('empties the whole list', () => {
    appendHistory(entry());
    clearHistory();
    expect(listHistory()).toEqual([]);
  });
});

describe('formatRelativeTime', () => {
  const now = Date.UTC(2026, 6, 31, 12, 0, 0);
  const ago = (ms: number) => formatRelativeTime(now - ms, now);
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it.each([
    ['just now', 0],
    ['just now', 4 * SECOND],
    ['5s ago', 5 * SECOND],
    ['59s ago', 59 * SECOND],
    ['1m ago', MINUTE],
    ['59m ago', 59 * MINUTE],
    ['1h ago', HOUR],
    ['23h ago', 23 * HOUR],
    ['1d ago', DAY],
    ['6d ago', 6 * DAY],
    ['1w ago', 7 * DAY],
    ['3w ago', 21 * DAY],
    ['1mo ago', 30 * DAY],
    ['4mo ago', 120 * DAY],
  ])('reads %s', (expected, delta) => {
    expect(ago(delta)).toBe(expected);
  });

  // Clock skew between the stamp and the render would otherwise print "-3s ago".
  it('never reads as negative when the clock jumps backwards', () => {
    expect(formatRelativeTime(now + 10_000, now)).toBe('just now');
  });

  it('defaults to the current time', () => {
    expect(formatRelativeTime(Date.now())).toBe('just now');
  });
});
