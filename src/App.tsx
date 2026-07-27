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
import {
  PROVIDERS,
  PROVIDER_BY_ID,
  DEFAULT_PROVIDER_ID,
  CUSTOM_PROVIDER,
  MANIFEST_BASE_URL,
  type Provider,
} from './providers';
import { partitionHeaders, sendRequest, sendRequestStreaming, type SendResult } from './send';
import {
  appendHistory,
  clearHistory,
  deleteHistory,
  listHistory,
  type HistoryEntry,
} from './services/history';
import { checkHealth, type HealthStatus } from './services/healthCheck';
import { normalizeBaseUrl } from './services/baseUrl';
import { isExecutable, runUserCode } from './runners';
import { buildMarkdownReport } from './services/gist';
import GistModal from './components/GistModal.jsx';

const STORAGE = {
  baseUrl: 'wingman:baseUrl',
  apiKeys: 'wingman:apiKeys',
  model: 'wingman:model',
  profile: 'wingman:profile',
  format: 'wingman:format',
  stream: 'wingman:stream',
  provider: 'wingman:provider',
};

// The pre-per-provider slot: a single key shared by every provider. Read once
// on boot and folded into the map (see `readApiKeys`), then dropped.
const LEGACY_API_KEY = 'wingman:apiKey';

// API keys are stored in sessionStorage (cleared on tab close) instead of
// localStorage so contributors don't leave a long-lived `mnfst_*` token in
// disk-backed browser storage. Everything else (base URL, model, profile,
// system prompts, history) stays in localStorage since it's not sensitive.
const SENSITIVE_KEYS = new Set<string>([STORAGE.apiKeys, LEGACY_API_KEY]);

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

function removeStorage(key: string): void {
  try {
    storageFor(key).removeItem(key);
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
  // Wingman is a Manifest gateway tester first, so default the Base URL to the
  // canonical Manifest Cloud gateway — the user shouldn't have to type it. On
  // localhost we instead guess the local gateway port so `npm run dev` targets
  // a locally-running Manifest. The health badge surfaces reachability / CORS.
  if (typeof window === 'undefined') return MANIFEST_BASE_URL;
  const { protocol, hostname, port } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    if (port === '3002' || port === '3000') return `${protocol}//${hostname}:3001`;
    return `${protocol}//${hostname}:${port || '3001'}`;
  }
  return MANIFEST_BASE_URL;
}

// An external embed (?baseUrl=…, e.g. the Manifest dashboard drawer) is always
// the Custom/Manifest preset. Otherwise restore the last-picked preset.
function resolveInitialProvider(baseUrlParam: string | null): string {
  if (baseUrlParam) return DEFAULT_PROVIDER_ID;
  const stored = readStorage(STORAGE.provider, DEFAULT_PROVIDER_ID);
  return PROVIDER_BY_ID[stored] ? stored : DEFAULT_PROVIDER_ID;
}

function resolveInitialFormat(providerId: string): ApiFormatId {
  const param = readQueryParam('format');
  if (param && FORMAT_BY_ID[param]) return param as ApiFormatId;
  // A concrete provider preset dictates its own wire format.
  const preset = PROVIDER_BY_ID[providerId];
  if (preset && preset.id !== DEFAULT_PROVIDER_ID) return preset.formatId;
  const stored = readStorage(STORAGE.format, DEFAULT_FORMAT_ID);
  return FORMAT_BY_ID[stored] ? (stored as ApiFormatId) : DEFAULT_FORMAT_ID;
}

// Match a base URL back to a preset (used when restoring history) so the
// provider pill stays in sync; anything unrecognised is "Custom".
function providerForBaseUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, '');
  const match = PROVIDERS.find((p) => p.baseUrl && p.baseUrl === trimmed);
  return match ? match.id : DEFAULT_PROVIDER_ID;
}

/** API keys keyed by provider id. Only non-empty keys are kept. */
type ApiKeyMap = Record<string, string>;

function parseApiKeyMap(raw: string): ApiKeyMap {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: ApiKeyMap = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value) out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

