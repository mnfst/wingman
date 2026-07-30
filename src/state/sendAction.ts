// Sending a request and recording what came back. Split out of appActions so
// that file stays about tabs and history.
import { sendRequest, sendRequestStreaming, type SendResult } from '../send';
import { appendHistory, listHistory } from '../services/history';
import { runUserCode } from '../runners';
import { recordFromEntries } from '../services/settings';
import type { AppState } from './appState';

export function createSendAction(s: AppState, clearResponse: () => void) {
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

  return async function handleSend() {
    // A draft that ships is spent: the request it described now exists as a
    // history tab, so the draft tab is consumed rather than left behind empty.
    const sentFromDraft = s.activeHistoryId() === null ? s.activeDraftId() : null;
    clearResponse();
    s.setLoading(true);
    s.setHasSent(true);
    s.setSentMessage(s.userMessage());

    const fmt = s.format();
    let next: SendResult;
    let sentHeaders: Record<string, string>;

    // Stop before `fetch` does. An unusable base URL used to surface either a
    // raw "Failed to parse URL" TypeError or, worse, for a schemeless value, a
    // request resolved against Wingman's own origin — quietly shipping the
    // user's API key somewhere they never pointed at.
    if (!s.normalized().valid) {
      s.setResult(errorResult(s.normalized().problem ?? 'Invalid base URL.', 'Invalid base URL'));
      s.setLoading(false);
      return;
    }

    if (s.willRunCode()) {
      // The user edited the snippet, and this client/language pair can execute
      // it in-browser. Run it through the stub SDK; whatever fetch the code
      // triggers becomes the SendResult.
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
    if (sentFromDraft) s.setDrafts(s.drafts().filter((d) => d.id !== sentFromDraft));
    s.setActiveHistoryId(stored.id);
  };
}
