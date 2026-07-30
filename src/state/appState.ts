// All reactive state for the app, created once from App. Actions that involve
// the network/history live in appActions.ts; boot-time resolution helpers in
// services/settings.ts.
import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import type { HeaderEntry } from '../components/HeaderEditor.jsx';
import {
  PROFILES,
  PROFILE_BY_ID,
  profilesForFormat,
  type Profile,
  type ProfileLang,
} from '../profiles';
import { FORMATS, FORMAT_BY_ID, type ApiFormat, type ApiFormatId } from '../formats';
import { PROVIDER_BY_ID, DEFAULT_PROVIDER_ID, CUSTOM_PROVIDER, type Provider } from '../providers';
import { partitionHeaders, type SendResult } from '../send';
import { listHistory, type HistoryEntry } from '../services/history';
import { checkHealth, type HealthStatus } from '../services/healthCheck';
import { defaultBaseUrl, normalizeBaseUrl } from '../services/baseUrl';
import { fetchModels } from '../services/models';
import { isExecutable } from '../runners';
import {
  STORAGE,
  entriesFromRecord,
  recordFromEntries,
  readStorage,
  resolveBootState,
  resolveInitialProfile,
  writeStorage,
  type ApiKeyMap,
} from '../services/settings';

export type AppState = ReturnType<typeof createAppState>;

/** Config tabs under the URL bar (the Postman Params/Auth/Headers/Body slot). */
export type ConfigTabId = 'client' | 'headers' | 'system' | 'code';

export function createAppState() {
  const boot = resolveBootState();

  const [providerId, setProviderId] = createSignal(boot.providerId);
  const [baseUrl, setBaseUrl] = createSignal(boot.baseUrl);
  const [apiKeys, setApiKeys] = createSignal<ApiKeyMap>(boot.apiKeys);
  const [model, setModel] = createSignal(readStorage(STORAGE.model, 'auto'));
  const [formatId, setFormatId] = createSignal<ApiFormatId>(boot.formatId);
  const [profileId, setProfileId] = createSignal(resolveInitialProfile(boot.formatId));
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
  // The draft tab's unsent text, parked while a history tab is open so
  // switching back to "Untitled" restores what was being typed.
  const [draftMessage, setDraftMessage] = createSignal('');
  const [configTab, setConfigTab] = createSignal<ConfigTabId>('client');
  const [modelList, setModelList] = createSignal<string[]>([]);
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

  // Populate the model dropdown from the endpoint's own catalog whenever the
  // target changes. Debounced past typing; failures just leave the field
  // free-text (many providers don't allow browser CORS on GET /v1/models).
  createEffect(() => {
    const n = normalized();
    const key = apiKey();
    const fmt = format();
    if (!n.valid || !n.base) {
      setModelList([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchModels(n.base, key, fmt, controller.signal).then((models) => {
        if (!controller.signal.aborted) setModelList(models);
      });
    }, 500);
    onCleanup(() => {
      window.clearTimeout(timer);
      controller.abort();
    });
  });

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

  return {
    // signals
    providerId,
    setProviderId,
    baseUrl,
    apiKeys,
    model,
    formatId,
    setFormatId,
    profileId,
    setProfileId,
    stream,
    systemPrompts,
    setSystemPrompts,
    userMessage,
    setUserMessage,
    draftMessage,
    setDraftMessage,
    configTab,
    setConfigTab,
    modelList,
    headerOverrides,
    setHeaderOverrides,
    lang,
    setLang,
    result,
    setResult,
    loading,
    setLoading,
    streamingText,
    setStreamingText,
    hasSent,
    setHasSent,
    sentMessage,
    setSentMessage,
    history,
    setHistory,
    activeHistoryId,
    setActiveHistoryId,
    saveStatus,
    setSaveStatus,
    gistMarkdown,
    setGistMarkdown,
    gistModalOpen,
    setGistModalOpen,
    healthStatus,
    // derived
    provider,
    apiKey,
    format,
    availableProfiles,
    profile,
    normalized,
    params,
    requestUrl,
    sdkCode,
    sdkCodeIsEdited,
    sdkExecutable,
    willRunCode,
    headerEntries,
    blockedHeaderNames,
    // actions
    onSdkCodeChange,
    resetSdkCode,
    updateHeaderEntries,
    resetHeaders,
    setProfileSafely,
    setFormatSafely,
    persistAndSetBase,
    persistAndSetKey,
    persistAndSetModel,
    persistAndSetStream,
    selectProvider,
    handleBaseUrlInput,
    updateSystemPrompt,
  };
}
