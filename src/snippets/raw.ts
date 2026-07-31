// Snippets for the Default client: the request with no SDK in the way, as
// cURL or as a plain fetch. Unlike the SDK snippets these spell out every
// header, because there's no library to add them — which makes them the one
// place the Headers tab is visible in full.
import { envHint, indentLines, jsonBody, wireHeaders, type SnippetContext } from './context';

export function curlSnippet(ctx: SnippetContext): string {
  const p = ctx.params;
  const url = `${p.baseUrl}${ctx.format.path}`;
  const headerLines = Object.entries(wireHeaders(ctx)).map(([k, v]) => `-H "${k}: ${v}"`);
  const body = jsonBody(ctx.format.buildBody(p, { stream: false }), 2).replace(/'/g, "'\\''");
  return `${envHint(ctx)}curl -sS -X POST ${url} \\
  ${headerLines.join(' \\\n  ')} \\
  -d '${body}'`;
}

/**
 * `$MANIFEST_API_KEY` is shell, not JavaScript. In a fetch snippet the same
 * reference has to become `process.env.…` — bare when the header is only the
 * key, interpolated into a template literal when it's `Bearer <key>`.
 */
function jsHeaderValue(ctx: SnippetContext, value: string): string {
  const ref = `$${ctx.key.envName}`;
  if (!ctx.key.hidden || !value.includes(ref)) return JSON.stringify(value);
  const expr = `process.env.${ctx.key.envName}`;
  if (value === ref) return expr;
  return '`' + value.split(ref).join(`\${${expr}}`) + '`';
}

function jsHeaderLiteral(ctx: SnippetContext, indent: number): string {
  const pad = ' '.repeat(indent + 2);
  const lines = Object.entries(wireHeaders(ctx)).map(
    ([k, v]) => `${pad}${JSON.stringify(k)}: ${jsHeaderValue(ctx, v)},`,
  );
  return `{\n${lines.join('\n')}\n${' '.repeat(indent)}}`;
}

export function rawSnippet(ctx: SnippetContext): string {
  const p = ctx.params;
  const url = `${p.baseUrl}${ctx.format.path}`;
  const body = jsonBody(ctx.format.buildBody(p, { stream: false }), 2);
  return `// Plain fetch — no User-Agent override.
fetch("${url}", {
  method: "POST",
  headers: ${jsHeaderLiteral(ctx, 2)},
  body: JSON.stringify(${indentLines(body, 2)}),
});`;
}
