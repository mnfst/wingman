import { For, Show, type Component } from 'solid-js';
import HeaderEditor, { type HeaderEntry } from './HeaderEditor.jsx';
import CodeView from './CodeView.jsx';
import ClientSelect from './ClientSelect.jsx';
import type { Profile, ProfileLang } from '../profiles';
import type { ConfigTabId } from '../state/appState';

interface Props {
  tab: ConfigTabId;
  onTabChange: (tab: ConfigTabId) => void;
  profiles: readonly Profile[];
  activeProfileId: string;
  onSelectProfile: (id: string) => void;
  headers: HeaderEntry[];
  onHeadersChange: (entries: HeaderEntry[]) => void;
  onResetHeaders: () => void;
  blockedHeaders: string[];
  /** True when the profile's fingerprint headers are part of the simulation. */
  headersLocked: boolean;
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  sdkCode: string;
  sdkLang: ProfileLang;
  sdkLangOptions: readonly ProfileLang[];
  onSdkLangChange: (lang: ProfileLang) => void;
  onSdkCodeChange: (code: string) => void;
  sdkCodeIsEdited: boolean;
  onResetSdkCode: () => void;
  sdkExecutable: boolean;
  stream: boolean;
  onStreamChange: (value: boolean) => void;
}

const TABS: ReadonlyArray<{ id: ConfigTabId; label: string }> = [
  { id: 'client', label: 'Client' },
  { id: 'headers', label: 'Headers' },
  { id: 'system', label: 'System Prompt' },
  { id: 'code', label: 'Code' },
];

/**
 * The left pane, Bruno-style: one facet of the request per tab — which client
 * fingerprint to impersonate, the headers, the harness system prompt, and the
 * SDK snippet. Auth lives up in the URL bar next to the address it belongs to.
 */
