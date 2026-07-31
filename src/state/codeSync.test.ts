import { createRoot } from 'solid-js';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAppState, type AppState } from './appState';
import { recordFromEntries } from '../services/settings';

// Drives the real app state, because the point of the two-way binding is that
// the Code panel and the bars above it are the same request, so a test against
// the parser alone would prove the halves work and not that they're joined.

function withState(run: (s: AppState) => void) {
  createRoot((dispose) => {
    run(createAppState());
    dispose();
  });
}

/** Put the form on a client whose snippet spells everything out. */
function useDefaultClient(s: AppState) {
  s.setFormatSafely('openai-chat');
  s.setProfileSafely('default');
  s.setLang('bash');
  s.handleBaseUrlInput('https://gateway.example.com');
  s.persistAndSetKey('mnfst_live_9f3ab21c');
  s.persistAndSetModel('auto');
  s.setUserMessage('Say hello.');
  s.updateSystemPrompt('Be terse.');
}

beforeEach(() => sessionStorage.clear());

describe('editing the snippet moves the form', () => {
  it('retargets the URL bar', () => {
    withState((s) => {
      useDefaultClient(s);
      s.onSdkCodeChange(s.sdkCode().replace('gateway.example.com', 'other.example.com'));
      expect(s.normalized().base).toBe('https://other.example.com');
    });
  });

  it('changes the model', () => {
    withState((s) => {
      useDefaultClient(s);
      s.onSdkCodeChange(s.sdkCode().replace('"model": "auto"', '"model": "gpt-4o"'));
      expect(s.model()).toBe('gpt-4o');
    });
  });

  it('changes the message the composer shows', () => {
    withState((s) => {
      useDefaultClient(s);
      s.onSdkCodeChange(s.sdkCode().replace('Say hello.', 'Say goodbye.'));
      expect(s.userMessage()).toBe('Say goodbye.');
    });
  });

  it('adds a header to the Headers tab', () => {
    withState((s) => {
      useDefaultClient(s);
      const withHeader = s
        .sdkCode()
        .replace(
          '-H "Content-Type: application/json"',
          '-H "Content-Type: application/json" \\\n  -H "X-Trace-Id: abc-123"',
        );
      s.onSdkCodeChange(withHeader);
      expect(recordFromEntries(s.headerEntries())).toEqual({ 'X-Trace-Id': 'abc-123' });
    });
  });

  it('never files the injected auth header into the Headers tab', () => {
    withState((s) => {
      useDefaultClient(s);
      s.onSdkCodeChange(s.sdkCode());
      expect(recordFromEntries(s.headerEntries())).toEqual({});
    });
  });

  it('leaves the key alone when the snippet only references it', () => {
    withState((s) => {
      useDefaultClient(s);
      s.onSdkCodeChange(s.sdkCode().replace('Say hello.', 'Say goodbye.'));
      expect(s.apiKey()).toBe('mnfst_live_9f3ab21c');
    });
  });

  it('takes a key typed into a revealed snippet', () => {
    withState((s) => {
      useDefaultClient(s);
      s.setRevealKey(true);
      s.onSdkCodeChange(s.sdkCode().replace('mnfst_live_9f3ab21c', 'mnfst_live_replaced'));
      expect(s.apiKey()).toBe('mnfst_live_replaced');
    });
  });
});

describe('the two directions agree', () => {
  // Once an edit has been absorbed the code matches what the form would
  // generate again, so the "edited" badge clears and Send goes back to using
  // the form. Anything else means the round trip lost something.
  it('stops counting as edited once the change lands in the form', () => {
    withState((s) => {
      useDefaultClient(s);
      s.onSdkCodeChange(s.sdkCode().replace('Say hello.', 'Say goodbye.'));
      expect(s.sdkCodeIsEdited()).toBe(false);
    });
  });

  it('holds for the fetch rendering too', () => {
    withState((s) => {
      useDefaultClient(s);
      s.setLang('typescript');
      s.onSdkCodeChange(s.sdkCode().replace('gateway.example.com', 'other.example.com'));
      expect(s.sdkCodeIsEdited()).toBe(false);
      expect(s.normalized().base).toBe('https://other.example.com');
    });
  });

  it('holds for an SDK client', () => {
    withState((s) => {
      useDefaultClient(s);
      s.setProfileSafely('openai-sdk');
      s.setLang('typescript');
      s.onSdkCodeChange(s.sdkCode().replace('"auto"', '"gpt-4o"'));
      expect(s.model()).toBe('gpt-4o');
      expect(s.sdkCodeIsEdited()).toBe(false);
    });
  });

  it('still flags a snippet the form cannot express', () => {
    withState((s) => {
      useDefaultClient(s);
      s.setProfileSafely('openai-sdk');
      s.setLang('typescript');
      s.onSdkCodeChange(s.sdkCode() + '\n// a note the form has nowhere to put');
      expect(s.sdkCodeIsEdited()).toBe(true);
    });
  });
});

