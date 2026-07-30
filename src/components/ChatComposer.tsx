import { createEffect, Show, type Component } from 'solid-js';

interface Props {
  userMessage: string;
  onUserMessageChange: (value: string) => void;
  loading: boolean;
  onSend: () => void;
  /** True when Send executes the edited SDK snippet instead of the form. */
  willRunCode: boolean;
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

/**
 * ChatGPT-style message box: just the text and a send arrow. Everything about
 * the request (client, endpoint, headers, system prompt) is configured in the
 * bars above — this is only what the "user" says.
 */
const ChatComposer: Component<Props> = (props) => {
  let taRef: HTMLTextAreaElement | undefined;

  const canSend = () => !props.loading && props.userMessage.trim().length > 0;

  const onSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    if (canSend()) props.onSend();
  };

  // Grow with the content up to the CSS max-height, ChatGPT-style. Runs on
  // every message change, including programmatic ones (restoring a tab).
  createEffect(() => {
    void props.userMessage;
    if (!taRef) return;
    taRef.style.height = 'auto';
    taRef.style.height = `${Math.min(taRef.scrollHeight, 200)}px`;
  });

  return (
    <form class="chatbox" onSubmit={onSubmit}>
      <div class="chatbox__wrap">
        <textarea
          class="chatbox__textarea"
          ref={taRef}
          rows={1}
          value={props.userMessage}
          onInput={(e) => props.onUserMessageChange(e.currentTarget.value)}
          onKeyDown={(e) => {
            // Enter sends (chat convention); Shift+Enter inserts a newline.
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
              e.preventDefault();
              if (canSend()) props.onSend();
            }
          }}
          placeholder="Message the model…"
          spellcheck={true}
          aria-label="User message"
        />
        <button
          type="submit"
          class="chatbox__send"
          classList={{ 'chatbox__send--code': props.willRunCode }}
          disabled={!canSend()}
          title={
            !canSend()
              ? 'Type a message to send'
              : props.willRunCode
                ? 'Run edited SDK code (Enter)'
                : 'Send (Enter)'
          }
          aria-label={props.willRunCode ? 'Run code' : 'Send message'}
        >
          <Show when={props.loading} fallback={<SendIcon />}>
            <span class="spinner spinner--white" />
          </Show>
        </button>
      </div>
    </form>
  );
};

export default ChatComposer;