const ConfigTabs: Component<Props> = (props) => {
  const headersCount = () => props.headers.filter((h) => h.key.trim()).length;
  const sysLen = () => props.systemPrompt.trim().length;
  const activeProfile = () =>
    props.profiles.find((p) => p.id === props.activeProfileId) ?? props.profiles[0]!;

  // Tablist keyboard contract: left/right arrows move and activate.
  const onStripKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const idx = TABS.findIndex((t) => t.id === props.tab);
    const step = e.key === 'ArrowRight' ? 1 : TABS.length - 1;
    const next = TABS[(idx + step) % TABS.length]!;
    props.onTabChange(next.id);
    document.getElementById(`config-tab-${next.id}`)?.focus();
  };

  return (
    <section class="config">
      <div class="config__strip">
        <div
          class="config__tablist"
          role="tablist"
          aria-label="Request configuration"
          onKeyDown={onStripKeyDown}
        >
          <For each={TABS}>
            {(t) => (
              <button
                type="button"
                id={`config-tab-${t.id}`}
                class="config__tab"
                classList={{ 'config__tab--active': props.tab === t.id }}
                role="tab"
                aria-selected={props.tab === t.id}
                aria-controls="config-panel"
                tabIndex={props.tab === t.id ? 0 : -1}
                onClick={() => props.onTabChange(t.id)}
              >
                {t.label}
                <Show when={t.id === 'headers' && headersCount() > 0}>
                  <span class="config__tab-count">({headersCount()})</span>
                </Show>
                <Show when={t.id === 'headers' && props.blockedHeaders.length > 0}>
                  <span
                    class="config__tab-warn"
                    title={`${props.blockedHeaders.length} header(s) will be dropped by the browser`}
                  >
                    !
                  </span>
                </Show>
                <Show when={t.id === 'system' && sysLen() > 0}>
                  <span class="config__tab-count">({sysLen().toLocaleString()})</span>
                </Show>
                <Show when={t.id === 'code' && props.sdkCodeIsEdited}>
                  <span class="config__tab-edited" title="Code edited — Send runs the snippet" />
                </Show>
              </button>
            )}
          </For>
        </div>
        <label class="config__stream" title="Streamed responses render token by token (SSE)">
          <span>Stream</span>
          <button
            type="button"
            class="switch"
            classList={{ 'switch--on': props.stream }}
            role="switch"
            aria-checked={props.stream}
            aria-label="Stream responses"
            onClick={() => props.onStreamChange(!props.stream)}
          >
            <span class="switch__thumb" />
          </button>
        </label>
      </div>

      <div
        class="config__panel"
        role="tabpanel"
        id="config-panel"
        aria-labelledby={`config-tab-${props.tab}`}
      >
        <Show when={props.tab === 'client'}>
          <div class="config__panel-head">
            <span class="config__label">Impersonate</span>
          </div>
          <ClientSelect
            profiles={props.profiles}
            activeId={props.activeProfileId}
            onSelect={props.onSelectProfile}
          />
          <p class="config__note config__note--client">{activeProfile().blurb}</p>
          <Show when={activeProfile().headersLocked}>
            <p class="config__note config__note--dim">
              Sends the real client's fingerprint headers and system prompt, so the gateway
              classifies this exactly like the genuine tool.
            </p>
          </Show>
        </Show>

        <Show when={props.tab === 'headers'}>
          <Show
            when={!props.headersLocked}
            fallback={
              <div class="headers-locked">
                <p class="config__note">
                  These fingerprint headers are part of the simulation — this is exactly what the
                  real client sends. Pick <strong>cURL</strong> or <strong>Raw</strong> in the
                  Client tab to hand-craft headers.
                </p>
                <dl class="headers-locked__list">
                  <For each={props.headers.filter((h) => h.key.trim())}>
                    {(h) => (
                      <div class="headers-locked__row">
                        <dt>{h.key}</dt>
                        <dd>{h.value}</dd>
                      </div>
                    )}
                  </For>
                </dl>
              </div>
            }
          >
            <div class="config__panel-head">
              <span class="config__label">Request headers</span>
              <button type="button" class="config__link" onClick={props.onResetHeaders}>
                Reset to client defaults
              </button>
            </div>
            <HeaderEditor
              entries={props.headers}
              onChange={props.onHeadersChange}
              blocked={props.blockedHeaders}
            />
          </Show>
        </Show>

        <Show when={props.tab === 'system'}>
          <textarea
            class="config__system"
            rows={10}
            value={props.systemPrompt}
            onInput={(e) => props.onSystemPromptChange(e.currentTarget.value)}
            placeholder="System prompt — sent as the first message in the conversation."
            aria-label="System prompt"
          />
        </Show>

        <Show when={props.tab === 'code'}>
          <div class="config__panel-head">
            <span class="config__label">
              SDK code
              <Show
                when={props.sdkExecutable}
                fallback={
                  <span
                    class="config__badge"
                    title="Browsers can't execute this in-process — copy the code and run locally."
                  >
                    preview only
                  </span>
                }
              >
                <span class="config__badge config__badge--ok">runnable</span>
              </Show>
              <Show when={props.sdkCodeIsEdited}>
                <span class="config__badge config__badge--accent">edited</span>
              </Show>
            </span>
            <div class="config__panel-actions">
              <Show when={props.sdkLangOptions.length > 1}>
                <div class="lang-toggle" role="tablist" aria-label="Code language">
                  <For each={props.sdkLangOptions}>
                    {(l) => (
                      <button
                        type="button"
                        class="lang-toggle__btn"
                        classList={{ 'lang-toggle__btn--active': props.sdkLang === l }}
                        onClick={() => props.onSdkLangChange(l)}
                        role="tab"
                        aria-selected={props.sdkLang === l}
                      >
                        {l}
                      </button>
                    )}
                  </For>
                </div>
              </Show>
              <Show when={props.sdkCodeIsEdited}>
                <button type="button" class="config__link" onClick={props.onResetSdkCode}>
                  Reset
                </button>
              </Show>
            </div>
          </div>
          <p class="config__note">
            <Show
              when={props.sdkExecutable}
              fallback={<>Mirrors the request above. Copy and run it locally to verify.</>}
            >
              {props.sdkCodeIsEdited
                ? 'Code edited — Send executes this snippet via stubbed SDK.'
                : 'In sync with the request. Edit to override; Send will then run the snippet directly.'}
            </Show>
          </p>
          <CodeView
            code={props.sdkCode}
            language={props.sdkLang}
            editable
            onChange={props.onSdkCodeChange}
            rows={Math.min(16, Math.max(6, props.sdkCode.split('\n').length + 1))}
          />
        </Show>
      </div>
    </section>
  );
};

export default ConfigTabs;
