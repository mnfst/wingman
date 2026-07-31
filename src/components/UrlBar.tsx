import { createEffect, createSignal, on, Show, type Component } from 'solid-js';
import FormatDropdown from './FormatDropdown.jsx';
import ProviderDropdown from './ProviderDropdown.jsx';
import ModelSelect from './ModelSelect.jsx';
import HealthBadge from './HealthBadge.jsx';
import type { ApiFormat } from '../formats';
import type { Provider } from '../providers';
import type { HealthStatus } from '../services/healthCheck';

interface Props {
  formats: readonly ApiFormat[];
  activeFormatId: string;
  onSelectFormat: (id: string) => void;
  providers: readonly Provider[];
  activeProviderId: string;
  onSelectProvider: (id: string) => void;
  baseUrl: string;
  onBaseUrlChange: (value: string) => void;
  baseUrlPlaceholder: string;
  /** Where a send actually POSTs, after normalising the base URL. */
  requestUrl: string;
  /** What normalising changed (a stripped `/v1`, an added scheme), if anything. */
  baseUrlNote?: string;
  /** Why the typed base URL is unusable, if it is. */
  baseUrlProblem?: string;
  apiKey: string;
  apiKeyPlaceholder: string;
  onApiKeyChange: (value: string) => void;
  model: string;
  onModelChange: (value: string) => void;
  modelList: string[];
  healthStatus: HealthStatus;
  loading: boolean;
  canSend: boolean;
  onSend: () => void;
  /** True when Send executes the edited SDK snippet instead of the form. */
  willRunCode: boolean;
  canSave: boolean;
  onSaveToGist: () => void;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  /** Jump to the Code tab (the Postman `</>` affordance). */
  onOpenCode: () => void;
}

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

const CodeIcon: Component = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

/**
 * Postman-style request bar: method/format selector, base URL with an embedded
 * provider preset, the credential right next to the address it belongs to,
 * model, then Send + Save + a `</>` jump to the generated code.
 */
const UrlBar: Component<Props> = (props) => {
  const [keyRevealed, setKeyRevealed] = createSignal(false);

  // A different provider means a different secret in the field, so never leave
  // the next one revealed unasked.
  createEffect(
    on(
      () => props.activeProviderId,
      () => setKeyRevealed(false),
      { defer: true },
    ),
  );

  const hasKey = () => props.apiKey.trim().length > 0;

  const onSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    if (props.canSend) props.onSend();
  };

  return (
    <form class="urlbar" onSubmit={onSubmit}>
      <div class="urlbar__row">
        <FormatDropdown
          formats={props.formats}
          activeId={props.activeFormatId}
          onSelect={props.onSelectFormat}
        />
        <div class="urlbar__url" classList={{ 'urlbar__url--invalid': !!props.baseUrlProblem }}>
          <ProviderDropdown
            providers={props.providers}
            activeId={props.activeProviderId}
            onSelect={props.onSelectProvider}
          />
          <input
            class="urlbar__url-input"
            type="text"
            value={props.baseUrl}
            onInput={(e) => props.onBaseUrlChange(e.currentTarget.value)}
            placeholder={props.baseUrlPlaceholder}
            spellcheck={false}
            autocomplete="off"
            aria-label="Base URL"
            title={`POST ${props.requestUrl}`}
          />
          <HealthBadge status={props.healthStatus} />
        </div>
        <div class="urlbar__key" classList={{ 'urlbar__key--set': hasKey() }}>
          <input
            class="urlbar__key-input"
            type={keyRevealed() ? 'text' : 'password'}
            value={props.apiKey}
            onInput={(e) => props.onApiKeyChange(e.currentTarget.value)}
            placeholder={props.apiKeyPlaceholder}
            spellcheck={false}
            autocomplete="off"
            aria-label="API key"
            title="Stored per provider, for this tab's session only. It never leaves your browser."
          />
          <button
            type="button"
            class="urlbar__key-toggle"
            onClick={() => setKeyRevealed(!keyRevealed())}
            disabled={!hasKey()}
            aria-label={keyRevealed() ? 'Hide API key' : 'Show API key'}
            title={keyRevealed() ? 'Hide' : 'Show'}
          >
            <Show when={keyRevealed()} fallback={<EyeIcon />}>
              <EyeOffIcon />
            </Show>
          </button>
        </div>
        <ModelSelect value={props.model} onChange={props.onModelChange} models={props.modelList} />
        <button
          type="submit"
          class="urlbar__send"
          classList={{ 'urlbar__send--code': props.willRunCode }}
          disabled={!props.canSend}
          title={
            !props.canSend
              ? 'Type a message below to send'
              : props.willRunCode
                ? 'Run edited SDK code (⌘/Ctrl + Enter)'
                : 'Send (⌘/Ctrl + Enter)'
          }
        >
          <Show when={!props.loading} fallback={<span class="spinner spinner--white" />}>
            {props.willRunCode ? 'Run' : 'Send'}
          </Show>
        </button>
        {/* Always rendered (disabled until there's a result) so Send never
            shifts sideways when the first response lands. */}
        <button
          type="button"
          class="urlbar__save"
          classList={{
            'urlbar__save--saved': props.saveStatus === 'saved',
            'urlbar__save--error': props.saveStatus === 'error',
          }}
          onClick={() => props.onSaveToGist()}
          disabled={!props.canSave || props.saveStatus === 'saving'}
          title={
            !props.canSave
              ? 'Send a request first, then save it as a gist'
              : props.saveStatus === 'saved'
                ? 'Copied to clipboard. Paste it into the GitHub gist tab'
                : 'Save this request as a GitHub gist'
          }
        >
          {props.saveStatus === 'saved' ? 'Copied' : 'Save'}
        </button>
        <button
          type="button"
          class="urlbar__code"
          onClick={props.onOpenCode}
          aria-label="Show this request as code"
          title="Show this request as code"
        >
          <CodeIcon />
        </button>
      </div>
      {/* Pasting a full endpoint or a `/v1` base is the most common way to get
          a 404 out of a healthy gateway, so surface what normalisation did (or
          why the URL is unusable) before Send, but stay silent otherwise. */}
      <Show when={props.baseUrlProblem || props.baseUrlNote}>
        <div class="urlbar__hint" classList={{ 'urlbar__hint--err': !!props.baseUrlProblem }}>
          <Show
            when={props.baseUrlProblem}
            fallback={
              <>
                POST <code>{props.requestUrl}</code>
                <em>{props.baseUrlNote}</em>
              </>
            }
          >
            {props.baseUrlProblem}
          </Show>
        </div>
      </Show>
    </form>
  );
};

export default UrlBar;
