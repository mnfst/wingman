import { For, Show, type Component } from 'solid-js';
import type { SendResult } from '../send';
import type { ApiFormat } from '../formats';
import AssistantMessage from './AssistantMessage.jsx';

interface Props {
  userMessage: string;
  result: SendResult | null;
  loading: boolean;
  hasSent: boolean;
  format: ApiFormat;
  streamingText: string;
}

/* Thin-line magic wand with sparkles — the empty pane's only ornament, drawn
   in border-grey so it reads as texture, not content (Bruno's paper plane). */
const WandIcon: Component = () => (
  <svg
    width="120"
    height="120"
    viewBox="0 0 120 120"
    fill="none"
    stroke="currentColor"
    stroke-width="3.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {/* handle */}
    <line x1="24" y1="96" x2="62" y2="58" />
    {/* tip, separated by a band gap */}
    <line x1="68" y1="52" x2="80" y2="40" />
    {/* large 4-point sparkle */}
    <path d="M92 18v16M84 26h16" />
    {/* small sparkles */}
    <path d="M62 24v9M57.5 28.5h9" stroke-width="2.5" />
    <path d="M100 58v9M95.5 62.5h9" stroke-width="2.5" />
    <circle cx="46" cy="42" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="104" cy="34" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');
const MOD = isMac ? '⌘' : 'Ctrl';

// ChatGPT/Claude-flavoured bindings, presented Bruno-style in the empty pane.
const SHORTCUTS: ReadonlyArray<{ label: string; keys: string[] }> = [
  { label: 'Send message', keys: ['Enter'] },
  { label: 'Send from anywhere', keys: [MOD, 'Enter'] },
  { label: 'New request', keys: [MOD, 'Shift', 'O'] },
  { label: 'Focus message box', keys: ['Shift', 'Esc'] },
];

const Conversation: Component<Props> = (props) => {
  return (
    <div class="conversation">
      <Show
        when={props.hasSent}
        fallback={
          <div class="conversation__empty">
            <div class="conversation__empty-art">
              <WandIcon />
            </div>
            <dl class="shortcuts">
              <For each={SHORTCUTS}>
                {(s) => (
                  <div class="shortcuts__row">
                    <dt>{s.label}</dt>
                    <dd>
                      <For each={s.keys}>{(k) => <kbd class="kbd">{k}</kbd>}</For>
                    </dd>
                  </div>
                )}
              </For>
            </dl>
          </div>
        }
      >
        <Show when={props.userMessage}>
          <div class="user-msg">
            <div class="user-msg__bubble">{props.userMessage}</div>
          </div>
        </Show>
        <AssistantMessage
          result={props.result}
          loading={props.loading}
          format={props.format}
          streamingText={props.streamingText}
        />
      </Show>
    </div>
  );
};

export default Conversation;
