// The entry point. Small, but it is the one file whose failure is a blank page.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const inject = vi.fn();
const render = vi.fn();

vi.mock('@vercel/analytics', () => ({ inject }));
// The bootstrap's job is to find the root and hand it a component; which
// component is App's business, covered in App.test.tsx. Stubbing it also keeps
// the module reset below from loading a second copy of the whole app.
vi.mock('./App.jsx', () => ({ default: () => null }));
vi.mock('solid-js/web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('solid-js/web')>()),
  render,
}));

beforeEach(() => {
  vi.resetModules();
  inject.mockClear();
  render.mockClear();
});

afterEach(() => {
  document.getElementById('root')?.remove();
});

function mountRoot() {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  return root;
}

describe('bootstrap', () => {
  it('renders the app into the root element', async () => {
    const root = mountRoot();

    await import('./index.jsx');

    expect(render).toHaveBeenCalledOnce();
    expect(render.mock.calls[0]?.[1]).toBe(root);
  });

  // A silent no-render is indistinguishable from a broken build; throwing at
  // least says which of the two it is.
  it('throws rather than rendering nowhere', async () => {
    await expect(import('./index.jsx')).rejects.toThrow('Root element not found');
  });

  it('reports analytics as development outside a production build', async () => {
    mountRoot();

    await import('./index.jsx');

    expect(inject).toHaveBeenCalledWith({ mode: 'development' });
  });

  it('reports analytics as production in a production build', async () => {
    mountRoot();
    vi.stubEnv('PROD', true);

    await import('./index.jsx');

    expect(inject).toHaveBeenCalledWith({ mode: 'production' });
  });
});
