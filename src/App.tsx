import { createEffect, createMemo, createSignal, onCleanup, type Component } from 'solid-js';
import TopBar from './components/TopBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import Conversation from './components/Conversation.jsx';
import Composer from './components/Composer.jsx';
import { type HeaderEntry } from './components/HeaderEditor.jsx';
import {
  PROFILES,
  PROFILE_BY_ID,
  profilesForFormat,
  type Profile,
  type ProfileLang,
} from './profiles';
import {
  FORMATS,
  FORMAT_BY_ID,
  DEFAULT_FORMAT_ID,
  type ApiFormat,
  type ApiFormatId,
} from './formats';
import { partitionHeaders, sendRequest, sendRequestStreaming, type SendResult } from './send';
import {
  appendHistory,
  clearHistory,
  deleteHistory,
  listHistory,
  type HistoryEntry,
} from './services/history';
import { checkHealth, type HealthStatus } from './services/healthCheck';
import { isExecutable, runUserCode } from './runners';
import { buildMarkdownReport } from './services/gist';
import GistModal from './components/GistModal.jsx';

const STORAGE = {
  baseUrl: 'wingman:baseUrl',
  apiKey: 'wingman:apiKey',
  model: 'wingman:model',
  profile: 'wingman:profile',
  format: 'wingman:format',
  stream: 'wingman:stream',
};

// API keys are stored in sessionStorage (cleared on tab close) instead of
// localStorage so contributors don't leave a long-lived `mnfst_*` token in
// disk-backed browser storage. Everything else (base URL, model, profile,
// system prompts, history) stays in localStorage since it's not sensitive.
const SENSITIVE_KEYS = new Set<string>(['wingman:apiKey']);

function storageFor(key: string): Storage {
  return SENSITIVE_KEYS.has(key) ? sessionStorage : localStorage;
}

