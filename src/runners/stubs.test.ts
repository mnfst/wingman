// The Vercel AI and LangChain stubs. Each stands in for a real SDK, so what
// has to hold is that the snippet a user would actually write produces the same
// request the SDK would have sent.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runUserCode } from './index';

function ok(body: unknown = { choices: [{ message: { content: 'hi' } }] }) {
  return {
    status: 200,
    statusText: 'OK',
    ok: true,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(JSON.stringify(body)),
    body: null,
  } as unknown as Response;
}

function failure(status: number, body: unknown) {
  return {
    status,
    statusText: 'Unauthorized',
    ok: false,
    headers: new Headers(),
    text: () => Promise.resolve(JSON.stringify(body)),
    body: null,
  } as unknown as Response;
}

const fetchMock = vi.fn();

const run = (profileId: string, code: string) =>
  runUserCode({ profileId, code, baseUrl: 'https://app.manifest.build', apiKey: 'mnfst_test' });

const lastRequest = () => {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error('no request was made');
  const [url, init] = call as [string, RequestInit];
  return {
    url,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string),
  };
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('runUserCode with the Vercel AI stub', () => {
  it('assembles system, messages and prompt into one messages array', async () => {
    fetchMock.mockResolvedValue(ok());

    const out = await run(
      'vercel-ai-sdk',
      `const manifest = createOpenAI({ baseURL: "https://gw.example.com/v1", apiKey: "sk-x", headers: { "X-Trace": "1" } });
       const { text } = await generateText({
         model: manifest("auto"),
         system: "be terse",
         messages: [{ role: "assistant", content: "prior" }],
         prompt: "hello",
       });
       console.log(text);`,
    );

    expect(lastRequest().body.messages).toEqual([
      { role: 'system', content: 'be terse' },
      { role: 'assistant', content: 'prior' },
      { role: 'user', content: 'hello' },
    ]);
    expect(lastRequest().headers['X-Trace']).toBe('1');
    expect(out.logs).toEqual(['hi']);
  });

  it('falls back to the URL bar endpoint and key', async () => {
    fetchMock.mockResolvedValue(ok());
    await run(
      'vercel-ai-sdk',
      'await generateText({ model: createOpenAI()("auto"), prompt: "hi" });',
    );
    expect(lastRequest().url).toBe('https://app.manifest.build/v1/chat/completions');
    expect(lastRequest().headers.Authorization).toBe('Bearer mnfst_test');
  });

  it('returns an empty string when the response carries no assistant text', async () => {
    fetchMock.mockResolvedValue(ok({ choices: [] }));
    const out = await run(
      'vercel-ai-sdk',
      'const r = await generateText({ model: createOpenAI()("auto"), prompt: "hi" }); console.log(JSON.stringify(r.text));',
    );
    expect(out.logs).toEqual(['""']);
  });

  it('returns an empty string when the response is not an object at all', async () => {
    fetchMock.mockResolvedValue(ok(null));
    const out = await run(
      'vercel-ai-sdk',
      'const r = await generateText({ model: createOpenAI()("auto"), prompt: "hi" }); console.log(JSON.stringify(r.text));',
    );
    expect(out.logs).toEqual(['""']);
  });

  it('throws on a failed request', async () => {
    fetchMock.mockResolvedValue(failure(500, { error: 'boom' }));
    const out = await run(
      'vercel-ai-sdk',
      'await generateText({ model: createOpenAI()("auto"), prompt: "hi" });',
    );
    expect(out.result.status).toBe(500);
  });

  // Better a named gap than a cryptic "generateText is not a function".
  it('names streamText as an unimplemented stub', async () => {
    await expect(run('vercel-ai-sdk', 'await streamText({});')).rejects.toThrow(
      /streamText is not stubbed/,
    );
  });
});

