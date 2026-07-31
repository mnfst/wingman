import { For, Show, type Component } from 'solid-js';
import CodeView from './CodeView.jsx';
import type { ProfileLang } from '../profiles';

interface Props {
  code: string;
  lang: ProfileLang;
  langOptions: readonly ProfileLang[];
  onLangChange: (lang: ProfileLang) => void;
  onCodeChange: (code: string) => void;
  isEdited: boolean;
  onReset: () => void;
  /** True when Send can execute this snippet through the stubbed SDK. */
  executable: boolean;
  /** True while the key is printed as an env-var reference, not a secret. */
  keyHidden: boolean;
  onToggleKey: () => void;
  /** The env var the reference points at, e.g. `MANIFEST_API_KEY`. */
  keyEnvName: string;
  /** False when there's no key to hide, which makes the toggle pointless. */
  hasKey: boolean;
}

/**
 * The snippet for the selected client. It lives under the Client tab rather
 * than in a tab of its own: the code *is* the client, and reading "OpenAI SDK"
 * and then hunting for the matching snippet somewhere else was a step nobody
 * needed to take. Editing it edits the request: the fields it names are read
 * back into the bars above as you type.
 */
const CodePanel: Component<Props> = (props) => {
  return (
    <div class="config__section">
      <div class="config__panel-head">
        <span class="config__label">
          Code
          <Show
            when={props.executable}
            fallback={
              <span
                class="config__badge"
                title="Browsers can't run this one. Copy it and run it locally."
              >
                preview only
              </span>
            }
          >
            <span class="config__badge config__badge--ok">runnable</span>
          </Show>
          <Show when={props.isEdited}>
            <span class="config__badge config__badge--accent">edited</span>
          </Show>
        </span>
        <div class="config__panel-actions">
          <Show when={props.langOptions.length > 1}>
            <div class="lang-toggle" role="tablist" aria-label="Code language">
              <For each={props.langOptions}>
                {(l) => (
                  <button
                    type="button"
                    class="lang-toggle__btn"
                    classList={{ 'lang-toggle__btn--active': props.lang === l }}
                    onClick={() => props.onLangChange(l)}
                    role="tab"
                    aria-selected={props.lang === l}
                  >
                    {l === 'bash' ? 'cURL' : l}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={props.hasKey}>
            <button
              type="button"
              class="config__link"
              onClick={props.onToggleKey}
              aria-pressed={!props.keyHidden}
              title={
                props.keyHidden
                  ? 'Print the real key instead of the env var, only safe if nobody else is looking'
                  : `Go back to ${props.keyEnvName}`
              }
            >
              {props.keyHidden ? 'Reveal key' : 'Hide key'}
            </button>
          </Show>
          <Show when={props.isEdited}>
            <button type="button" class="config__link" onClick={props.onReset}>
              Reset
            </button>
          </Show>
        </div>
      </div>
      <p class="config__note">
        <Show
          when={props.executable}
          fallback={<>Two-way with the request above: change either one and the other follows.</>}
        >
          {props.isEdited
            ? 'Edited. Send now runs this snippet through a stubbed SDK instead of the form.'
            : 'Two-way with the request above: change either one and the other follows. Write something the form has no field for and Send will run the snippet instead.'}
        </Show>
      </p>
      <Show when={props.hasKey && props.keyHidden}>
        <p class="config__note config__note--dim">
          Your key stays out of the snippet. It reads <code>{props.keyEnvName}</code> from the
          environment, so this is safe to paste into an issue or a screenshot.
        </p>
      </Show>
      <CodeView
        code={props.code}
        language={props.lang}
        editable
        onChange={props.onCodeChange}
        rows={Math.min(16, Math.max(6, props.code.split('\n').length + 1))}
      />
    </div>
  );
};

export default CodePanel;
