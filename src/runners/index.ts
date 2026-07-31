import type { SendResult } from '../send';
import { makeOpenAIStub } from './openai';
import { makeVercelAIStubs } from './vercel-ai';
import { makeLangChainStub } from './langchain';
import type { RunnerContext } from './types';

export interface RunOptions {
  profileId: string;
  code: string;
  baseUrl: string;
  apiKey: string;
}

export interface RunOutput {
  result: SendResult;
  logs: string[];
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

/**
 * Strip ES module syntax we can't honour at runtime (imports, exports). We
 * replace them with empty lines so source line numbers in error messages
 * still match what the user sees in the editor.
 */
function stripModuleSyntax(code: string): string {
  return code
    .replace(/^\s*import\s+[^;]+;?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+/gm, '')
    .replace(/^\s*export\s+/gm, '');
}

function makeConsoleStub(logs: string[]): Console {
  const fmt = (args: unknown[]) =>
    args
      .map((a) => {
        if (typeof a === 'string') return a;
        try {
          return JSON.stringify(a, null, 2);
        } catch {
          return String(a);
        }
      })
      .join(' ');
  // Cast at the boundary — we don't want every call site to know the stub
  // doesn't implement the full Console surface.
  return {
    log: (...args: unknown[]) => logs.push(fmt(args)),
    info: (...args: unknown[]) => logs.push(fmt(args)),
    warn: (...args: unknown[]) => logs.push('[warn] ' + fmt(args)),
    error: (...args: unknown[]) => logs.push('[error] ' + fmt(args)),
    debug: (...args: unknown[]) => logs.push('[debug] ' + fmt(args)),
  } as unknown as Console;
}

/**
 * The global bindings a profile's snippet expects, keyed by profile id. One
 * table, rather than a switch plus a hand-maintained list of ids: `isExecutable`
 * and the runner lookup used to be able to disagree, and did — both still named
 * a `raw` profile that had been folded into `default` and could no longer be
 * reached, alongside a `bash` branch that would have fed a cURL command to a JS
 * parser. Adding a runner is now one entry.
 */
const RUNNERS: Record<string, (ctx: RunnerContext) => Record<string, unknown>> = {
  'openai-sdk': (ctx) => ({ OpenAI: makeOpenAIStub(ctx) }),
  'vercel-ai-sdk': (ctx) => makeVercelAIStubs(ctx),
  langchain: (ctx) => ({ ChatOpenAI: makeLangChainStub(ctx) }),
};

/**
 * Whether Send can execute this client's snippet in the browser. TypeScript
 * only: Python would need Pyodide and a cURL command needs a shell.
 */
export function isExecutable(profileId: string, lang: string): boolean {
  return lang === 'typescript' && Object.hasOwn(RUNNERS, profileId);
}

export async function runUserCode(opts: RunOptions): Promise<RunOutput> {
  const logs: string[] = [];
  const captured: SendResult[] = [];
  const ctx: RunnerContext = {
    defaultBaseUrl: opts.baseUrl,
    defaultApiKey: opts.apiKey,
    hooks: { onResult: (r) => captured.push(r) },
  };
  const makeGlobals = RUNNERS[opts.profileId];
  if (!makeGlobals) {
    throw new Error(`No runner registered for profile "${opts.profileId}".`);
  }
  const globals = makeGlobals(ctx);
  const consoleStub = makeConsoleStub(logs);
  const stripped = stripModuleSyntax(opts.code);

  // Snippets read the key from `process.env` so the panel can be shared, and
  // there's no `process` in a browser. An empty env is the honest stand-in:
  // every stub falls back to the key from the URL bar when it reads undefined.
  const processStub = { env: {} as Record<string, string | undefined> };

  const argNames = ['console', 'process', ...Object.keys(globals)];
  const argValues: unknown[] = [consoleStub, processStub, ...Object.values(globals)];

  let fn: (...args: unknown[]) => Promise<unknown>;
  try {
    fn = new AsyncFunction(...argNames, stripped);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not parse code: ${msg}`);
  }

  try {
    await fn(...argValues);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (captured.length === 0) {
      throw new Error(msg);
    }
    // The fetch went through but the user's code threw afterward (e.g. a
    // JSON-shape assumption). Surface both: keep the captured result, append
    // the error to the logs.
    logs.push(`[error] ${msg}`);
  }

  if (captured.length === 0) {
    throw new Error(
      'Code ran but no request was made. Make sure your code calls the SDK (e.g. client.chat.completions.create).',
    );
  }
  return { result: captured[captured.length - 1]!, logs };
}