function readStorage(key: string, fallback: string): string {
  try {
    const value = storageFor(key).getItem(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function readQueryParam(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URL(window.location.href).searchParams.get(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    storageFor(key).setItem(key, value);
  } catch {
    /* ignore */
  }
}

function entriesFromRecord(record: Record<string, string>): HeaderEntry[] {
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}

function recordFromEntries(entries: HeaderEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of entries) {
    if (key.trim()) out[key.trim()] = value;
  }
  return out;
}

function defaultBaseUrl(): string {
  // Hosted Wingman has no implicit backend — leave the field empty so the
  // user must paste a URL or follow the ?baseUrl= query param. Pre-filling a
  // localhost guess on wingman.manifest.build would only produce confusing
  // CORS errors.
  if (typeof window === 'undefined') return '';
  const { protocol, hostname, port } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    if (port === '3002' || port === '3000') return `${protocol}//${hostname}:3001`;
    return `${protocol}//${hostname}:${port || '3001'}`;
  }
  return '';
}

function resolveInitialFormat(): ApiFormatId {
  const param = readQueryParam('format');
  if (param && FORMAT_BY_ID[param]) return param as ApiFormatId;
  const stored = readStorage(STORAGE.format, DEFAULT_FORMAT_ID);
  return FORMAT_BY_ID[stored] ? (stored as ApiFormatId) : DEFAULT_FORMAT_ID;
}

function resolveInitialProfile(formatId: ApiFormatId): string {
  const compatible = profilesForFormat(formatId);
  const stored = readStorage(STORAGE.profile, '');
  if (compatible.some((p) => p.id === stored)) return stored;
  return compatible[0]?.id ?? PROFILES[0]!.id;
}

const App: Component = () => {
  const baseUrlParam = readQueryParam('baseUrl');
  const apiKeyParam = readQueryParam('apiKey');
  const initialBaseUrl = baseUrlParam ?? readStorage(STORAGE.baseUrl, defaultBaseUrl());
  const initialApiKey = apiKeyParam ?? readStorage(STORAGE.apiKey, '');
  if (baseUrlParam) writeStorage(STORAGE.baseUrl, baseUrlParam);
  if (apiKeyParam) writeStorage(STORAGE.apiKey, apiKeyParam);
  const initialFormatId = resolveInitialFormat();
  const [baseUrl, setBaseUrl] = createSignal(initialBaseUrl);
  const [apiKey, setApiKey] = createSignal(initialApiKey);
  const [model, setModel] = createSignal(readStorage(STORAGE.model, 'auto'));
  const [formatId, setFormatId] = createSignal<ApiFormatId>(initialFormatId);
  const [profileId, setProfileId] = createSignal(resolveInitialProfile(initialFormatId));
  const [stream, setStream] = createSignal(readStorage(STORAGE.stream, '0') === '1');

  const format = createMemo<ApiFormat>(() => FORMAT_BY_ID[formatId()] ?? FORMATS[0]!);
  const availableProfiles = createMemo<Profile[]>(() => profilesForFormat(formatId()));
  const profile = createMemo<Profile>(
    () => PROFILE_BY_ID[profileId()] ?? availableProfiles()[0] ?? PROFILES[0]!,
  );

  const [systemPrompts, setSystemPrompts] = createSignal<Record<string, string>>(
    Object.fromEntries(PROFILES.map((p) => [p.id, p.defaultSystemPrompt ?? ''])),
  );
  const [userMessage, setUserMessage] = createSignal('Say hello in one short sentence.');
  const [headerOverrides, setHeaderOverrides] = createSignal<Record<string, HeaderEntry[]>>({});
  const [lang, setLang] = createSignal<ProfileLang>(profile().defaultLang);
  const [result, setResult] = createSignal<SendResult | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [streamingText, setStreamingText] = createSignal('');
  const [hasSent, setHasSent] = createSignal(false);
  const [sentMessage, setSentMessage] = createSignal('');
  const [history, setHistory] = createSignal<HistoryEntry[]>(listHistory());
  const [activeHistoryId, setActiveHistoryId] = createSignal<string | null>(null);
  const [saveStatus, setSaveStatus] = createSignal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [gistMarkdown, setGistMarkdown] = createSignal<string>('');
  const [gistModalOpen, setGistModalOpen] = createSignal(false);
  // Edited code per `${formatId}:${profileId}:${lang}` — when present, it
  // overrides the generated snippet AND becomes the source of truth for Send
  // (provided the profile is executable in this language).
  const [scratchCode, setScratchCode] = createSignal<Record<string, string>>({});
  const [healthStatus, setHealthStatus] = createSignal<HealthStatus>({ kind: 'idle' });

  // Pre-flight health check — only formats that expose a health path (the
  // Manifest gateway's `/api/v1/health`) get probed; public provider APIs have
  // no such endpoint, so we skip rather than show a misleading "unreachable".
  createEffect(() => {
    const url = baseUrl().trim();
    const path = format().healthPath;
    if (!url || !path) {
      setHealthStatus({ kind: 'idle' });
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setHealthStatus({ kind: 'checking' });
      checkHealth(url, path, controller.signal).then(setHealthStatus);
    }, 400);
    onCleanup(() => {
      window.clearTimeout(timer);
      controller.abort();
    });
  });

  const params = () => ({
    baseUrl: baseUrl().replace(/\/+$/, ''),
    apiKey: apiKey(),
    model: model(),
    systemPrompt: systemPrompts()[profile().id] ?? '',
    userMessage: userMessage(),
  });

  const requestUrl = () => `${baseUrl().replace(/\/+$/, '')}${format().path}`;

  const generatedSdkCode = createMemo(() => profile().code(params(), lang(), format()));

  const scratchKey = () => `${formatId()}:${profile().id}:${lang()}`;
  const sdkCodeIsEdited = () => {
    const v = scratchCode()[scratchKey()];
    return v !== undefined && v !== generatedSdkCode();
  };
  const sdkCode = () => scratchCode()[scratchKey()] ?? generatedSdkCode();
  const sdkExecutable = () => (profile().executable ?? false) && isExecutable(profile().id, lang());
  const willRunCode = () => sdkCodeIsEdited() && sdkExecutable();

  const onSdkCodeChange = (next: string) => {
    setScratchCode({ ...scratchCode(), [scratchKey()]: next });
  };
  const resetSdkCode = () => {
    const next = { ...scratchCode() };
    delete next[scratchKey()];
    setScratchCode(next);
  };

  // Default headers come from the format (e.g. anthropic-version); the profile
  // layers its fingerprint headers on top.
  const overrideKey = () => `${formatId()}:${profile().id}:${lang()}`;
  const headerEntries = createMemo<HeaderEntry[]>(() => {
    const cached = headerOverrides()[overrideKey()];
    if (cached) return cached;
    return entriesFromRecord({
      ...(format().defaultHeaders ?? {}),
      ...profile().headers(params()),
    });
  });

  const updateHeaderEntries = (next: HeaderEntry[]) => {
    setHeaderOverrides({ ...headerOverrides(), [overrideKey()]: next });
  };

  const resetHeaders = () => {
    const next = { ...headerOverrides() };
    delete next[overrideKey()];
    setHeaderOverrides(next);
  };

  const blockedHeaderNames = () => {
    const { blocked } = partitionHeaders(recordFromEntries(headerEntries()));
    return blocked;
  };

  const setProfileSafely = (id: string) => {
    setProfileId(id);
    writeStorage(STORAGE.profile, id);
    const nextProfile = PROFILE_BY_ID[id];
    if (nextProfile && !nextProfile.langs.includes(lang())) {
      setLang(nextProfile.defaultLang);
    }
  };

  const setFormatSafely = (id: string) => {
    if (!FORMAT_BY_ID[id]) return;
    setFormatId(id as ApiFormatId);
    writeStorage(STORAGE.format, id);
    // Keep the selected profile compatible with the new format.
    const compatible = profilesForFormat(id as ApiFormatId);
    if (!compatible.some((p) => p.id === profileId())) {
      const next = compatible[0];
      if (next) setProfileSafely(next.id);
    }
  };

  const persistAndSetBase = (value: string) => {
    setBaseUrl(value);
    writeStorage(STORAGE.baseUrl, value);
  };
  const persistAndSetKey = (value: string) => {
    setApiKey(value);
    writeStorage(STORAGE.apiKey, value);
  };
  const persistAndSetModel = (value: string) => {
    setModel(value);
    writeStorage(STORAGE.model, value);
  };
  const persistAndSetStream = (value: boolean) => {
    setStream(value);
    writeStorage(STORAGE.stream, value ? '1' : '0');
  };

  const updateSystemPrompt = (value: string) => {
    setSystemPrompts({ ...systemPrompts(), [profile().id]: value });
  };

  const errorResult = (message: string): SendResult => ({
    url: requestUrl(),
    status: 0,
    statusText: 'Code error',
    ok: false,
    durationMs: 0,
    requestHeaders: {},
    requestBody: '',
    responseHeaders: {},
    responseBody: '',
    responseJson: null,
    error: message,
  });

  const handleSend = async () => {
    setResult(null);
    setStreamingText('');
    setActiveHistoryId(null);
    setSaveStatus('idle');
    setLoading(true);
    setHasSent(true);
    setSentMessage(userMessage());

    const fmt = format();
    let next: SendResult;
    let sentHeaders: Record<string, string>;

    if (willRunCode()) {
      // The user edited the SDK preview, and the profile/lang combination can
      // execute it in-browser. Run the code through the stub SDK; whatever
      // fetch the code triggers becomes the SendResult.
      try {
        const out = await runUserCode({
          profileId: profile().id,
          code: sdkCode(),
          baseUrl: baseUrl().replace(/\/+$/, ''),
          apiKey: apiKey(),
        });
        next = out.result;
      } catch (err) {
        next = errorResult(err instanceof Error ? err.message : String(err));
      }
      sentHeaders = next.requestHeaders;
    } else {
      sentHeaders = recordFromEntries(headerEntries());
      const p = params();
      const body = {
        ...fmt.buildBody(p, { stream: stream() }),
        ...(profile().bodyExtras?.(p) ?? {}),
      };
      const url = requestUrl();
      const input = { url, apiKey: apiKey(), auth: fmt.auth, headers: sentHeaders, body };
      next = stream()
        ? await sendRequestStreaming(input, {
            createParser: fmt.createStreamParser,
            onDelta: (t) => setStreamingText((prev) => prev + t),
          })
        : await sendRequest(input);
    }

    setResult(next);
    setLoading(false);

    const stored = appendHistory({
      profileId: profile().id,
      profileLabel: profile().label,
      formatId: fmt.id,
      formatLabel: fmt.label,
      streamed: next.isStream ?? false,
      url: next.url,
      baseUrl: baseUrl(),
      model: model(),
      systemPrompt: systemPrompts()[profile().id] ?? '',
      userMessage: userMessage(),
      lang: lang(),
      headers: sentHeaders,
      status: next.status,
      statusText: next.statusText,
      ok: next.ok,
      durationMs: next.durationMs,
      assistantText: fmt.extractText(next.responseJson) ?? next.streamedText ?? null,
      requestBody: next.requestBody,
      requestHeaders: next.requestHeaders,
      responseBody: next.responseBody,
      responseHeaders: next.responseHeaders,
      responseJson: next.responseJson,
      errorMessage: next.error,
    });
    setHistory(listHistory());
    setActiveHistoryId(stored.id);
  };

  const restoreFromHistory = (entry: HistoryEntry) => {
    const restoredFormatId: ApiFormatId =
      entry.formatId && FORMAT_BY_ID[entry.formatId]
        ? (entry.formatId as ApiFormatId)
        : DEFAULT_FORMAT_ID;
    setFormatId(restoredFormatId);
    writeStorage(STORAGE.format, restoredFormatId);
    setProfileId(entry.profileId);
    writeStorage(STORAGE.profile, entry.profileId);
    persistAndSetBase(entry.baseUrl);
    persistAndSetModel(entry.model);
    if (entry.streamed !== undefined) persistAndSetStream(entry.streamed);
    setSystemPrompts({ ...systemPrompts(), [entry.profileId]: entry.systemPrompt });
    setUserMessage(entry.userMessage);
    setSentMessage(entry.userMessage);
    setHasSent(true);
    setStreamingText('');
    const next = PROFILE_BY_ID[entry.profileId];
    if (next) {
      const restoredLang = (
        next.langs.includes(entry.lang as ProfileLang) ? entry.lang : next.defaultLang
      ) as ProfileLang;
      setLang(restoredLang);
      setHeaderOverrides({
        ...headerOverrides(),
        [`${restoredFormatId}:${entry.profileId}:${restoredLang}`]: entriesFromRecord(
          entry.headers,
        ),
      });
    }
    setActiveHistoryId(entry.id);
    const fmt = FORMAT_BY_ID[restoredFormatId] ?? FORMATS[0]!;
    setResult({
      url: entry.url ?? `${entry.baseUrl.replace(/\/+$/, '')}${fmt.path}`,
      status: entry.status,
      statusText: entry.statusText,
      ok: entry.ok,
      durationMs: entry.durationMs,
      requestHeaders: entry.requestHeaders,
      requestBody: entry.requestBody,
      responseHeaders: entry.responseHeaders,
      responseBody: entry.responseBody,
      responseJson: entry.responseJson,
      error: entry.errorMessage,
      isStream: entry.streamed,
    });
  };

  const handleDelete = (id: string) => {
    deleteHistory(id);
    setHistory(listHistory());
    if (activeHistoryId() === id) setActiveHistoryId(null);
  };

  const handleClear = () => {
    if (history().length === 0) return;
    if (!confirm(`Delete all ${history().length} history entries?`)) return;
    clearHistory();
    setHistory([]);
    setActiveHistoryId(null);
  };

  const handleNewRequest = () => {
    setResult(null);
    setStreamingText('');
    setActiveHistoryId(null);
    setHasSent(false);
    setSentMessage('');
    setSaveStatus('idle');
  };

  const handleSaveToGist = () => {
    const r = result();
    if (!r) return;
    const markdown = buildMarkdownReport(
      {
        profileLabel: profile().label,
        profileCategory: profile().category,
        formatLabel: format().label,
        streamed: r.isStream ?? false,
        systemPrompt: systemPrompts()[profile().id] ?? '',
        userMessage: sentMessage() || userMessage(),
        baseUrl: baseUrl(),
        model: model(),
        apiKey: apiKey(),
      },
      r,
      format(),
    );
    setGistMarkdown(markdown);
    setGistModalOpen(true);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2500);
  };

  return (
    <div class="app">
      <Sidebar
        entries={history()}
        activeId={activeHistoryId()}
        onSelect={restoreFromHistory}
        onDelete={handleDelete}
        onClear={handleClear}
        onNewRequest={handleNewRequest}
      />
      <div class="app__main">
        <TopBar />
        <main class="app__thread">
          <Conversation
            userMessage={sentMessage()}
            result={result()}
            loading={loading()}
            hasSent={hasSent()}
            format={format()}
            streamingText={streamingText()}
          />
        </main>
        <div class="app__composer">
          <Composer
            formats={FORMATS}
            activeFormatId={formatId()}
            onSelectFormat={setFormatSafely}
            profiles={availableProfiles()}
            activeProfileId={profile().id}
            onSelectProfile={setProfileSafely}
            stream={stream()}
            onStreamChange={persistAndSetStream}
            systemPrompt={systemPrompts()[profile().id] ?? ''}
            onSystemPromptChange={updateSystemPrompt}
            showSystemPrompt={profile().mode !== 'raw'}
            userMessage={userMessage()}
            onUserMessageChange={setUserMessage}
            headers={headerEntries()}
            onHeadersChange={updateHeaderEntries}
            onResetHeaders={resetHeaders}
            blockedHeaders={blockedHeaderNames()}
            baseUrl={baseUrl()}
            baseUrlPlaceholder={format().placeholderBaseUrl ?? 'https://your-manifest.example.com'}
            apiKey={apiKey()}
            model={model()}
            onBaseUrlChange={persistAndSetBase}
            onApiKeyChange={persistAndSetKey}
            onModelChange={persistAndSetModel}
            loading={loading()}
            onSend={handleSend}
            sdkCode={sdkCode()}
            sdkLang={lang()}
            sdkLangOptions={profile().langs}
            onSdkLangChange={setLang}
            onSdkCodeChange={onSdkCodeChange}
            sdkCodeIsEdited={sdkCodeIsEdited()}
            onResetSdkCode={resetSdkCode}
            sdkExecutable={sdkExecutable()}
            headersLocked={profile().headersLocked ?? false}
            willRunCode={willRunCode()}
            canSave={result() !== null && !loading()}
            onSaveToGist={handleSaveToGist}
            saveStatus={saveStatus()}
            healthStatus={healthStatus()}
          />
        </div>
      </div>
      <GistModal
        open={gistModalOpen()}
        markdown={gistMarkdown()}
        onClose={() => setGistModalOpen(false)}
      />
    </div>
  );
};

export default App;
