// Code-snippet builders for the Code panel, plus the parser that reads an
// edited snippet back into the form. Kept out of the profile catalog so
// profiles.ts stays scannable.
export { autoHeaders, type KeyRef, type SnippetContext } from './context';
export { hermesSnippet, openclawSnippet } from './agents';
export {
  anthropicSdkSnippet,
  langchainSnippet,
  openaiResponsesSnippet,
  openaiSdkSnippet,
  vercelSnippet,
} from './sdks';
export { curlSnippet, rawSnippet } from './raw';
export { parseSnippet, type ParseOptions, type SnippetPatch } from './parse';
