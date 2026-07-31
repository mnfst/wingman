// Running an edited snippet is the one place Wingman evaluates user code. The
// stubs stand in for real SDKs, so what has to hold is that whatever the user
// writes turns into the same SendResult a form-driven send would produce — and
// that a snippet which never calls out says so, rather than silently doing
// nothing.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isExecutable, runUserCode } from './index';

const fetchMock = vi.fn();

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

describe('isExecutable', () => {
  it.each(['openai-sdk', 'vercel-ai-sdk', 'langchain'])('runs the %s TypeScript snippet', (id) => {
    expect(isExecutable(id, 'typescript')).toBe(true);
  });

  // Python would need Pyodide and a cURL command needs a shell; claiming either
  // is runnable would put a "Run" button on code that cannot run.
  it.each(['python', 'bash'])('never runs a %s snippet', (lang) => {
    expect(isExecutable('openai-sdk', lang)).toBe(false);
    expect(isExecutable('default', lang)).toBe(false);
  });

  it('has no runner for the agent CLI or preview-only clients', () => {
    expect(isExecutable('openclaw', 'typescript')).toBe(false);
    expect(isExecutable('anthropic-sdk', 'typescript')).toBe(false);
  });

  // The lookup is a plain object, so a key off Object.prototype must not read
  // as a registered runner.
  it('does not treat an inherited property as a runner', () => {
    expect(isExecutable('constructor', 'typescript')).toBe(false);
  });
});

describe('runUserCode with the OpenAI stub', () => {
  it('turns a snippet into the request the SDK would have made', async () => {
    fetchMock.mockResolvedValue(ok());

    const out = await run(
      'openai-sdk',
      `import OpenAI from "openai";
       const client = new OpenAI({ baseURL: "https://gw.example.com/v1", apiKey: "sk-inline" });
       const response = await client.chat.completions.create({ model: "gpt-4o", messages: [] });
       console.log(response.choices[0].message.content);`,
    );

    expect(lastRequest().url).toBe('https://gw.example.com/v1/chat/completions');
    expect(lastRequest().headers.Authorization).toBe('Bearer sk-inline');
    expect(lastRequest().headers['X-Stainless-Lang']).toBe('js');
    expect(lastRequest().body).toEqual({ model: 'gpt-4o', messages: [] });
    expect(out.result.ok).toBe(true);
    expect(out.logs).toEqual(['hi']);
  });

  // The form's Base URL and key are the defaults, so a snippet that omits them
  // still targets what the URL bar shows.
  it('falls back to the endpoint and key from the URL bar', async () => {
    fetchMock.mockResolvedValue(ok());
    await run('openai-sdk', 'await new OpenAI().chat.completions.create({ model: "auto" });');
    expect(lastRequest().url).toBe('https://app.manifest.build/v1/chat/completions');
    expect(lastRequest().headers.Authorization).toBe('Bearer mnfst_test');
  });

  it('never doubles a slash when the snippet supplies a trailing one', async () => {
    fetchMock.mockResolvedValue(ok());
    await run(
      'openai-sdk',
      'await new OpenAI({ baseURL: "https://gw.example.com/v1/" }).chat.completions.create({});',
    );
    expect(lastRequest().url).toBe('https://gw.example.com/v1/chat/completions');
  });

  it('forwards the SDK organization, project and custom headers', async () => {
    fetchMock.mockResolvedValue(ok());
    await run(
      'openai-sdk',
      `await new OpenAI({
         organization: "org_1",
         project: "proj_1",
         defaultHeaders: { "X-Trace": "abc" },
       }).chat.completions.create({});`,
    );
    expect(lastRequest().headers).toMatchObject({
      'OpenAI-Organization': 'org_1',
      'OpenAI-Project': 'proj_1',
      'X-Trace': 'abc',
    });
  });

  it('routes the responses shim through the chat endpoint', async () => {
    fetchMock.mockResolvedValue(ok());
    await run('openai-sdk', 'await new OpenAI().responses.create({ model: "auto" });');
    expect(lastRequest().url).toBe('https://app.manifest.build/v1/chat/completions');
  });

  // A 401 is the most informative failure there is; the inspector must still
  // show the response even though the SDK threw.
  it('keeps the captured result when the SDK throws on a failed request', async () => {
    fetchMock.mockResolvedValue(failure(401, { error: { message: 'bad key' } }));

    const out = await run('openai-sdk', 'await new OpenAI().chat.completions.create({});');

    expect(out.result.status).toBe(401);
    expect(out.result.responseJson).toEqual({ error: { message: 'bad key' } });
    expect(out.logs).toContain('[error] OpenAI request failed: 401 Unauthorized');
  });
});
