// The install offer. It has to stay invisible everywhere it can't deliver:
// a browser that never offers, an iOS tab, an already-installed window.
// A dead "Install" is worse than no button at all.
import { render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import InstallButton from './InstallButton.jsx';
import type { BeforeInstallPromptEvent } from '../services/pwa';

/** Chrome's offer, as the component receives it. */
function offer() {
  const event = new Event('beforeinstallprompt') as BeforeInstallPromptEvent;
  Object.assign(event, {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
  });
  return event as BeforeInstallPromptEvent & { prompt: ReturnType<typeof vi.fn> };
}

/** Answer `matchMedia` for the display modes an installed window reports. */
function runningAsApp(installed: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: installed && query.includes('standalone') })),
  );
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'standalone');
});

describe('InstallButton', () => {
  it('stays hidden until the browser offers an install', () => {
    runningAsApp(false);
    render(() => <InstallButton />);
    expect(screen.queryByText('Install')).toBeNull();
  });

  it('appears once the offer arrives', () => {
    runningAsApp(false);
    render(() => <InstallButton />);

    window.dispatchEvent(offer());

    expect(screen.getByText('Install')).toBeTruthy();
  });

  // Taking the event over is what suppresses Chrome's own mini-infobar.
  it('takes the offer over from the browser', () => {
    runningAsApp(false);
    render(() => <InstallButton />);
    const event = offer();
    const preventDefault = vi.spyOn(event, 'preventDefault');

    window.dispatchEvent(event);

    expect(preventDefault).toHaveBeenCalled();
  });

  it('prompts on click and spends the offer', async () => {
    runningAsApp(false);
    render(() => <InstallButton />);
    const event = offer();
    window.dispatchEvent(event);

    screen.getByText('Install').click();

    await vi.waitFor(() => expect(event.prompt).toHaveBeenCalledOnce());
    // Single-use: the button goes whether or not the user accepted, and Chrome
    // fires a fresh offer when it decides to ask again.
    expect(screen.queryByText('Install')).toBeNull();
  });

  it('goes away once the app is installed', () => {
    runningAsApp(false);
    render(() => <InstallButton />);
    window.dispatchEvent(offer());
    expect(screen.getByText('Install')).toBeTruthy();

    window.dispatchEvent(new Event('appinstalled'));

    expect(screen.queryByText('Install')).toBeNull();
  });

  // Offering to install the app you are already inside.
  it('stays hidden in an installed window', () => {
    runningAsApp(true);
    render(() => <InstallButton />);

    window.dispatchEvent(offer());

    expect(screen.queryByText('Install')).toBeNull();
  });

  it('stops listening once it unmounts', () => {
    runningAsApp(false);
    const remove = vi.spyOn(window, 'removeEventListener');

    render(() => <InstallButton />).unmount();

    expect(remove).toHaveBeenCalledWith('beforeinstallprompt', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('appinstalled', expect.any(Function));
  });
});
