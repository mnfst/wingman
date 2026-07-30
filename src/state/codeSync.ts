// The Code panel edits the same request everything else does, so typing in it
// moves the URL bar, the key, the model, the headers and the message box —
// the mirror image of those fields regenerating the snippet.
//
// There's no feedback loop to guard against: an edit is stored as the scratch
// snippet and the scratch always wins over the generated one, so applying the
// patch changes what *would* be generated without touching what's displayed.
import type { Accessor } from 'solid-js';
import type { Profile } from '../profiles';
import { autoHeaders, parseSnippet, type SnippetContext } from '../snippets';
import { entriesFromRecord, recordFromEntries } from '../services/settings';
import type { HeaderEntry } from '../components/HeaderEditor.jsx';

interface Deps {
  profile: Accessor<Profile>;
  snippetContext: Accessor<SnippetContext>;
  clientHeaders: Accessor<Record<string, string>>;
  headerEntries: Accessor<HeaderEntry[]>;
  updateHeaderEntries: (entries: HeaderEntry[]) => void;
  onSdkCodeChange: (code: string) => void;
  baseUrl: Accessor<string>;
  setBaseUrl: (value: string) => void;
  apiKey: Accessor<string>;
  setApiKey: (value: string) => void;
  model: Accessor<string>;
  setModel: (value: string) => void;
  userMessage: Accessor<string>;
  setUserMessage: (value: string) => void;
  systemPrompt: Accessor<string>;
  setSystemPrompt: (value: string) => void;
}

function sameRecord(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

export function createCodeSync(d: Deps) {
  /**
   * Headers the snippet declared, folded back into the tab. A raw snippet
   * spells out every header, so it replaces the set outright; an SDK one only
   * shows what the user added on top of its fingerprint, so those layer over
   * the client's own. Locked clients have no editable headers to sync.
   */
  const applyHeaders = (parsed: Record<string, string>) => {
    if (d.profile().headersLocked) return;
    const next = d.profile().mode === 'raw' ? parsed : { ...d.clientHeaders(), ...parsed };
    if (sameRecord(next, recordFromEntries(d.headerEntries()))) return;
    d.updateHeaderEntries(entriesFromRecord(next));
  };

  return function applyCodeEdit(code: string) {
    d.onSdkCodeChange(code);
    const ctx = d.snippetContext();
    const patch = parseSnippet(code, { format: ctx.format, autoHeaders: autoHeaders(ctx) });

    if (patch.baseUrl !== undefined && patch.baseUrl !== d.baseUrl()) d.setBaseUrl(patch.baseUrl);
    if (patch.apiKey !== undefined && patch.apiKey !== d.apiKey()) d.setApiKey(patch.apiKey);
    if (patch.model !== undefined && patch.model !== d.model()) d.setModel(patch.model);
    if (patch.userMessage !== undefined && patch.userMessage !== d.userMessage()) {
      d.setUserMessage(patch.userMessage);
    }
    if (
      patch.systemPrompt !== undefined &&
      patch.systemPrompt !== d.systemPrompt() &&
      !d.profile().omitsSystemPrompt
    ) {
      d.setSystemPrompt(patch.systemPrompt);
    }
    if (patch.headers !== undefined) applyHeaders(patch.headers);
  };
}