describe('changing the form moves the snippet', () => {
  it('follows the URL bar, the model and the message', () => {
    withState((s) => {
      useDefaultClient(s);
      s.handleBaseUrlInput('https://other.example.com');
      s.persistAndSetModel('gpt-4o');
      s.setUserMessage('Say goodbye.');
      const code = s.sdkCode();
      expect(code).toContain('https://other.example.com');
      expect(code).toContain('"model": "gpt-4o"');
      expect(code).toContain('Say goodbye.');
    });
  });

  it('follows the Headers tab', () => {
    withState((s) => {
      useDefaultClient(s);
      s.updateHeaderEntries([{ key: 'X-Trace-Id', value: 'abc-123' }]);
      expect(s.sdkCode()).toContain('-H "X-Trace-Id: abc-123"');
    });
  });

  it('keeps the key out of the snippet until it is revealed', () => {
    withState((s) => {
      useDefaultClient(s);
      expect(s.sdkCode()).not.toContain('mnfst_live_9f3ab21c');
      expect(s.sdkCode()).toContain('$MANIFEST_API_KEY');
      s.setRevealKey(true);
      expect(s.sdkCode()).toContain('mnfst_live_9f3ab21c');
    });
  });

  // Provider presets name their own credential, so the reference reads like
  // the env var that project would already have exported.
  it('names the env var after the provider', () => {
    withState((s) => {
      s.selectProvider('openai');
      s.persistAndSetKey('sk-test');
      expect(s.keyEnvName()).toBe('OPENAI_API_KEY');
      expect(s.sdkCode()).toContain('OPENAI_API_KEY');
      expect(s.sdkCode()).not.toContain('sk-test');
    });
  });
});

describe('editing the system prompt in the snippet', () => {
  it('moves the System Prompt tab', () => {
    withState((s) => {
      useDefaultClient(s);
      s.onSdkCodeChange(s.sdkCode().replace('Be terse.', 'Answer in French.'));
      expect(s.systemPrompts()['default']).toBe('Answer in French.');
    });
  });
});

describe('what the snippet is not allowed to move', () => {
  // The agent clients only write a provider config, so their snippet has no
  // room for the prompt. Editing one must not read as "the prompt was deleted".
  it('leaves the system prompt alone for a client whose snippet omits it', () => {
    withState((s) => {
      s.setFormatSafely('openai-chat');
      s.setProfileSafely('openclaw');
      s.setUserMessage('Say hello.');
      const before = s.systemPrompts()['openclaw'];
      expect(before).toBeTruthy();

      s.onSdkCodeChange(s.sdkCode().replace('Say hello.', 'Say goodbye.'));

      expect(s.systemPrompts()['openclaw']).toBe(before);
    });
  });

  // A fingerprint client has no editable headers, so nothing the snippet says
  // about them may reach the (hidden) Headers tab.
  it('leaves the headers alone for a locked client', () => {
    withState((s) => {
      s.setFormatSafely('openai-chat');
      s.setProfileSafely('openai-sdk');
      s.setLang('typescript');
      const before = recordFromEntries(s.headerEntries());

      s.onSdkCodeChange(
        s.sdkCode().replace('const client', 'const extra = { "X-Trace": "1" };\nconst client'),
      );

      expect(recordFromEntries(s.headerEntries())).toEqual(before);
    });
  });

  // Re-applying the same set would rebuild every row and steal the caret, so
  // an edit that says nothing new about the headers must write no override.
  it('records no header override when the snippet names the headers already set', () => {
    withState((s) => {
      useDefaultClient(s);
      const before = recordFromEntries(s.headerEntries());

      s.onSdkCodeChange(s.sdkCode().replace('Say hello.', 'Say goodbye.'));

      expect(recordFromEntries(s.headerEntries())).toEqual(before);
      expect(s.headerOverrides()).toEqual({});
    });
  });
});
