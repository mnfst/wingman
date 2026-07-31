// The workspace around the request: tabs, streaming, the code panel, the
// shell's meta affordances, and the promise that nothing outlives the tab.
import { expect, test } from './fixtures';

test('turns each sent request into a tab you can come back to', async ({ page }) => {
  await page.getByLabel('User message').fill('first question');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('200 OK')).toBeVisible();

  await page.getByLabel('New request').click();
  await expect(page.getByLabel('User message')).toHaveValue('');

  await page.getByLabel('User message').fill('second question');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('tab', { name: /second question/ })).toBeVisible();

  // Sent requests run oldest → newest, like browser tabs.
  const labels = await page.locator('.reqtab__label').allTextContents();
  expect(labels).toEqual(['first question', 'second question']);

  await page.getByRole('tab', { name: /first question/ }).click();
  await expect(page.getByLabel('User message')).toHaveValue('first question');
  await expect(page.getByText('Hello from the gateway.')).toBeVisible();
});

test('keeps each draft tab on its own message and endpoint', async ({ page }) => {
  await page.getByLabel('User message').fill('draft one');
  await page.getByLabel('Base URL').fill('https://one.example.com');

  await page.getByLabel('New request').click();
  await page.getByLabel('User message').fill('draft two');
  await page.getByLabel('Base URL').fill('https://two.example.com');

  await page.getByRole('tab', { name: 'draft one' }).click();

  await expect(page.getByLabel('User message')).toHaveValue('draft one');
  await expect(page.getByLabel('Base URL')).toHaveValue('https://one.example.com');
});

test('deletes a sent request from the strip', async ({ page }) => {
  await page.getByLabel('User message').fill('delete me');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('200 OK')).toBeVisible();

  await page.getByLabel('Close and delete this request').click();

  await expect(page.getByRole('tab', { name: /delete me/ })).toHaveCount(0);
});

test('renders a streamed response token by token', async ({ page }) => {
  await page.route('**/v1/chat/completions', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'access-control-allow-origin': '*' },
      body:
        'data: {"model":"gpt-4o","choices":[{"delta":{"content":"Streamed "}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":"reply"}}]}\n\n' +
        'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n' +
        'data: [DONE]\n\n',
    }),
  );

  await page.getByRole('switch', { name: 'Stream responses' }).click();
  await page.getByLabel('User message').fill('Say hi');
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  await expect(page.getByText('Streamed reply')).toBeVisible();
  await expect(page.getByText('5 tok')).toBeVisible();

  // The raw SSE is what a streamed response has instead of one JSON body.
  await page.getByRole('tab', { name: 'Response body' }).click();
  await expect(page.locator('.assistant-msg__pane')).toContainText('data: {"model":"gpt-4o"');
});

test('shows the request as code, and runs an edited snippet', async ({ page, gateway }) => {
  await page.getByLabel('Show this request as code').click();
  await expect(page.locator('.code-view__textarea')).toHaveValue(/curl -sS -X POST/);

  await page.getByRole('button', { name: /Default/ }).click();
  await page.getByRole('option', { name: /OpenAI SDK/ }).click();
  await expect(page.getByText('runnable')).toBeVisible();

  await page
    .locator('.code-view__textarea')
    .fill(
      'await new OpenAI({ baseURL: "https://snippet.example.com/v1" }).chat.completions.create({ model: "from-code", messages: [] });',
    );

  await page.getByLabel('User message').fill('Say hi');
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  await expect(page.getByText('200 OK')).toBeVisible();
  expect(gateway.sent[0]?.url).toBe('https://snippet.example.com/v1/chat/completions');
  expect(gateway.sent[0]?.body.model).toBe('from-code');
});

test('hides the wire panes when Dev Tools is switched off', async ({ page }) => {
  await page.getByLabel('User message').fill('Say hi');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Response body' })).toBeVisible();

  await page.getByRole('button', { name: 'Dev Tools' }).click();

  await expect(page.getByRole('tab', { name: 'Response body' })).toHaveCount(0);
  await expect(page.getByText('Hello from the gateway.')).toBeVisible();
});

test('opens the About dialog and closes it with Escape', async ({ page }) => {
  await page.getByRole('button', { name: 'About' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Postman for LLM APIs');

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('offers the request as a redacted report', async ({ page }) => {
  await page.getByRole('textbox', { name: 'API key' }).fill('mnfst_live_secret_value');
  await page.getByLabel('User message').fill('Say hi');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('200 OK')).toBeVisible();

  await page.getByRole('button', { name: 'Save' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Manifest Wingman');
  await expect(dialog).not.toContainText('mnfst_live_secret_value');
});

// The About modal promises nothing survives a closed tab. sessionStorage is
// exactly that lifetime; a reload is the closest a test can get to proving the
// weaker half — that a reload does keep the session.
test('keeps the session across a reload but writes nothing to disk', async ({ page }) => {
  await page.getByRole('textbox', { name: 'API key' }).fill('mnfst_e2e_key');
  await page.getByLabel('User message').fill('Say hi');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('200 OK')).toBeVisible();

  expect(await page.evaluate(() => localStorage.length)).toBe(0);

  await page.reload();

  await expect(page.getByRole('textbox', { name: 'API key' })).toHaveValue('mnfst_e2e_key');
  await expect(page.getByRole('tab', { name: /Say hi/ })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test('answers the global shortcuts', async ({ page, gateway }) => {
  await page.getByLabel('User message').fill('Say hi');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.getByText('200 OK')).toBeVisible();
  expect(gateway.sent).toHaveLength(1);

  await page.keyboard.press('ControlOrMeta+Shift+O');
  await expect(page.getByLabel('User message')).toHaveValue('');
});
