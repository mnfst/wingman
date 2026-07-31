// The form's own rules: which provider, format and client can be selected
// together, what persists, and what a draft tab carries when it loses focus.
import { createRoot } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import { createAppState } from './appState';
import { STORAGE } from '../services/settings';
import { defaultBaseUrl } from '../services/baseUrl';

/** A state instance torn down after the callback runs. */
function withState(fn: (s: ReturnType<typeof createAppState>) => void) {
  createRoot((dispose) => {
    // Neither probe should reach the network from a state test.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    fn(createAppState());
    dispose();
  });
}

describe('provider presets', () => {
  it('fills the base URL, model and wire format from the preset', () => {
    withState((s) => {
      s.selectProvider('anthropic');
      expect(s.provider().id).toBe('anthropic');
      expect(s.baseUrl()).toBe('https://api.anthropic.com');
      expect(s.model()).toBe('claude-sonnet-4-5');
      expect(s.formatId()).toBe('anthropic-messages');
    });
  });

  // Returning to Custom means "back to the Manifest gateway", not "keep the
  // last provider's host with a Custom label on it".
  it('returns to the Manifest defaults when Custom is picked again', () => {
    withState((s) => {
      s.selectProvider('openai');
      s.selectProvider('custom');
      expect(s.baseUrl()).toBe(defaultBaseUrl());
      expect(s.model()).toBe('auto');
    });
  });

  it('ignores a preset that does not exist and a re-pick of the active one', () => {
    withState((s) => {
      s.selectProvider('openai');
      s.persistAndSetModel('gpt-4o-mini');
      s.selectProvider('openai');
      s.selectProvider('nope');
      expect(s.model()).toBe('gpt-4o-mini');
    });
  });

  // Each provider issues its own credential, so the field has to follow the
  // preset. A shared key meant an sk-… landing in an Anthropic x-api-key.
  it('keeps a key per provider', () => {
    withState((s) => {
      s.persistAndSetKey('mnfst_one');
      s.selectProvider('openai');
      expect(s.apiKey()).toBe('');
      s.persistAndSetKey('sk-two');
      s.selectProvider('custom');
      expect(s.apiKey()).toBe('mnfst_one');
    });
  });

  it('forgets a key that is cleared', () => {
    withState((s) => {
      s.persistAndSetKey('mnfst_one');
      s.persistAndSetKey('');
      expect(s.apiKey()).toBe('');
      expect(JSON.parse(sessionStorage.getItem(STORAGE.apiKeys) ?? '{}')).toEqual({});
    });
  });
});

describe('typing in the base URL', () => {
  // Retargeting the URL is not a deliberate provider switch, so the key already
  // typed follows the user across rather than vanishing.
  it('flips to Custom and carries the key across', () => {
    withState((s) => {
      s.selectProvider('openai');
      s.persistAndSetKey('sk-two');
      s.handleBaseUrlInput('https://gw.example.com');
      expect(s.provider().id).toBe('custom');
      expect(s.apiKey()).toBe('sk-two');
    });
  });

  it('never clobbers a key already set for Custom', () => {
    withState((s) => {
      s.persistAndSetKey('mnfst_one');
      s.selectProvider('openai');
      s.persistAndSetKey('sk-two');
      s.handleBaseUrlInput('https://gw.example.com');
      expect(s.apiKey()).toBe('mnfst_one');
    });
  });

  it('leaves the preset alone when Custom is already active', () => {
    withState((s) => {
      s.handleBaseUrlInput('https://gw.example.com');
      expect(s.provider().id).toBe('custom');
      expect(s.baseUrl()).toBe('https://gw.example.com');
    });
  });
});

describe('format and client compatibility', () => {
  // Every client declares which formats it can speak; leaving an incompatible
  // one selected would generate a snippet for an endpoint it never calls.
  it('moves off a client the new format cannot use', () => {
    withState((s) => {
      s.setProfileSafely('openclaw');
      s.setFormatSafely('anthropic-messages');
      expect(s.availableProfiles().map((p) => p.id)).not.toContain('openclaw');
      expect(s.profile().id).toBe('anthropic-sdk');
    });
  });

  it('keeps a client the new format can still use', () => {
    withState((s) => {
      s.setProfileSafely('default');
      s.setFormatSafely('anthropic-messages');
      expect(s.profile().id).toBe('default');
    });
  });

  it('ignores a format that does not exist', () => {
    withState((s) => {
      s.setFormatSafely('soap');
      expect(s.formatId()).toBe('openai-chat');
    });
  });

  it('moves to a language the new client supports', () => {
    withState((s) => {
      s.setProfileSafely('openai-sdk');
      s.setLang('python');
      s.setProfileSafely('vercel-ai-sdk');
      expect(s.lang()).toBe('typescript');
    });
  });

  it('keeps a language the new client also supports', () => {
    withState((s) => {
      s.setProfileSafely('openai-sdk');
      s.setLang('python');
      s.setProfileSafely('langchain');
      expect(s.lang()).toBe('python');
    });
  });

  it('ignores a client that does not exist', () => {
    withState((s) => {
      s.setProfileSafely('default');
      s.setProfileSafely('ghost');
      expect(s.profile().id).toBe('default');
      expect(sessionStorage.getItem(STORAGE.profile)).toBe('default');
    });
  });
});

