// Network + history actions, split from appState so each module stays small.
// Everything here reads/writes through the AppState created in appState.ts.
import { PROFILE_BY_ID, type ProfileLang } from '../profiles';
import { FORMATS, FORMAT_BY_ID, DEFAULT_FORMAT_ID, type ApiFormatId } from '../formats';
import { sendRequest, sendRequestStreaming, type SendResult } from '../send';
import {
  appendHistory,
  clearHistory,
  deleteHistory,
  listHistory,
  type HistoryEntry,
} from '../services/history';
import { normalizeBaseUrl } from '../services/baseUrl';
import { runUserCode } from '../runners';
import { buildMarkdownReport } from '../services/gist';
import {
  STORAGE,
  entriesFromRecord,
  providerForBaseUrl,
  recordFromEntries,
  writeStorage,
} from '../services/settings';
import type { AppState } from './appState';

export type AppActions = ReturnType<typeof createAppActions>;

export function createAppActions(s: AppState) {
  const errorResult = (message: string, statusText = 'Code error'): SendResult => ({
    url: s.requestUrl(),
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
    s.setResult(null);
    s.setStreamingText('');
    s.setActiveHistoryId(null);
    s.setSaveStatus('idle');
    s.setLoading(true);
    s.setHasSent(true);
    s.setSentMessage(s.userMessage());

    const fmt = s.format();
    let next: SendResult;
    let sentHeaders: Record<string, string>;

    // Stop before `fetch` does. An unusable base URL used to surface either a
    // raw "Failed to parse URL" TypeError or — worse, for a schemeless value —
    // a request resolved against Wingman's own origin, quietly shipping the
    // user's API key somewhere they never pointed at.
    if (!s.normalized().valid) {
      s.setResult(errorResult(s.normalized().problem ?? 'Invalid base URL.', 'Invalid base URL'));
      s.setLoading(false);
      return;
    }

    if (s.willRunCode()) {
      // The user edited the SDK preview, and the profile/lang combination can
      // execute it in-browser. Run the code through the stub SDK; whatever
      // fetch the code triggers becomes the SendResult.
      try {
        const out = await runUserCode({
          profileId: s.profile().id,
          code: s.sdkCode(),
          baseUrl: s.normalized().base,
          apiKey: s.apiKey(),
        });
        next = out.result;
      } catch (err) {
        next = errorResult(err instanceof Error ? err.message : String(err));
      }
      sentHeaders = next.requestHeaders;
    } else {
      sentHeaders = recordFromEntries(s.headerEntries());
      const p = s.params();
      const body = {
        ...fmt.buildBody(p, { stream: s.stream() }),
        ...(s.profile().bodyExtras?.(p) ?? {}),
      };
      const url = s.requestUrl();
      const input = { url, apiKey: s.apiKey(), auth: fmt.auth, headers: sentHeaders, body };
      next = s.stream()
        ? await sendRequestStreaming(input, {
            createParser: fmt.createStreamParser,
            onDelta: (t) => s.setStreamingText((prev) => prev + t),
          })
        : await sendRequest(input);
    }

    s.setResult(next);
    s.setLoading(false);
    // The draft's text has shipped — the next fresh draft starts clean.
    s.setDraftMessage('');

    const stored = appendHistory({
      profileId: s.profile().id,
      profileLabel: s.profile().label,
      formatId: fmt.id,
      formatLabel: fmt.label,
      streamed: next.isStream ?? false,
      url: next.url,
      baseUrl: s.baseUrl(),
      model: s.model(),
      systemPrompt: s.systemPrompts()[s.profile().id] ?? '',
      userMessage: s.userMessage(),
      lang: s.lang(),
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
    s.setHistory(listHistory());
    s.setActiveHistoryId(stored.id);
  };

  const restoreFromHistory = (entry: HistoryEntry) => {
    // Leaving the draft tab: park whatever was being typed so coming back to
    // "Untitled" restores it instead of losing it to the history entry's text.
    if (s.activeHistoryId() === null) s.setDraftMessage(s.userMessage());
    const restoredFormatId: ApiFormatId =
      entry.formatId && FORMAT_BY_ID[entry.formatId]
        ? (entry.formatId as ApiFormatId)
        : DEFAULT_FORMAT_ID;
    s.setFormatId(restoredFormatId);
    writeStorage(STORAGE.format, restoredFormatId);
    s.setProfileId(entry.profileId);
    writeStorage(STORAGE.profile, entry.profileId);
    s.persistAndSetBase(entry.baseUrl);
    const restoredProvider = providerForBaseUrl(entry.baseUrl);
    s.setProviderId(restoredProvider);
    writeStorage(STORAGE.provider, restoredProvider);
    s.persistAndSetModel(entry.model);
    if (entry.streamed !== undefined) s.persistAndSetStream(entry.streamed);
    s.setSystemPrompts({ ...s.systemPrompts(), [entry.profileId]: entry.systemPrompt });
    s.setUserMessage(entry.userMessage);
    s.setSentMessage(entry.userMessage);
    s.setHasSent(true);
    s.setStreamingText('');
    const next = PROFILE_BY_ID[entry.profileId];
    if (next) {
      const restoredLang = (
        next.langs.includes(entry.lang as ProfileLang) ? entry.lang : next.defaultLang
      ) as ProfileLang;
      s.setLang(restoredLang);
      s.setHeaderOverrides({
        ...s.headerOverrides(),
        [`${restoredFormatId}:${entry.profileId}:${restoredLang}`]: entriesFromRecord(
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

  // Switch to the (always-present) "Untitled" draft tab, restoring whatever
  // unsent text it holds.
  const selectDraft = () => {
    s.setResult(null);
    s.setStreamingText('');
    s.setActiveHistoryId(null);
    s.setHasSent(false);
    s.setSentMessage('');
    s.setSaveStatus('idle');
    s.setUserMessage(s.draftMessage());
    focusComposer();
  };

  // The + button / ⌘⇧O: a genuinely fresh draft.
  const handleNewRequest = () => {
    s.setDraftMessage('');
    selectDraft();
  };

  const handleDelete = (id: string) => {
    const wasActive = s.activeHistoryId() === id;
    deleteHistory(id);
    s.setHistory(listHistory());
    // Closing the tab you're looking at falls back to the draft — leaving the
    // dead request's response on screen with no tab would be confusing.
    if (wasActive) selectDraft();
  };

  const handleClear = () => {
    if (s.history().length === 0) return;
    if (!confirm(`Delete all ${s.history().length} history entries?`)) return;
    clearHistory();
    s.setHistory([]);
    selectDraft();
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
    focusComposer,
    handleSaveToGist,
  };
}
