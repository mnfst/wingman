// The two request facets that are keyed by `format:client:language` rather than
// held globally: the SDK snippet the user may have edited, and the request
// headers they may have overridden. Split out of appState so that file stays
// readable — nothing here touches the network or history.
import { createMemo, createSignal, type Accessor } from 'solid-js';
import type { HeaderEntry } from '../components/HeaderEditor.jsx';
import type { ApiFormat, ApiFormatId, RequestParams } from '../formats';
import type { Profile, ProfileLang } from '../profiles';
import { partitionHeaders } from '../send';
import { isExecutable } from '../runners';
import { entriesFromRecord, recordFromEntries } from '../services/settings';

interface Deps {
  formatId: Accessor<ApiFormatId>;
  format: Accessor<ApiFormat>;
  profile: Accessor<Profile>;
  lang: Accessor<ProfileLang>;
  params: () => RequestParams;
}

/**
 * Everything is keyed by `${formatId}:${profileId}:${lang}` so switching client
 * or language doesn't carry one combination's edits into another — the snippet
 * you edited for the OpenAI SDK in TypeScript is still there when you come back
 * to it, and Python starts from the generated code.
 */
export function createRequestForm(d: Deps) {
  const key = () => `${d.formatId()}:${d.profile().id}:${d.lang()}`;

  // ── SDK snippet ─────────────────────────────────────────────────────────
  // An entry here overrides the generated snippet AND becomes the source of
  // truth for Send, provided the client can execute it in this language.
  const [scratchCode, setScratchCode] = createSignal<Record<string, string>>({});

  const generatedSdkCode = createMemo(() => d.profile().code(d.params(), d.lang(), d.format()));

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

  // ── Request headers ─────────────────────────────────────────────────────
  // Defaults come from the format (e.g. anthropic-version); the client layers
  // its fingerprint headers on top. An override replaces both.
  const [headerOverrides, setHeaderOverrides] = createSignal<Record<string, HeaderEntry[]>>({});

  const headerEntries = createMemo<HeaderEntry[]>(() => {
    const cached = headerOverrides()[key()];
    if (cached) return cached;
    return entriesFromRecord({
      ...(d.format().defaultHeaders ?? {}),
      ...d.profile().headers(d.params()),
    });
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

  return {
    sdkCode,
    sdkCodeIsEdited,
    sdkExecutable,
    willRunCode,
    onSdkCodeChange,
    resetSdkCode,
    headerOverrides,
    setHeaderOverrides,
    headerEntries,
    updateHeaderEntries,
    resetHeaders,
    blockedHeaderNames,
  };
}
