import { test as base, type Page, type Route } from '@playwright/test';

/** The shape an OpenAI-compatible gateway answers a chat completion with. */
export const CHAT_REPLY = {
  id: 'chatcmpl-e2e',
  model: 'gpt-4o',
  choices: [{ index: 0, message: { role: 'assistant', content: 'Hello from the gateway.' } }],
  usage: { prompt_tokens: 9, completion_tokens: 5, total_tokens: 14 },
};

/** Requests the app made to an LLM endpoint, in order. */
export interface SentRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface Gateway {
  sent: SentRequest[];
  /** Answer the next chat completion with this payload instead of the default. */
  replyWith(body: unknown, status?: number): void;
}

/**
 * Every test runs against a stubbed gateway. No API key, no rate limit, no
 * network flake — and the assertion that matters most (what Wingman actually
 * puts on the wire) is only observable from here.
 */
async function installGateway(page: Page): Promise<Gateway> {
  const gateway: Gateway = {
    sent: [],
    replyWith(body, status = 200) {
      next = { body, status };
    },
  };
  let next: { body: unknown; status: number } | null = null;

  const handle = async (route: Route) => {
    const request = route.request();
    gateway.sent.push({
      url: request.url(),
      headers: request.headers(),
      body: JSON.parse(request.postData() ?? '{}'),
    });
    const reply = next ?? { body: CHAT_REPLY, status: 200 };
    next = null;
    await route.fulfill({
      status: reply.status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(reply.body),
    });
  };

  await page.route('**/v1/chat/completions', handle);
  await page.route('**/v1/responses', handle);
  await page.route('**/v1/messages', handle);
  // The background probes must not reach the real internet either. They are
  // allowed to fail — neither blocks sending.
  await page.route('**/v1/models', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ data: [{ id: 'auto' }, { id: 'gpt-4o' }] }),
    }),
  );
  await page.route('**/api/v1/health', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ status: 'ok' }),
    }),
  );

  return gateway;
}

export const test = base.extend<{ gateway: Gateway }>({
  // `auto`, so the routes are installed and the app is loaded even for a test
  // that never names the fixture. Without it those tests would run against
  // about:blank and fail on a locator rather than on what they assert.
  gateway: [
    async ({ page }, use) => {
      const gateway = await installGateway(page);
      await page.goto('/');
      await use(gateway);
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
