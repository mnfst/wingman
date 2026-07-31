// Tab, history and sharing actions. Sending lives in sendAction.ts; everything
// here reads and writes through the AppState created in appState.ts.
import { PROFILE_BY_ID, resolveProfileId, type ProfileLang } from '../profiles';
import { FORMATS, FORMAT_BY_ID, DEFAULT_FORMAT_ID, type ApiFormatId } from '../formats';
import { clearHistory, deleteHistory, listHistory, type HistoryEntry } from '../services/history';
import { normalizeBaseUrl } from '../services/baseUrl';
import { buildMarkdownReport } from '../services/gist';
import { STORAGE, entriesFromRecord, providerForBaseUrl, writeStorage } from '../services/settings';
import { newDraftId, tabAfterClosing, type TabRef } from './drafts';
import { createSendAction } from './sendAction';
import type { AppState } from './appState';

export type AppActions = ReturnType<typeof createAppActions>;

export function createAppActions(s: AppState) {
  // The tab strip, left to right: history entries oldest-first, then drafts.
  // Closing a tab needs this order to pick the neighbour to fall back to.
  const tabOrder = (): TabRef[] => [
    ...[...s.history()].reverse().map((e): TabRef => ({ kind: 'history', id: e.id })),
    ...s.drafts().map((d): TabRef => ({ kind: 'draft', id: d.id })),
  ];

  /** Clear the response pane. Every tab switch starts from a blank slate. */
  const clearResponse = () => {
    s.setResult(null);
    s.setStreamingText('');
    s.setSaveStatus('idle');
  };

  const handleSend = createSendAction(s, clearResponse);

  // Park the open draft's message and setup before its tab loses focus, so
  // coming back to it restores what was being typed instead of whatever the
  // tab you visited in between left in the form.
  const parkActiveDraft = () => {
    if (s.activeHistoryId() !== null) return;
    const id = s.activeDraftId();
    const message = s.userMessage();
    const config = s.captureDraftConfig();
    s.setDrafts(s.drafts().map((d) => (d.id === id ? { ...d, message, config } : d)));
  };

  const restoreFromHistory = (entry: HistoryEntry) => {
    parkActiveDraft();
    const restoredProfileId = resolveProfileId(entry.profileId);
    const restoredFormatId: ApiFormatId =
      entry.formatId && FORMAT_BY_ID[entry.formatId]
        ? (entry.formatId as ApiFormatId)
        : DEFAULT_FORMAT_ID;
    s.setFormatId(restoredFormatId);
    writeStorage(STORAGE.format, restoredFormatId);
    s.setProfileId(restoredProfileId);
    writeStorage(STORAGE.profile, restoredProfileId);
    s.persistAndSetBase(entry.baseUrl);
    const restoredProvider = providerForBaseUrl(entry.baseUrl);
    s.setProviderId(restoredProvider);
    writeStorage(STORAGE.provider, restoredProvider);
    s.persistAndSetModel(entry.model);
    if (entry.streamed !== undefined) s.persistAndSetStream(entry.streamed);
    s.setSystemPrompts({ ...s.systemPrompts(), [restoredProfileId]: entry.systemPrompt });
    s.setUserMessage(entry.userMessage);
    s.setSentMessage(entry.userMessage);
    s.setHasSent(true);
    s.setStreamingText('');
    s.setSaveStatus('idle');
    const next = PROFILE_BY_ID[restoredProfileId];
    if (next) {
      const restoredLang = (
        next.langs.includes(entry.lang as ProfileLang) ? entry.lang : next.defaultLang
      ) as ProfileLang;
      s.setLang(restoredLang);
      s.setHeaderOverrides({
        ...s.headerOverrides(),
        [`${restoredFormatId}:${restoredProfileId}:${restoredLang}`]: entriesFromRecord(
          entry.headers,
        ),
      });
    }
    s.setActiveHistoryId(entry.id);
    const fmt = FORMAT_BY_ID[restoredFormatId] ?? FORMATS[0]!;
    s.setResult({
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

  const focusComposer = () => {
    document.querySelector<HTMLTextAreaElement>('.chatbox__textarea')?.focus();
  };

  /** Open a draft tab, restoring the message and setup it was left with. */
  const selectDraft = (id: string) => {
    const draft = s.drafts().find((d) => d.id === id);
    if (!draft) return;
    parkActiveDraft();
    clearResponse();
    s.setActiveHistoryId(null);
    s.setActiveDraftId(id);
    s.setHasSent(false);
    s.setSentMessage('');
    if (draft.config) s.applyDraftConfig(draft.config);
    s.setUserMessage(draft.message);
    focusComposer();
  };

  /**
   * The + button / ⌘⇧O. A new tab inherits the setup you're looking at (the
   * common case is firing a second request at the same endpoint) and starts
   * with an empty message.
   */
  const handleNewRequest = () => {
    const draft = { id: newDraftId(), message: '', config: s.captureDraftConfig() };
    s.setDrafts([...s.drafts(), draft]);
    selectDraft(draft.id);
  };

  /**
   * Activate whatever tab should take over after the active one is closed.
   * `closed` is the tab that just went away, located in the pre-close order.
   */
  const selectAfterClosing = (before: TabRef[], closed: TabRef) => {
    const index = before.findIndex((t) => t.kind === closed.kind && t.id === closed.id);
    const next = index < 0 ? undefined : tabAfterClosing(before, index);
    if (next?.kind === 'draft' && s.drafts().some((d) => d.id === next.id)) {
      selectDraft(next.id);
      return;
    }
    const entry = next?.kind === 'history' ? s.history().find((e) => e.id === next.id) : undefined;
    if (entry) {
      restoreFromHistory(entry);
      return;
    }
    // Nothing left to fall back to, so open an empty tab rather than show a
    // dead response with no tab selected.
    handleNewRequest();
  };

  const closeDraft = (id: string) => {
    const before = tabOrder();
    const wasActive = s.activeHistoryId() === null && s.activeDraftId() === id;
    s.setDrafts(s.drafts().filter((d) => d.id !== id));
    if (wasActive) selectAfterClosing(before, { kind: 'draft', id });
  };

  const handleDelete = (id: string) => {
    const before = tabOrder();
    const wasActive = s.activeHistoryId() === id;
    deleteHistory(id);
    s.setHistory(listHistory());
    if (wasActive) selectAfterClosing(before, { kind: 'history', id });
  };

  const handleClear = () => {
    if (s.history().length === 0) return;
    if (!confirm(`Delete all ${s.history().length} history entries?`)) return;
    const wasOnHistory = s.activeHistoryId() !== null;
    clearHistory();
    s.setHistory([]);
    if (wasOnHistory) {
      const draft = s.drafts()[0];
      if (draft) selectDraft(draft.id);
      else handleNewRequest();
    }
  };

  const handleSaveToGist = () => {
    const r = s.result();
    if (!r) return;
    const markdown = buildMarkdownReport(
      {
        profileLabel: s.profile().label,
        profileCategory: s.profile().category,
        formatLabel: s.format().label,
        streamed: r.isStream ?? false,
        systemPrompt: s.systemPrompts()[s.profile().id] ?? '',
        userMessage: s.sentMessage() || s.userMessage(),
        baseUrl: s.baseUrl(),
        model: s.model(),
        apiKey: s.apiKey(),
      },
      r,
      s.format(),
    );
    s.setGistMarkdown(markdown);
    s.setGistModalOpen(true);
    s.setSaveStatus('saved');
    setTimeout(() => s.setSaveStatus('idle'), 2500);
  };

  return {
    handleSend,
    restoreFromHistory,
    handleDelete,
    handleClear,
    handleNewRequest,
    selectDraft,
    closeDraft,
    focusComposer,
    handleSaveToGist,
  };
}
