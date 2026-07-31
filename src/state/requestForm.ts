// The two request facets that are keyed by `format:client:language` rather than
// held globally: the SDK snippet the user may have edited, and the request
// headers they may have overridden. Split out of appState so that file stays
// readable. Nothing here touches the network or history.
import { createMemo, createSignal, type Accessor } from 'solid-js';
import type { HeaderEntry } from '../components/HeaderEditor.jsx';
import type { ApiFormat, ApiFormatId, RequestParams } from '../formats';
import type { Profile, ProfileLang } from '../profiles';
import { partitionHeaders } from '../send';
import { isExecutable } from '../runners';
import type { KeyRef, SnippetContext } from '../snippets';
import { entriesFromRecord, recordFromEntries } from '../services/settings';

interface Deps {
  formatId: Accessor<ApiFormatId>;
  format: Accessor<ApiFormat>;
  profile: Accessor<Profile>;
  lang: Accessor<ProfileLang>;
  params: () => RequestParams;
  keyRef: Accessor<KeyRef>;
}

/**
 * Everything is keyed by `${formatId}:${profileId}:${lang}` so switching client
 * or language doesn't carry one combination's edits into another. The snippet
 * you edited for the OpenAI SDK in TypeScript is still there when you come back
 * to it, and Python starts from the generated code.
 */
export function createRequestForm(d: Deps) {
  const key = () => `${d.formatId()}:${d.profile().id}:${d.lang()}`;

  // ── Request headers ─────────────────────────────────────────────────────
  // Defaults come from the format (e.g. anthropic-version); the client layers
  // its fingerprint headers on top. An override replaces both.
  const [headerOverrides, setHeaderOverrides] = createSignal<Record<string, HeaderEntry[]>>({});

  /** What the client and format put on the wire without being asked. */
  const clientHeaders = createMemo<Record<string, string>>(() => ({
    ...(d.format().defaultHeaders ?? {}),
    ...d.profile().headers(d.params()),
  }));

  const headerEntries = createMemo<HeaderEntry[]>(() => {
    const cached = headerOverrides()[key()];
    if (cached) return cached;
    return entriesFromRecord(clientHeaders());
  });

  const updateHeaderEntries = (next: HeaderEntry[]) => {
    setHeaderOverrides({ ...headerOverrides(), [key()]: next });
  };

  const resetHeaders = () => {
    const next = { ...headerOverrides() };
    delete next[key()];
    setHeaderOverrides(next);
  };

  /** Header names the browser will drop before the request goes out. */
  const blockedHeaderNames = () => partitionHeaders(recordFromEntries(headerEntries())).blocked;

  // ── SDK snippet ─────────────────────────────────────────────────────────
  // An entry here overrides the generated snippet AND becomes the source of
  // truth for Send, provided the client can execute it in this language.
  const [scratchCode, setScratchCode] = createSignal<Record<string, string>>({});

  // Everything a snippet renders, in one object, and the same one handed to
  // the parser when the snippet is edited, so the two directions stay symmetric.
  const snippetContext = createMemo<SnippetContext>(() => ({
    params: d.params(),
    lang: d.lang(),
    format: d.format(),
    headers: recordFromEntries(headerEntries()),
    clientHeaders: clientHeaders(),
    key: d.keyRef(),
  }));

  const generatedSdkCode = createMemo(() => d.profile().code(snippetContext()));

  const sdkCodeIsEdited = () => {
    const edited = scratchCode()[key()];
    return edited !== undefined && edited !== generatedSdkCode();
  };
  const sdkCode = () => scratchCode()[key()] ?? generatedSdkCode();
  const sdkExecutable = () =>
    (d.profile().executable ?? false) && isExecutable(d.profile().id, d.lang());
  const willRunCode = () => sdkCodeIsEdited() && sdkExecutable();

  const onSdkCodeChange = (next: string) => {
    setScratchCode({ ...scratchCode(), [key()]: next });
  };
  const resetSdkCode = () => {
    const next = { ...scratchCode() };
    delete next[key()];
    setScratchCode(next);
  };

  return {
    sdkCode,
    sdkCodeIsEdited,
    sdkExecutable,
    willRunCode,
    onSdkCodeChange,
    resetSdkCode,
    snippetContext,
    headerOverrides,
    setHeaderOverrides,
    clientHeaders,
    headerEntries,
    updateHeaderEntries,
    resetHeaders,
    blockedHeaderNames,
  };
}
