// Composing and sending a request in a real browser, against the built bundle.
import { expect, test } from './fixtures';

test('sends the message and shows the reply with the wire behind it', async ({ page, gateway }) => {
  await page.getByLabel('User message').fill('Say hi in one sentence.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  await expect(page.getByText('Hello from the gateway.')).toBeVisible();
  await expect(page.getByText('200 OK')).toBeVisible();
  await expect(page.getByText('14 tok')).toBeVisible();
  await expect(page.getByText('gpt-4o', { exact: true })).toBeVisible();

  expect(gateway.sent).toHaveLength(1);
  expect(gateway.sent[0]?.body).toMatchObject({
    model: 'auto',
    messages: [{ role: 'user', content: 'Say hi in one sentence.' }],
  });

  // The inspector is the product: the raw request has to be there to read.
  await page.getByRole('tab', { name: 'Request body' }).click();
  await expect(page.locator('.assistant-msg__pane')).toContainText('Say hi in one sentence.');
});

test('sends the credential typed into the request bar', async ({ page, gateway }) => {
  await page.getByRole('textbox', { name: 'API key' }).fill('mnfst_e2e_key');
  await page.getByLabel('User message').fill('Say hi');
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  await expect(page.getByText('200 OK')).toBeVisible();
  expect(gateway.sent[0]?.headers.authorization).toBe('Bearer mnfst_e2e_key');
});

test('sends on Enter from the message box', async ({ page, gateway }) => {
  await page.getByLabel('User message').fill('Say hi');
  await page.getByLabel('User message').press('Enter');

  await expect(page.getByText('200 OK')).toBeVisible();
  expect(gateway.sent).toHaveLength(1);
});

test('sends the system prompt typed in the left pane', async ({ page, gateway }) => {
  await page.getByRole('tab', { name: /System Prompt/ }).click();
  await page.getByRole('textbox', { name: 'System prompt' }).fill('Answer in French.');
  await page.getByLabel('User message').fill('Say hi');
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  await expect(page.getByText('200 OK')).toBeVisible();
  expect(gateway.sent[0]?.body.messages).toEqual([
    { role: 'system', content: 'Answer in French.' },
    { role: 'user', content: 'Say hi' },
  ]);
});

test('switches provider, wire format and body shape together', async ({ page, gateway }) => {
  await page.getByRole('button', { name: /Provider preset/ }).click();
  await page.getByRole('option', { name: /Anthropic/ }).click();

  await expect(page.getByRole('button', { name: 'POST /v1/messages' })).toBeVisible();

  await page.getByLabel('User message').fill('Say hi');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('200 OK')).toBeVisible();

  expect(gateway.sent[0]?.url).toBe('https://api.anthropic.com/v1/messages');
  expect(gateway.sent[0]?.body).toMatchObject({
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Say hi' }],
  });
  // Anthropic authenticates with a named header, never a bearer token.
  expect(gateway.sent[0]?.headers['anthropic-version']).toBe('2023-06-01');
});

test('surfaces a provider error rather than swallowing it', async ({ page, gateway }) => {
  gateway.replyWith({ error: { message: 'Incorrect API key provided.' } }, 401);

  await page.getByLabel('User message').fill('Say hi');
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  await expect(page.getByText('401')).toBeVisible();
  await expect(page.locator('.assistant-msg__pane')).toContainText(
    'No assistant message in this response',
  );

  await page.getByRole('tab', { name: 'Response body' }).click();
  await expect(page.locator('.assistant-msg__pane')).toContainText('Incorrect API key provided.');
});

// A base URL that cannot be resolved used to reach `fetch`, which resolved a
// schemeless value against Wingman's own origin, sending the key elsewhere.
test('refuses to send an unusable base URL', async ({ page, gateway }) => {
  await page.getByLabel('Base URL').fill('   ');
  await page.getByLabel('User message').fill('Say hi');
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  await expect(page.getByText('Invalid base URL')).toBeVisible();
  expect(gateway.sent).toHaveLength(0);
});

// Pasting the full endpoint out of a provider's docs is the most common way to
// get a 404 out of a healthy gateway.
test('normalises a pasted endpoint and says what it changed', async ({ page, gateway }) => {
  await page.getByLabel('Base URL').fill('https://gw.example.com/v1/chat/completions');

  await expect(page.locator('.urlbar__hint')).toContainText('The format already appends it');

  await page.getByLabel('User message').fill('Say hi');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('200 OK')).toBeVisible();

  expect(gateway.sent[0]?.url).toBe('https://gw.example.com/v1/chat/completions');
});
