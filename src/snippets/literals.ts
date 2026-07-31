// Text scanning shared by the snippet parser. Deliberately dumb: our snippets
// are generated from known templates, so pattern matching over them is enough
// and a real JS/Python/shell parser would be three parsers too many. Everything
// here degrades to "found nothing" rather than throwing, because it runs on
// every keystroke in the code editor, including on half-typed lines.

/** A quoted string in any flavour our snippets use, or a bare token. */
const QUOTED = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\`(?:[^\`\\]|\\.)*\``;
const BARE = String.raw`[^\s,)}\]"'\`]+`;
export const VALUE = `(${QUOTED}|${BARE})`;

/** A regex whose last group is a value, built from a prefix pattern. */
export function valueRegex(prefix: string, flags = 'i'): RegExp {
  return new RegExp(prefix + VALUE, flags);
}

/**
 * `name: <value>` / `name=<value>` / `"name": <value>`. The value may not start
 * on the next line. `\s*` there would happily read the following YAML key as
 * the value of an empty one.
 */
export function fieldRegex(...names: string[]): RegExp {
  return valueRegex(String.raw`\b(?:${names.join('|')})"?\s*[:=][ \t]*`);
}

/**
 * The same, but only where the name opens a line. Snippets JSON-escape the
 * system prompt and the user message, so nothing inside them can contain a
 * newline. Anchoring is what stops a prompt that happens to read
 * "system: be terse" from being mistaken for the field itself.
 */
export function lineFieldRegex(...names: string[]): RegExp {
  return valueRegex(String.raw`^[ \t]*"?(?:${names.join('|')})"?\s*[:=][ \t]*`, 'im');
}

/** Unwrap one level of quoting, honouring JSON escapes and shell `'\''`. */
export function unquote(raw: string): string {
  const s = raw.trim();
  const q = s[0];
  if (s.length < 2 || !s.endsWith(q!) || (q !== '"' && q !== "'" && q !== '`')) return s;
  const inner = s.slice(1, -1);
  if (q === '"') {
    try {
      return JSON.parse(s) as string;
    } catch {
      /* half-typed escape, so fall through to the naive unescape */
    }
  }
  if (q === "'") return inner.split("'\\''").join("'");
  return inner.replace(/\\(.)/g, '$1');
}

/** The first value `re` captures, unquoted. */
export function matchValue(code: string, re: RegExp): string | undefined {
  const m = re.exec(code);
  return m?.[1] === undefined ? undefined : unquote(m[1]);
}

/** Every value `re` captures across the string, unquoted. `re` must be global. */
export function matchValues(code: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(re)) {
    if (m[1] !== undefined) out.push(unquote(m[1]));
  }
  return out;
}

/**
 * The `[...]` or `{...}` starting at `from`, brackets balanced and string
 * literals skipped so a `]` inside a message doesn't end the block early.
 * Null when it never closes (the user is still typing).
 */
export function balancedBlock(code: string, from: number): string | null {
  const open = code[from];
  if (open !== '[' && open !== '{') return null;
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let quote = '';
  for (let i = from; i < code.length; i++) {
    const ch = code[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return code.slice(from, i + 1);
  }
  return null;
}

/** The block opened by the first match of `re`, or null. */
export function blockAfter(code: string, re: RegExp): string | null {
  const m = re.exec(code);
  if (!m) return null;
  return balancedBlock(code, m.index + m[0].length - 1);
}

/**
 * True for a value that points at a secret rather than being one: `$KEY`,
 * `process.env.KEY`, `os.environ["KEY"]`, `` `Bearer ${process.env.KEY}` ``.
 * Reading one of those back into the API-key field would overwrite the user's
 * key with the reference that was standing in for it.
 */
export function containsEnvRef(value: string): boolean {
  return /\$\{?[A-Za-z_]|\bprocess\.env\b|\bos\.environ\b|\bimport\.meta\.env\b/.test(value);
}

export function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
}
