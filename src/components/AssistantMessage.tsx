import { createSignal, For, Show, type Component } from 'solid-js';
import type { SendResult } from '../send';
import type { ApiFormat } from '../formats';
import CodeView from './CodeView.jsx';

interface Props {
  result: SendResult | null;
  loading: boolean;
  format: ApiFormat;
  /** Live assistant text accumulating during a streamed request. */
  streamingText: string;
}

type Tab = 'output' | 'response-body' | 'response-headers' | 'request-body' | 'request-headers';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'output', label: 'Output' },
  { id: 'response-body', label: 'Response body' },
  { id: 'response-headers', label: 'Response headers' },
  { id: 'request-body', label: 'Request body' },
  { id: 'request-headers', label: 'Request headers' },
];

function formatHeaders(headers: Record<string, string>): string {
  const entries = Object.entries(headers);
  if (entries.length === 0) return '(none)';
  return entries.map(([k, v]) => `${k}: ${v}`).join('\n');
}

function prettyBody(body: string, json: unknown | null): string {
  if (json !== null) return JSON.stringify(json, null, 2);
  return body || '(empty body)';
}

const StatusPill: Component<{ status: number; ok: boolean; statusText: string }> = (props) => {
  const tone = () => {
    if (props.status === 0) return 'error';
    if (props.ok) return 'ok';
    if (props.status >= 500) return 'error';
    return 'warn';
  };
  const label = () => {
    if (props.status === 0) return 'Network error';
    return `${props.status} ${props.statusText}`.trim();
  };
  return (
    <span class="status-pill" classList={{ [`status-pill--${tone()}`]: true }}>
      <span class="status-pill__dot" />
      {label()}
    </span>
  );
};

const ClockIcon: Component = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const TokenIcon: Component = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const AssistantMessage: Component<Props> = (props) => {
  const [tab, setTab] = createSignal<Tab>('output');

  // Prefer the parsed/assembled response text; fall back to streamed text.
  const assistantText = () => {
    const r = props.result;
    if (!r) return null;
    return props.format.extractText(r.responseJson) ?? r.streamedText ?? null;
  };
  const usage = () => (props.result ? props.format.extractUsage(props.result.responseJson) : null);
  const model = () => (props.result ? props.format.extractModel(props.result.responseJson) : null);

  return (
    <div class="assistant-msg">
      <Show when={props.loading}>
        <Show
          when={props.streamingText}
          fallback={
            <div class="assistant-msg__loading">
              <span class="spinner" />
              <span>Thinking…</span>
            </div>
          }
        >
          <div class="assistant-msg__text assistant-msg__text--streaming">
            {props.streamingText}
            <span class="assistant-msg__cursor" aria-hidden="true" />
          </div>
        </Show>
      </Show>

      <Show when={!props.loading && props.result} keyed>
        {(r) => (
          <>
            <div class="assistant-msg__head">
              <StatusPill status={r.status} ok={r.ok} statusText={r.statusText} />
              <span class="metric-chip" title="Round-trip latency">
                <ClockIcon />
                {r.durationMs.toFixed(0)} ms
              </span>
              <Show when={r.ttftMs !== undefined}>
                <span class="metric-chip" title="Time to first token">
                  <ClockIcon />
                  {r.ttftMs!.toFixed(0)} ms TTFT
                </span>
              </Show>
              <Show when={usage()?.total}>
                {(total) => (
                  <span class="metric-chip" title="Total tokens">
                    <TokenIcon />
                    {total()} tok
                    <Show when={usage()?.in !== undefined && usage()?.out !== undefined}>
                      <span class="metric-chip__aside">
                        ({usage()!.in} in / {usage()!.out} out)
                      </span>
                    </Show>
                  </span>
                )}
              </Show>
              <Show when={model()}>
                {(m) => (
                  <span class="model-chip" title="Model returned">
                    {m()}
                  </span>
                )}
              </Show>
            </div>

            <Show when={r.error}>
              <div class="assistant-msg__error">{r.error}</div>
            </Show>

            <div class="tab-strip" role="tablist" aria-label="Response panes">
              <For each={TABS}>
                {(t) => (
                  <button
                    type="button"
                    class="tab-strip__btn"
                    classList={{ 'tab-strip__btn--active': tab() === t.id }}
                    onClick={() => setTab(t.id)}
                    role="tab"
                    aria-selected={tab() === t.id}
                  >
                    {t.label}
                  </button>
                )}
              </For>
            </div>

            <div class="assistant-msg__pane" role="tabpanel">
              <Show when={tab() === 'output'}>
                <Show
                  when={assistantText()}
                  fallback={
                    <div class="assistant-msg__placeholder">
                      No assistant message in this response. Check the response body tab for the raw
                      payload.
                    </div>
                  }
                >
                  {(text) => <div class="assistant-msg__text">{text()}</div>}
                </Show>
              </Show>
              <Show when={tab() === 'response-body'}>
                <Show
                  when={r.isStream}
                  fallback={
                    <CodeView code={prettyBody(r.responseBody, r.responseJson)} language="json" />
                  }
                >
                  <CodeView code={r.responseBody || '(empty stream)'} language="text" />
                </Show>
              </Show>
              <Show when={tab() === 'response-headers'}>
                <CodeView code={formatHeaders(r.responseHeaders)} language="http" />
              </Show>
              <Show when={tab() === 'request-body'}>
                <CodeView code={r.requestBody} language="json" />
              </Show>
              <Show when={tab() === 'request-headers'}>
                <CodeView code={formatHeaders(r.requestHeaders)} language="http" />
              </Show>
            </div>
          </>
        )}
      </Show>
    </div>
  );
};

export default AssistantMessage;
