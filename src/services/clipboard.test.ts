import { describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

/** Replace navigator.clipboard for one test (it is a read-only accessor). */
function stubClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
}

describe('copyText', () => {
  it('uses the modern clipboard API when it is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });

    expect(await copyText('report')).toEqual({ ok: true });
    expect(writeText).toHaveBeenCalledWith('report');
  });

  // The Manifest dashboard embeds Wingman in an iframe, and the embedder's
  // permissions policy commonly blocks the async clipboard API there.
  it('falls back to execCommand when the clipboard API is blocked', async () => {
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });

    expect(await copyText('report')).toEqual({ ok: true });
    expect(execCommand).toHaveBeenCalledWith('copy');
    // The scratch textarea must not be left behind in the document.
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('falls back when the clipboard API is missing entirely', async () => {
    stubClipboard(undefined);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    });

    expect(await copyText('report')).toEqual({ ok: true });
  });

  it('reports a refusal when the legacy path is denied too', async () => {
    stubClipboard(undefined);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    });

    expect(await copyText('report')).toEqual({
      ok: false,
      reason: 'Browser denied the copy command.',
    });
  });

  it('reports the reason when the legacy path throws', async () => {
    stubClipboard(undefined);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: () => {
        throw new Error('execCommand is not supported');
      },
    });

    expect(await copyText('report')).toEqual({
      ok: false,
      reason: 'execCommand is not supported',
    });
  });

  it('reports a generic reason when the failure is not an Error', async () => {
    stubClipboard(undefined);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: () => {
        throw 'nope';
      },
    });

    expect(await copyText('report')).toEqual({
      ok: false,
      reason: 'Unknown clipboard failure',
    });
  });
});
