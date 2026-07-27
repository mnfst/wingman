import { createEffect, createSignal, For, on, Show, type Component } from 'solid-js';
import HeaderEditor, { type HeaderEntry } from './HeaderEditor.jsx';
import CodeView from './CodeView.jsx';
import ProfileDropdown from './ProfileDropdown.jsx';
import FormatDropdown from './FormatDropdown.jsx';
import ProviderDropdown from './ProviderDropdown.jsx';
import type { Profile, ProfileLang } from '../profiles';
import type { ApiFormat } from '../formats';
import type { Provider } from '../providers';
import type { HealthStatus } from '../services/healthCheck';

interface Props {
  providers: readonly Provider[];
  activeProviderId: string;
  onSelectProvider: (id: string) => void;
  formats: readonly ApiFormat[];
  activeFormatId: string;
  onSelectFormat: (id: string) => void;
  profiles: readonly Profile[];
  activeProfileId: string;
  onSelectProfile: (id: string) => void;
  stream: boolean;
  onStreamChange: (value: boolean) => void;
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  showSystemPrompt: boolean;
  userMessage: string;
  onUserMessageChange: (value: string) => void;
  headers: HeaderEntry[];
  onHeadersChange: (entries: HeaderEntry[]) => void;
  onResetHeaders: () => void;
  blockedHeaders: string[];
  baseUrl: string;
  /** Where a send actually POSTs, after normalising the base URL. */
  requestUrl: string;
  /** What normalising changed (a stripped `/v1`, an added scheme), if anything. */
  baseUrlNote?: string;
  /** Why the typed base URL is unusable, if it is. */
  baseUrlProblem?: string;
  apiKey: string;
  model: string;
  baseUrlPlaceholder: string;
  apiKeyPlaceholder: string;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onModelChange: (value: string) => void;
  loading: boolean;
  onSend: () => void;
  sdkCode: string;
  sdkLang: ProfileLang;
  sdkLangOptions: readonly ProfileLang[];
  onSdkLangChange: (lang: ProfileLang) => void;
  onSdkCodeChange: (code: string) => void;
  sdkCodeIsEdited: boolean;
  onResetSdkCode: () => void;
  /** True when this profile/lang can run the typed code via stubs. */
  sdkExecutable: boolean;
  /** Hidden when true — the profile fingerprints are part of the simulation. */
  headersLocked: boolean;
  /**
   * True when on Send the user's edited code will run via the stubbed SDK
   * instead of the structured form. Drives the Send button label.
   */
  willRunCode: boolean;
  /**
   * Whether to show the "Save to Gist" button — true when there's a result
   * (success or failure) to capture.
   */
  canSave: boolean;
  onSaveToGist: () => void | Promise<void>;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  healthStatus: HealthStatus;
}

const SendIcon: Component = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);

const GistIcon: Component = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

const CheckIcon: Component = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const EyeIcon: Component = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon: Component = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
    <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
    <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
    <path d="m2 2 20 20" />
  </svg>
);

const HealthBadge: Component<{ status: HealthStatus }> = (p) => {
  const status = () => p.status;
  const isError = () =>
    status().kind === 'failed' ||
    status().kind === 'invalid' ||
    status().kind === 'not-a-gateway' ||
    status().kind === 'http-error';
  return (
    <Show when={status().kind !== 'idle'}>
      <span
        class="health-badge"
        classList={{
          'health-badge--ok': status().kind === 'ok',
          'health-badge--warn': status().kind === 'checking',
          'health-badge--err': isError(),
        }}
        title={healthTitle(status())}
      >
        {healthLabel(status())}
      </span>
    </Show>
  );
};

function healthLabel(s: HealthStatus): string {
  switch (s.kind) {
    case 'ok':
      return `reachable · ${s.latencyMs}ms`;
    case 'checking':
      return 'checking…';
    case 'invalid':
      return 'invalid URL';
    case 'failed':
      return s.label;
    case 'not-a-gateway':
      return 'not a gateway';
    case 'http-error':
      return `HTTP ${s.status}`;
    default:
      return '';
  }
}

// The badge only ever proves the health endpoint answered — it says nothing
// about the endpoint a send targets. Naming the probed URL keeps a green badge
// from being read as "your request will work".
function healthTitle(s: HealthStatus): string {
  switch (s.kind) {
    case 'ok':
      return `Health check succeeded — probed ${s.probedUrl}`;
    case 'checking':
      return 'Checking the gateway health endpoint…';
    case 'invalid':
      return s.message;
    case 'failed':
      return s.message;
    case 'not-a-gateway':
      return s.message;
    case 'http-error':
      return `${s.probedUrl} returned ${s.status} ${s.statusText}`;
    default:
      return '';
  }
}

