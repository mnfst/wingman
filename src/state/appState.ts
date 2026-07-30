// All reactive state for the app, created once from App. Actions that involve
// the network/history live in appActions.ts; the per-client snippet and header
// overrides in requestForm.ts; the health/model lookups in probes.ts; and
// boot-time resolution helpers in services/settings.ts.
import { createMemo, createSignal } from 'solid-js';
import {
  PROFILES,
  PROFILE_BY_ID,
  profilesForFormat,
  type Profile,
  type ProfileLang,
} from '../profiles';
import { FORMATS, FORMAT_BY_ID, type ApiFormat, type ApiFormatId } from '../formats';
import { PROVIDER_BY_ID, DEFAULT_PROVIDER_ID, CUSTOM_PROVIDER, type Provider } from '../providers';
import { type SendResult } from '../send';
import { listHistory, type HistoryEntry } from '../services/history';
import { defaultBaseUrl, normalizeBaseUrl } from '../services/baseUrl';
import {
  STORAGE,
  readStorage,
  resolveBootState,
  resolveInitialProfile,
  writeStorage,
  type ApiKeyMap,
} from '../services/settings';
import { newDraftId, type DraftConfig, type DraftTab } from './drafts';
import { createRequestForm } from './requestForm';
import { createProbes } from './probes';

export type AppState = ReturnType<typeof createAppState>;

/** Config tabs under the URL bar (the Postman Params/Auth/Headers/Body slot). */
export type ConfigTabId = 'client' | 'headers' | 'system';

/** What the message box starts with, and what a brand-new draft tab carries. */
const STARTER_MESSAGE = 'Say hello in one short sentence.';

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
  const [userMessage, setUserMessage] = createSignal(STARTER_MESSAGE);
  // Open draft tabs, in creation order. There's always at least one on boot;
  // after that the strip is whatever the user has opened and not closed.
  const firstDraftId = newDraftId();
  const [drafts, setDrafts] = createSignal<DraftTab[]>([
    { id: firstDraftId, message: STARTER_MESSAGE },
  ]);
  const [activeDraftId, setActiveDraftId] = createSignal(firstDraftId);
  const [configTab, setConfigTab] = createSignal<ConfigTabId>('client');
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

  // One normalisation for the whole app: the SDK snippet, the health probe and
  // the request itself all read from here, so the code Wingman shows you is the
  // code that would reproduce the call it just made.
  const normalized = createMemo(() => normalizeBaseUrl(baseUrl(), format().path));

  const { healthStatus, modelList } = createProbes({
    baseUrl,
    apiKey,
    format,
    provider,
    normalized,
  });

  const params = () => ({
    baseUrl: normalized().base,
    apiKey: apiKey(),
    model: model(),
    systemPrompt: systemPrompts()[profile().id] ?? '',
    userMessage: userMessage(),
  });

  const requestUrl = () => normalized().requestUrl;

  const form = createRequestForm({ formatId, format, profile, lang, params });

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

  /**
   * Draft tabs as the strip should render them. The open draft's text lives in
   * `userMessage` while its tab has focus and only lands back on the record
   * when the tab is parked, so overlay the live value — otherwise the tab you
   * are typing into is the one tab whose label never changes.
   */
  const draftTabs = createMemo<DraftTab[]>(() => {
    if (activeHistoryId() !== null) return drafts();
    const id = activeDraftId();
    const message = userMessage();
    return drafts().map((d) => (d.id === id ? { ...d, message } : d));
  });

  /** Snapshot the request setup so a draft tab can carry it while it's inactive. */
  const captureDraftConfig = (): DraftConfig => ({
    providerId: providerId(),
    baseUrl: baseUrl(),
    model: model(),
    formatId: formatId(),
    profileId: profileId(),
    stream: stream(),
    lang: lang(),
  });

  /** Put a draft's parked setup back into the form when its tab is reopened. */
  const applyDraftConfig = (config: DraftConfig) => {
    setFormatId(config.formatId);
    writeStorage(STORAGE.format, config.formatId);
    setProfileId(config.profileId);
    writeStorage(STORAGE.profile, config.profileId);
    setProviderId(config.providerId);
    writeStorage(STORAGE.provider, config.providerId);
    persistAndSetBase(config.baseUrl);
    persistAndSetModel(config.model);
    persistAndSetStream(config.stream);
    setLang(config.lang);
  };

  return {
    // per-client snippet + header overrides
    ...form,
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
    drafts,
    setDrafts,
    draftTabs,
    activeDraftId,
    setActiveDraftId,
    configTab,
    setConfigTab,
    modelList,
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
    // actions
    setProfileSafely,
    setFormatSafely,
    persistAndSetBase,
    persistAndSetKey,
    persistAndSetModel,
    persistAndSetStream,
    selectProvider,
    handleBaseUrlInput,
    updateSystemPrompt,
    captureDraftConfig,
    applyDraftConfig,
  };
}
