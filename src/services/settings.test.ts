import { beforeEach, describe, expect, it } from 'vitest';
import { purgeLegacyStorage, readStorage, removeStorage, STORAGE, writeStorage } from './settings';
import { appendHistory, clearHistory, listHistory, type NewHistoryEntry } from './history';

// The promise the About modal makes: keys, presets and history survive a
// provider switch but not a closed tab. sessionStorage is exactly that
// lifetime, so the test that matters is "localStorage is never written".

const entry: NewHistoryEntry = {
  profileId: 'raw',
  profileLabel: 'Raw',
  baseUrl: 'https://app.manifest.build',
  model: 'auto',
  systemPrompt: '',
  userMessage: 'hi',
  lang: 'curl',
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
};

describe('settings storage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps values for the rest of the session', () => {
    writeStorage(STORAGE.apiKeys, '{"openai":"sk-test"}');
    expect(readStorage(STORAGE.apiKeys, '')).toBe('{"openai":"sk-test"}');
  });

  it('never writes localStorage', () => {
    for (const key of Object.values(STORAGE)) writeStorage(key, 'x');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(Object.values(STORAGE).length);
  });

  it('falls back when a key was never written', () => {
    expect(readStorage(STORAGE.model, 'auto')).toBe('auto');
  });

  it('removes from the session store', () => {
    writeStorage(STORAGE.model, 'gpt-4o');
    removeStorage(STORAGE.model);
    expect(readStorage(STORAGE.model, 'auto')).toBe('auto');
  });
});

describe('purgeLegacyStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  // Older builds persisted to disk. A returning visitor still has those values,
  // so booting has to clear them or "nothing persists" is false for them.
  it('clears what older builds left on disk', () => {
    localStorage.setItem(STORAGE.baseUrl, 'https://old.example.com');
    localStorage.setItem(STORAGE.history, '[{"id":"1"}]');
    localStorage.setItem('wingman:apiKey', 'sk-leaked');

    purgeLegacyStorage();

    expect(localStorage.getItem(STORAGE.baseUrl)).toBeNull();
    expect(localStorage.getItem(STORAGE.history)).toBeNull();
    expect(localStorage.getItem('wingman:apiKey')).toBeNull();
  });

  it('leaves unrelated localStorage keys alone', () => {
    localStorage.setItem('someone-elses-key', 'keep me');
    purgeLegacyStorage();
    expect(localStorage.getItem('someone-elses-key')).toBe('keep me');
  });

  it('leaves the current session untouched', () => {
    writeStorage(STORAGE.apiKeys, '{"openai":"sk-test"}');
    purgeLegacyStorage();
    expect(readStorage(STORAGE.apiKeys, '')).toBe('{"openai":"sk-test"}');
  });
});

describe('history storage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('round-trips an entry without touching localStorage', () => {
    appendHistory(entry);
    expect(listHistory()).toHaveLength(1);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.getItem(STORAGE.history)).not.toBeNull();
  });

  it('starts empty in a fresh session', () => {
    appendHistory(entry);
    clearHistory();
    expect(listHistory()).toEqual([]);
  });
});