// Keys are held per provider rather than globally: each provider issues its own
// credential, so a single shared key meant switching preset silently carried an
// `sk-…` into an Anthropic `x-api-key` header (a guaranteed 401) with no way to
// get the previous key back short of re-pasting it.
function readApiKeys(currentProviderId: string): ApiKeyMap {
  const map = parseApiKeyMap(readStorage(STORAGE.apiKeys, ''));
  // A session that predates the map still has the old shared key. Attribute it
  // to the provider that was selected when it was typed and drop the old slot.
  const legacy = readStorage(LEGACY_API_KEY, '');
  if (legacy) {
    removeStorage(LEGACY_API_KEY);
    if (!map[currentProviderId]) {
      map[currentProviderId] = legacy;
      writeStorage(STORAGE.apiKeys, JSON.stringify(map));
    }
  }
  return map;
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
  const initialProviderId = resolveInitialProvider(baseUrlParam);
  const initialProvider = PROVIDER_BY_ID[initialProviderId] ?? CUSTOM_PROVIDER;
  // For a concrete preset, the base URL comes from the catalog (the field is
  // only free-text in Custom mode, so it can't drift). Custom falls back to the
  // ?baseUrl= param, stored value, or the localhost dev guess.
  const initialBaseUrl =
    baseUrlParam ??
    (initialProvider.id !== DEFAULT_PROVIDER_ID
      ? initialProvider.baseUrl
      : readStorage(STORAGE.baseUrl, defaultBaseUrl()));
  const initialApiKeys = readApiKeys(initialProviderId);
  if (apiKeyParam) initialApiKeys[initialProviderId] = apiKeyParam;
  if (baseUrlParam) writeStorage(STORAGE.baseUrl, baseUrlParam);
  if (apiKeyParam) writeStorage(STORAGE.apiKeys, JSON.stringify(initialApiKeys));
  const initialFormatId = resolveInitialFormat(initialProviderId);
  const [providerId, setProviderId] = createSignal(initialProviderId);
  const [baseUrl, setBaseUrl] = createSignal(initialBaseUrl);
  const [apiKeys, setApiKeys] = createSignal<ApiKeyMap>(initialApiKeys);
  const [model, setModel] = createSignal(readStorage(STORAGE.model, 'auto'));
  const [formatId, setFormatId] = createSignal<ApiFormatId>(initialFormatId);
  const [profileId, setProfileId] = createSignal(resolveInitialProfile(initialFormatId));
  const [stream, setStream] = createSignal(readStorage(STORAGE.stream, '0') === '1');

  const provider = createMemo<Provider>(() => PROVIDER_BY_ID[providerId()] ?? CUSTOM_PROVIDER);
  // The key field shows whatever belongs to the active provider — so switching
  // preset blanks it (until that provider is keyed) and switching back fills it.
  const apiKey = createMemo(() => apiKeys()[providerId()] ?? '');
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
    // Only the Manifest gateway exposes `/api/v1/health`; probing a public
    // provider host (api.openai.com, …) would 404 and show a false "unreachable".
    if (provider().id !== DEFAULT_PROVIDER_ID || !url || !path) {
      setHealthStatus({ kind: 'idle' });
      return;
    }
    const controller = new AbortController();
    const formatPath = format().path;
    const timer = window.setTimeout(() => {
      setHealthStatus({ kind: 'checking' });
      checkHealth(url, path, formatPath, controller.signal).then(setHealthStatus);
    }, 400);
    onCleanup(() => {
      window.clearTimeout(timer);
      controller.abort();
    });
  });

  // One normalisation for the whole app: the SDK snippet, the health probe and
  // the request itself all read from here, so the code Wingman shows you is the
  // code that would reproduce the call it just made.
  const normalized = createMemo(() => normalizeBaseUrl(baseUrl(), format().path));

  const params = () => ({
    baseUrl: normalized().base,
    apiKey: apiKey(),
    model: model(),
    systemPrompt: systemPrompts()[profile().id] ?? '',
    userMessage: userMessage(),
  });

  const requestUrl = () => normalized().requestUrl;

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
  const setKeyFor = (id: string, value: string) => {
    const next = { ...apiKeys() };
    if (value) next[id] = value;
    else delete next[id];
    setApiKeys(next);
    writeStorage(STORAGE.apiKeys, JSON.stringify(next));
  };
  const persistAndSetKey = (value: string) => setKeyFor(providerId(), value);
  const persistAndSetModel = (value: string) => {
    setModel(value);
    writeStorage(STORAGE.model, value);
  };
  const persistAndSetStream = (value: boolean) => {
    setStream(value);
    writeStorage(STORAGE.stream, value ? '1' : '0');
  };

  // Pick a provider preset: switch to its wire format and, for a concrete
  // provider, fill the base URL + a usable default model. Selecting "Custom /
  // Manifest" resets to the Manifest gateway defaults (base URL pre-filled, the
  // `auto` router model) — the field stays free-text for a BYO endpoint. The
  // API key needs no handling here: it's derived from the active provider.
  const selectProvider = (id: string) => {
    const preset = PROVIDER_BY_ID[id];
    if (!preset || id === providerId()) return;
    setProviderId(id);
    writeStorage(STORAGE.provider, id);
    setFormatSafely(preset.formatId);
    if (preset.id === DEFAULT_PROVIDER_ID) {
      persistAndSetBase(defaultBaseUrl());
      persistAndSetModel('auto');
    } else {
      persistAndSetBase(preset.baseUrl);
      persistAndSetModel(preset.defaultModel);
    }
  };

  // Typing in the Base URL field means the user has gone off-preset — flip to
  // Custom (keeping model/format) so the field stays fully free-text. Retargeting
  // the URL isn't a deliberate provider switch, so the key already typed follows
  // the user across (unless Custom is already keyed — never clobber that one).
  const handleBaseUrlInput = (value: string) => {
    persistAndSetBase(value);
    if (providerId() !== DEFAULT_PROVIDER_ID) {
      const carried = apiKey();
      setProviderId(DEFAULT_PROVIDER_ID);
      writeStorage(STORAGE.provider, DEFAULT_PROVIDER_ID);
      if (carried && !apiKeys()[DEFAULT_PROVIDER_ID]) setKeyFor(DEFAULT_PROVIDER_ID, carried);
    }
  };

  const updateSystemPrompt = (value: string) => {
    setSystemPrompts({ ...systemPrompts(), [profile().id]: value });
  };

  const errorResult = (message: string, statusText = 'Code error'): SendResult => ({
    url: requestUrl(),
    status: 0,
    statusText,
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

    // Stop before `fetch` does. An unusable base URL used to surface either a
    // raw "Failed to parse URL" TypeError or — worse, for a schemeless value —
    // a request resolved against Wingman's own origin, quietly shipping the
    // user's API key somewhere they never pointed at.
    if (!normalized().valid) {
      setResult(errorResult(normalized().problem ?? 'Invalid base URL.', 'Invalid base URL'));
      setLoading(false);
      return;
    }

    if (willRunCode()) {
      // The user edited the SDK preview, and the profile/lang combination can
      // execute it in-browser. Run the code through the stub SDK; whatever
      // fetch the code triggers becomes the SendResult.
      try {
        const out = await runUserCode({
          profileId: profile().id,
          code: sdkCode(),
          baseUrl: normalized().base,
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
    const restoredProvider = providerForBaseUrl(entry.baseUrl);
    setProviderId(restoredProvider);
    writeStorage(STORAGE.provider, restoredProvider);
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
      url: entry.url ?? normalizeBaseUrl(entry.baseUrl, fmt.path).requestUrl,
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
            providers={PROVIDERS}
            activeProviderId={provider().id}
            onSelectProvider={selectProvider}
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
            requestUrl={normalized().requestUrl}
            baseUrlNote={normalized().note}
            baseUrlProblem={normalized().problem}
            baseUrlPlaceholder={format().placeholderBaseUrl ?? 'https://your-manifest.example.com'}
            apiKey={apiKey()}
            apiKeyPlaceholder={provider().apiKeyPlaceholder}
            model={model()}
            onBaseUrlChange={handleBaseUrlInput}
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