const Composer: Component<Props> = (props) => {
  const [apiKeyRevealed, setApiKeyRevealed] = createSignal(false);
  const [systemOpen, setSystemOpen] = createSignal(false);
  const [headersOpen, setHeadersOpen] = createSignal(false);
  // Connection (Base URL / Model / API key) opens by default — first-run
  // contributors should immediately see where to point Wingman and where to
  // paste their key.
  const [connOpen, setConnOpen] = createSignal(true);
  const [sdkOpen, setSdkOpen] = createSignal(false);

  // The key field holds a different secret per provider, so leaving it revealed
  // across a switch would show the next provider's key unasked. Re-mask it.
  createEffect(
    on(
      () => props.activeProviderId,
      () => setApiKeyRevealed(false),
      { defer: true },
    ),
  );

  const headersCount = () => props.headers.filter((h) => h.key.trim()).length;
  const sysLen = () => props.systemPrompt.trim().length;
  const blockedCount = () => props.blockedHeaders.length;
  const canSend = () => !props.loading && props.userMessage.trim().length > 0;

  const onSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    if (canSend()) props.onSend();
  };

  return (
    <form class="composer" onSubmit={onSubmit}>
      {/* Client + format pickers above the wrapper, read left→right: the
          request fingerprint (client) flows to the endpoint format. */}
      <div class="composer__profile-row">
        <ProfileDropdown
          profiles={props.profiles}
          activeId={props.activeProfileId}
          onSelect={props.onSelectProfile}
        />
        <span class="composer__profile-sep" aria-hidden="true">
          →
        </span>
        <FormatDropdown
          formats={props.formats}
          activeId={props.activeFormatId}
          onSelect={props.onSelectFormat}
        />
      </div>

      <div class="composer__wrap">
        {/* Expanded panels appear above the textarea */}
        <Show when={connOpen()}>
          <div class="composer__panel">
            <div class="composer-field composer__provider-field">
              <span>Provider preset</span>
              <ProviderDropdown
                providers={props.providers}
                activeId={props.activeProviderId}
                onSelect={props.onSelectProvider}
              />
            </div>
            <div class="composer__panel-grid">
              <label class="composer-field">
                <span class="composer-field__label-row">
                  Base URL
                  <HealthBadge status={props.healthStatus} />
                </span>
                <input
                  type="text"
                  value={props.baseUrl}
                  onInput={(e) => props.onBaseUrlChange(e.currentTarget.value)}
                  placeholder={props.baseUrlPlaceholder}
                  spellcheck={false}
                  autocomplete="off"
                />
                {/* The endpoint the base URL resolves to. Pasting a full
                    endpoint or a base ending in `/v1` is the single most
                    common way to get a 404 out of a healthy gateway, so show
                    the result before the user hits Send rather than after. */}
                <Show
                  when={!props.baseUrlProblem}
                  fallback={<span class="composer-field__hint composer-field__hint--err">{props.baseUrlProblem}</span>}
                >
                  <span class="composer-field__hint">
                    POST <code>{props.requestUrl}</code>
                    <Show when={props.baseUrlNote}>
                      {(note) => <em class="composer-field__hint-note">{note()}</em>}
                    </Show>
                  </span>
                </Show>
              </label>
              <label class="composer-field">
                <span>Model</span>
                <input
                  type="text"
                  value={props.model}
                  onInput={(e) => props.onModelChange(e.currentTarget.value)}
                  placeholder="auto"
                  spellcheck={false}
                  autocomplete="off"
                />
              </label>
              <label class="composer-field composer-field--key">
                <span class="composer-field__label-row">
                  API key
                  <Show
                    when={props.apiKey.trim().length > 0}
                    fallback={<span class="composer-field__status">empty</span>}
                  >
                    <span class="composer-field__status composer-field__status--set">✓ saved</span>
                  </Show>
                </span>
                <div
                  class="composer-field__input-wrap"
                  classList={{ 'composer-field__input-wrap--set': props.apiKey.trim().length > 0 }}
                >
                  <input
                    type={apiKeyRevealed() ? 'text' : 'password'}
                    value={props.apiKey}
                    onInput={(e) => props.onApiKeyChange(e.currentTarget.value)}
                    placeholder={props.apiKeyPlaceholder}
                    spellcheck={false}
                    autocomplete="off"
                  />
                  <Show when={props.apiKey.trim().length > 0}>
                    <button
                      type="button"
                      class="composer-field__action"
                      onClick={() => props.onApiKeyChange('')}
                      aria-label="Clear API key"
                      title="Clear stored API key"
                    >
                      Clear
                    </button>
                  </Show>
                  <button
                    type="button"
                    class="composer-field__toggle"
                    onClick={() => setApiKeyRevealed(!apiKeyRevealed())}
                    aria-label={apiKeyRevealed() ? 'Hide API key' : 'Show API key'}
                    title={apiKeyRevealed() ? 'Hide' : 'Show'}
                    disabled={props.apiKey.trim().length === 0}
                  >
                    <Show when={apiKeyRevealed()} fallback={<EyeIcon />}>
                      <EyeOffIcon />
                    </Show>
                  </button>
                </div>
              </label>
            </div>
            <p class="composer__panel-trust">
              Your API key never leaves the browser — Wingman is a static SPA with no backend.{' '}
              <a href="https://github.com/mnfst/wingman" target="_blank" rel="noopener noreferrer">
                View source
              </a>
              .
            </p>
          </div>
        </Show>

        <Show when={systemOpen()}>
          <div class="composer__panel">
            <textarea
              class="composer__system"
              rows={4}
              value={props.systemPrompt}
              onInput={(e) => props.onSystemPromptChange(e.currentTarget.value)}
              placeholder="System prompt — sent as the first message in the conversation."
            />
          </div>
        </Show>

        <Show when={headersOpen() && !props.headersLocked}>
          <div class="composer__panel">
            <div class="composer__panel-head">
              <span class="composer__panel-label">Request headers</span>
              <button type="button" class="composer__panel-link" onClick={props.onResetHeaders}>
                Reset to profile defaults
              </button>
            </div>
            <HeaderEditor
              entries={props.headers}
              onChange={props.onHeadersChange}
              blocked={props.blockedHeaders}
            />
          </div>
        </Show>

        <Show when={sdkOpen()}>
          <div class="composer__panel">
            <div class="composer__panel-head">
              <span class="composer__panel-label">
                SDK code
                <Show when={props.sdkExecutable}>
                  <span class="composer__panel-tag composer__panel-tag--ok">runnable</span>
                </Show>
                <Show when={!props.sdkExecutable}>
                  <span
                    class="composer__panel-tag"
                    title="Browsers can't execute Python in-process — copy the code and run locally."
                  >
                    preview only
                  </span>
                </Show>
                <Show when={props.sdkCodeIsEdited}>
                  <span class="composer__panel-tag composer__panel-tag--accent">edited</span>
                </Show>
              </span>
              <div class="composer__panel-head-actions">
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
                  <button type="button" class="composer__panel-link" onClick={props.onResetSdkCode}>
                    Reset
                  </button>
                </Show>
              </div>
            </div>
            <Show
              when={props.sdkExecutable}
              fallback={
                <p class="composer__panel-note">
                  Edit freely — this code mirrors the form above. Send still uses the form values
                  because{' '}
                  <Show when={props.sdkLang === 'python'} fallback={<span>this profile</span>}>
                    <span>Python</span>
                  </Show>{' '}
                  can't execute in-browser. Copy and run it locally to verify.
                </p>
              }
            >
              <p class="composer__panel-note">
                {props.sdkCodeIsEdited
                  ? 'Code edited — Send will execute this snippet via stubbed SDK.'
                  : 'In sync with form. Edit to override; Send will then run the snippet directly.'}
              </p>
            </Show>
            <CodeView
              code={props.sdkCode}
              language={props.sdkLang}
              editable
              onChange={props.onSdkCodeChange}
              rows={Math.min(20, Math.max(6, props.sdkCode.split('\n').length + 1))}
            />
          </div>
        </Show>

        {/* Main input row */}
        <div class="composer__input">
          <textarea
            class="composer__textarea"
            rows={2}
            value={props.userMessage}
            onInput={(e) => props.onUserMessageChange(e.currentTarget.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (canSend()) props.onSend();
              }
            }}
            placeholder="Send a message…"
            spellcheck={true}
          />
          <Show when={props.canSave}>
            <button
              type="button"
              class="composer__save"
              classList={{
                'composer__save--saved': props.saveStatus === 'saved',
                'composer__save--saving': props.saveStatus === 'saving',
                'composer__save--error': props.saveStatus === 'error',
              }}
              onClick={() => props.onSaveToGist()}
              disabled={props.saveStatus === 'saving'}
              title={
                props.saveStatus === 'saved'
                  ? 'Copied to clipboard — paste into the GitHub gist tab'
                  : props.saveStatus === 'error'
                    ? 'Could not copy — check console'
                    : 'Save this request as a GitHub gist'
              }
              aria-label="Save request and response to GitHub gist"
            >
              <Show
                when={props.saveStatus === 'saved'}
                fallback={
                  <Show when={props.saveStatus === 'saving'} fallback={<GistIcon />}>
                    <span class="spinner spinner--white" />
                  </Show>
                }
              >
                <CheckIcon />
              </Show>
              <span class="composer__save-label">
                {props.saveStatus === 'saved'
                  ? 'Copied'
                  : props.saveStatus === 'saving'
                    ? 'Saving…'
                    : 'Save'}
              </span>
            </button>
          </Show>
          <button
            type="submit"
            class="composer__send"
            classList={{ 'composer__send--code': props.willRunCode }}
            disabled={!canSend()}
            title={
              !canSend()
                ? 'Type a message to send'
                : props.willRunCode
                  ? 'Run edited SDK code (⌘/Ctrl + Enter)'
                  : 'Send (⌘/Ctrl + Enter)'
            }
            aria-label={props.willRunCode ? 'Run code' : 'Send request'}
          >
            <Show when={props.loading} fallback={<SendIcon />}>
              <span class="spinner spinner--white" />
            </Show>
          </button>
        </div>

        {/* Toolbar — inline below the textarea */}
        <div class="composer__toolbar">
          <button
            type="button"
            class="composer__tool"
            classList={{ 'composer__tool--active': systemOpen() }}
            onClick={() => setSystemOpen(!systemOpen())}
          >
            <span class="composer__tool-glyph">{systemOpen() ? '−' : '+'}</span>
            System prompt
            <Show when={sysLen() > 0}>
              <span class="composer__tool-count">({sysLen().toLocaleString()})</span>
            </Show>
          </button>
          <Show when={!props.headersLocked}>
            <button
              type="button"
              class="composer__tool"
              classList={{ 'composer__tool--active': headersOpen() }}
              onClick={() => setHeadersOpen(!headersOpen())}
            >
              <span class="composer__tool-glyph">{headersOpen() ? '−' : '+'}</span>
              Headers
              <Show when={headersCount() > 0}>
                <span class="composer__tool-count">({headersCount()})</span>
              </Show>
              <Show when={blockedCount() > 0}>
                <span
                  class="composer__tool-warn"
                  title={`${blockedCount()} header(s) will be dropped by the browser`}
                >
                  !
                </span>
              </Show>
            </button>
          </Show>
          <button
            type="button"
            class="composer__tool"
            classList={{ 'composer__tool--active': connOpen() }}
            onClick={() => setConnOpen(!connOpen())}
            title={
              props.apiKey.trim().length > 0
                ? 'Connection — API key saved'
                : 'Connection — no API key set'
            }
          >
            <span class="composer__tool-glyph">{connOpen() ? '−' : '+'}</span>
            Connection
            <Show
              when={props.apiKey.trim().length > 0}
              fallback={
                <span class="composer__tool-warn" title="No API key set">
                  !
                </span>
              }
            >
              <span class="composer__tool-ok" title="API key saved" aria-hidden="true" />
            </Show>
          </button>
          <button
            type="button"
            class="composer__tool"
            classList={{ 'composer__tool--active': sdkOpen() }}
            onClick={() => setSdkOpen(!sdkOpen())}
            title="Preview the equivalent SDK code"
          >
            <span class="composer__tool-glyph">{sdkOpen() ? '−' : '+'}</span>
            SDK code
          </button>
          <button
            type="button"
            class="composer__tool"
            classList={{ 'composer__tool--active': props.stream }}
            onClick={() => props.onStreamChange(!props.stream)}
            aria-pressed={props.stream}
            title={
              props.stream
                ? 'Streaming on — the response renders token by token (SSE)'
                : 'Streaming off — the full response arrives at once'
            }
          >
            Stream
            <Show when={props.stream}>
              <span class="composer__tool-ok" aria-hidden="true" />
            </Show>
          </button>
          <span class="composer__hint">⌘/Ctrl + Enter to send</span>
        </div>
      </div>
    </form>
  );
};

export default Composer;