describe('the request URL a send will use', () => {
  it('appends the format path to the normalised base', () => {
    withState((s) => {
      s.handleBaseUrlInput('https://gw.example.com/v1/');
      expect(s.normalized().base).toBe('https://gw.example.com');
      expect(s.requestUrl()).toBe('https://gw.example.com/v1/chat/completions');
    });
  });

  it('reports an unusable base URL rather than resolving it', () => {
    withState((s) => {
      s.handleBaseUrlInput('   ');
      expect(s.normalized().valid).toBe(false);
      expect(s.normalized().problem).toBe('Base URL is empty.');
    });
  });

  it('gathers the parameters every format and snippet reads', () => {
    withState((s) => {
      s.handleBaseUrlInput('https://gw.example.com');
      s.persistAndSetKey('mnfst_test');
      s.persistAndSetModel('auto');
      s.updateSystemPrompt('be terse');
      s.setUserMessage('hello');
      expect(s.params()).toEqual({
        baseUrl: 'https://gw.example.com',
        apiKey: 'mnfst_test',
        model: 'auto',
        systemPrompt: 'be terse',
        userMessage: 'hello',
      });
    });
  });

  // Each client carries its own prompt, so switching client does not drag the
  // previous one's captured system prompt along.
  it('keeps the system prompt per client', () => {
    withState((s) => {
      s.setProfileSafely('default');
      s.updateSystemPrompt('mine');
      s.setProfileSafely('openclaw');
      expect(s.params().systemPrompt).not.toBe('mine');
      s.setProfileSafely('default');
      expect(s.params().systemPrompt).toBe('mine');
    });
  });
});

describe('draft tabs', () => {
  it('overlays the live message onto the open draft tab', () => {
    withState((s) => {
      s.setUserMessage('typing');
      expect(s.draftTabs()[0]?.message).toBe('typing');
    });
  });

  // Once a history tab has focus the live message belongs to it, not to a draft.
  it('leaves the draft labels alone while a history tab is open', () => {
    withState((s) => {
      const parked = s.draftTabs()[0]?.message;
      s.setActiveHistoryId('h1');
      s.setUserMessage('typing into history');
      expect(s.draftTabs()[0]?.message).toBe(parked);
    });
  });

  it('round-trips the whole request setup through a draft', () => {
    withState((s) => {
      s.selectProvider('anthropic');
      s.persistAndSetModel('claude-opus-4');
      s.persistAndSetStream(true);
      const parked = s.captureDraftConfig();

      s.selectProvider('openai');
      expect(s.model()).toBe('gpt-4o');

      s.applyDraftConfig(parked);
      expect(s.provider().id).toBe('anthropic');
      expect(s.formatId()).toBe('anthropic-messages');
      expect(s.model()).toBe('claude-opus-4');
      expect(s.stream()).toBe(true);
    });
  });
});

describe('persistence', () => {
  it('writes every field the session should remember', () => {
    withState((s) => {
      s.handleBaseUrlInput('https://gw.example.com');
      s.persistAndSetKey('mnfst_test');
      s.persistAndSetModel('auto');
      s.persistAndSetStream(true);
      s.setFormatSafely('openai-responses');
      s.setProfileSafely('default');

      expect(sessionStorage.getItem(STORAGE.baseUrl)).toBe('https://gw.example.com');
      expect(sessionStorage.getItem(STORAGE.model)).toBe('auto');
      expect(sessionStorage.getItem(STORAGE.stream)).toBe('1');
      expect(sessionStorage.getItem(STORAGE.format)).toBe('openai-responses');
      expect(sessionStorage.getItem(STORAGE.profile)).toBe('default');
      expect(JSON.parse(sessionStorage.getItem(STORAGE.apiKeys) ?? '{}')).toEqual({
        custom: 'mnfst_test',
      });
    });
  });

  it('restores the stream toggle from the session', () => {
    sessionStorage.setItem(STORAGE.stream, '1');
    withState((s) => expect(s.stream()).toBe(true));
  });
});
