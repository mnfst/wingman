// Snippet edits and header overrides are keyed by format:client:language. The
// property that matters is isolation: an edit made against one combination must
// never leak into another, or the code shown stops matching the request.
import { createRoot, createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { createRequestForm } from './requestForm';
import { PROFILE_BY_ID, type ProfileLang } from '../profiles';
import { FORMAT_BY_ID, type ApiFormatId, type RequestParams } from '../formats';

const params: RequestParams = {
  baseUrl: 'https://app.manifest.build',
  apiKey: 'mnfst_test',
  model: 'auto',
  systemPrompt: '',
  userMessage: 'hello',
};

/** A form wired to signals a test can drive, torn down when `dispose` is called. */
function setup(initial: { formatId?: ApiFormatId; profileId?: string; lang?: ProfileLang } = {}) {
  return createRoot((dispose) => {
    const [formatId, setFormatId] = createSignal<ApiFormatId>(initial.formatId ?? 'openai-chat');
    const [profileId, setProfileId] = createSignal(initial.profileId ?? 'openai-sdk');
    const [lang, setLang] = createSignal<ProfileLang>(initial.lang ?? 'typescript');
    const form = createRequestForm({
      formatId,
      format: () => FORMAT_BY_ID[formatId()]!,
      profile: () => PROFILE_BY_ID[profileId()]!,
      lang,
      params: () => params,
    });
    return { ...form, setFormatId, setProfileId, setLang, dispose };
  });
}

describe('sdk snippet', () => {
  it('starts from the generated snippet', () => {
    const f = setup();
    expect(f.sdkCode()).toContain('import OpenAI from "openai";');
    expect(f.sdkCodeIsEdited()).toBe(false);
    f.dispose();
  });

  it('reports an edit and keeps it', () => {
    const f = setup();
    f.onSdkCodeChange('// mine');
    expect(f.sdkCode()).toBe('// mine');
    expect(f.sdkCodeIsEdited()).toBe(true);
    f.dispose();
  });

  // Typing the generated code back by hand is not an edit — Send should return
  // to driving the request from the form.
  it('stops counting as edited once the text matches the generated snippet again', () => {
    const f = setup();
    const generated = f.sdkCode();
    f.onSdkCodeChange('// mine');
    f.onSdkCodeChange(generated);
    expect(f.sdkCodeIsEdited()).toBe(false);
    f.dispose();
  });

  it('reverts to the generated snippet on reset', () => {
    const f = setup();
    f.onSdkCodeChange('// mine');
    f.resetSdkCode();
    expect(f.sdkCodeIsEdited()).toBe(false);
    expect(f.sdkCode()).toContain('import OpenAI');
    f.dispose();
  });

  it('keeps a separate edit per language and restores it on return', () => {
    const f = setup();
    f.onSdkCodeChange('// typescript');
    f.setLang('python');
    expect(f.sdkCode()).toContain('from openai import OpenAI');
    f.setLang('typescript');
    expect(f.sdkCode()).toBe('// typescript');
    f.dispose();
  });

  it('keeps a separate edit per client', () => {
    const f = setup();
    f.onSdkCodeChange('// openai');
    f.setProfileId('langchain');
    expect(f.sdkCode()).toContain('@langchain/openai');
    f.dispose();
  });

  it('keeps a separate edit per format', () => {
    const f = setup({ profileId: 'default', lang: 'bash' });
    f.onSdkCodeChange('# chat');
    f.setFormatId('anthropic-messages');
    expect(f.sdkCode()).toContain('/v1/messages');
    f.dispose();
  });
});

describe('running the snippet instead of the form', () => {
  it('only offers to run an edited snippet a runner exists for', () => {
    const f = setup();
    expect(f.sdkExecutable()).toBe(true);
    expect(f.willRunCode()).toBe(false);
    f.onSdkCodeChange('// mine');
    expect(f.willRunCode()).toBe(true);
    f.dispose();
  });

  // Python has no in-browser runtime here, so an edit there is preview-only.
  it('never runs a language with no runtime, however edited', () => {
    const f = setup({ lang: 'python' });
    f.onSdkCodeChange('# mine');
    expect(f.sdkExecutable()).toBe(false);
    expect(f.willRunCode()).toBe(false);
    f.dispose();
  });

  // The client's `executable` flag and the runner registry have to agree; a
  // client marked non-executable stays non-executable even with a runner.
  it('respects a client that opts out of execution', () => {
    const f = setup({ profileId: 'openai-responses', formatId: 'openai-responses' });
    expect(f.sdkExecutable()).toBe(false);
    f.dispose();
  });
});

describe('request headers', () => {
  it("layers the client's fingerprint over the format defaults", () => {
    const f = setup({ formatId: 'anthropic-messages', profileId: 'anthropic-sdk' });
    expect(f.headerEntries().map((e) => e.key)).toContain('anthropic-version');
    f.dispose();
  });

  it('replaces the defaults once overridden, and restores them on reset', () => {
    const f = setup();
    f.updateHeaderEntries([{ key: 'X-Mine', value: '1' }]);
    expect(f.headerEntries()).toEqual([{ key: 'X-Mine', value: '1' }]);
    f.resetHeaders();
    expect(f.headerEntries().map((e) => e.key)).toContain('X-Stainless-Lang');
    f.dispose();
  });

  it('keeps overrides per format, client and language', () => {
    const f = setup();
    f.updateHeaderEntries([{ key: 'X-Mine', value: '1' }]);
    f.setLang('python');
    expect(f.headerEntries().map((e) => e.key)).not.toContain('X-Mine');
    f.setLang('typescript');
    expect(f.headerEntries()).toEqual([{ key: 'X-Mine', value: '1' }]);
    f.dispose();
  });

  // The SDK profiles set a User-Agent that fetch silently drops; the Headers
  // tab warns about it, so the list has to be derived from the live entries.
  it('names the headers the browser will drop', () => {
    const f = setup();
    expect(f.blockedHeaderNames()).toContain('User-Agent');
    f.updateHeaderEntries([{ key: 'X-Allowed', value: '1' }]);
    expect(f.blockedHeaderNames()).toEqual([]);
    f.dispose();
  });
});