describe('runUserCode with the LangChain stub', () => {
  it('normalises a plain string into a user message', async () => {
    fetchMock.mockResolvedValue(ok());

    const out = await run(
      'langchain',
      `const llm = new ChatOpenAI({ model: "auto", apiKey: "sk-x", configuration: { baseURL: "https://gw.example.com/v1" } });
       const response = await llm.invoke("hello");
       console.log(response.content);`,
    );

    expect(lastRequest().body).toEqual({
      model: 'auto',
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(out.logs).toEqual(['hi']);
  });

  it('normalises a mixed message array', async () => {
    fetchMock.mockResolvedValue(ok());
    await run(
      'langchain',
      `await new ChatOpenAI({ model: "auto" }).invoke([
         "plain",
         { role: "system", content: "be terse" },
         { content: "no role" },
       ]);`,
    );
    expect(lastRequest().body.messages).toEqual([
      { role: 'user', content: 'plain' },
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'no role' },
    ]);
  });

  it('sends no messages when handed something it cannot read', async () => {
    fetchMock.mockResolvedValue(ok());
    await run('langchain', 'await new ChatOpenAI({ model: "auto" }).invoke(42);');
    expect(lastRequest().body.messages).toEqual([]);
  });

  it('falls back to the URL bar endpoint, key and default headers', async () => {
    fetchMock.mockResolvedValue(ok());
    await run(
      'langchain',
      'await new ChatOpenAI({ model: "auto", defaultHeaders: { "X-Trace": "1" } }).invoke("hi");',
    );
    expect(lastRequest().url).toBe('https://app.manifest.build/v1/chat/completions');
    expect(lastRequest().headers).toMatchObject({
      Authorization: 'Bearer mnfst_test',
      'X-Trace': '1',
    });
  });

  it('returns empty content when the response has none', async () => {
    fetchMock.mockResolvedValue(ok({}));
    const out = await run(
      'langchain',
      'const r = await new ChatOpenAI({ model: "auto" }).invoke("hi"); console.log(JSON.stringify(r.content));',
    );
    expect(out.logs).toEqual(['""']);
  });

  it('returns empty content when the response is not an object at all', async () => {
    fetchMock.mockResolvedValue(ok(null));
    const out = await run(
      'langchain',
      'const r = await new ChatOpenAI({ model: "auto" }).invoke("hi"); console.log(JSON.stringify(r.content));',
    );
    expect(out.logs).toEqual(['""']);
  });

  it('throws on a failed request', async () => {
    fetchMock.mockResolvedValue(failure(429, {}));
    const out = await run('langchain', 'await new ChatOpenAI({ model: "auto" }).invoke("hi");');
    expect(out.result.status).toBe(429);
  });
});

describe('runUserCode diagnostics', () => {
  it('rejects a profile with no runner', async () => {
    await expect(run('openclaw', 'noop();')).rejects.toThrow(/No runner registered/);
  });

  it('explains a syntax error rather than leaking the raw one', async () => {
    await expect(run('openai-sdk', 'const = ;')).rejects.toThrow(/Could not parse code/);
  });

  // Silence would look like the request succeeded and returned nothing.
  it('says so when the snippet never calls the SDK', async () => {
    await expect(run('openai-sdk', 'const x = 1;')).rejects.toThrow(/no request was made/);
  });

  it('surfaces a throw that happened before any request', async () => {
    await expect(run('openai-sdk', 'throw new Error("nope");')).rejects.toThrow('nope');
  });

  it('surfaces a non-Error throw', async () => {
    await expect(run('openai-sdk', 'throw "nope";')).rejects.toThrow('nope');
  });

  // Import lines are replaced rather than deleted so a reported line number
  // still matches the line the user is looking at in the editor.
  it('strips module syntax while preserving line numbers', async () => {
    fetchMock.mockResolvedValue(ok());
    const out = await run(
      'openai-sdk',
      `import OpenAI from "openai";
export default await new OpenAI().chat.completions.create({});
export const unused = 1;`,
    );
    expect(out.result.ok).toBe(true);
  });

  it('formats every console level, objects included', async () => {
    fetchMock.mockResolvedValue(ok());
    const out = await run(
      'openai-sdk',
      `await new OpenAI().chat.completions.create({});
       console.log("plain", { a: 1 });
       console.info("info");
       console.warn("warn");
       console.error("err");
       console.debug("debug");`,
    );
    expect(out.logs).toEqual([
      'plain {\n  "a": 1\n}',
      'info',
      '[warn] warn',
      '[error] err',
      '[debug] debug',
    ]);
  });

  it('logs a value that cannot be serialised without throwing', async () => {
    fetchMock.mockResolvedValue(ok());
    const out = await run(
      'openai-sdk',
      `await new OpenAI().chat.completions.create({});
       const cyclic = {}; cyclic.self = cyclic;
       console.log(cyclic);`,
    );
    expect(out.logs.at(-1)).toBe('[object Object]');
  });

  // Only the call the user is looking at should drive the response pane.
  it('reports the last request when the snippet makes several', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'first' }))
      .mockResolvedValueOnce(ok({ id: 'second' }));

    const out = await run(
      'openai-sdk',
      `const client = new OpenAI();
       await client.chat.completions.create({ model: "a" });
       await client.chat.completions.create({ model: "b" });`,
    );

    expect(out.result.responseJson).toEqual({ id: 'second' });
  });
});
