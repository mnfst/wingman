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
}

/**
 * The snippet for the selected client. It lives under the Client tab rather
 * than in a tab of its own: the code *is* the client — reading "OpenAI SDK"
 * and then hunting for the matching snippet somewhere else was a step nobody
 * needed to take.
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
          fallback={<>Mirrors the request above. Copy it and run it locally to check.</>}
        >
          {props.isEdited
            ? 'Edited. Send now runs this snippet through a stubbed SDK instead of the form.'
            : 'In sync with the request above. Edit it and Send will run the snippet instead.'}
        </Show>
      </p>
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
