/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import solidPlugin from 'vite-plugin-solid';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** Static directories the app itself draws from. */
const PRECACHED_PUBLIC_DIRS = ['fonts', 'icons'];

/** Files in there the installer needs but the app never renders. `icons/pwa`
    is the launcher icon, and it has no business in the offline payload. */
const INSTALLER_ONLY = /^icons\/pwa\//;

function publicFiles(dir: string): string[] {
  return readdirSync(new URL(`./public/${dir}/`, import.meta.url), { recursive: true })
    .map((name) => `${dir}/${String(name).split(sep).join('/')}`)
    .filter((name) => /\.(woff2|svg|png)$/.test(name) && !INSTALLER_ONLY.test(name))
    .map((name) => `/${name}`);
}

/**
 * Emits `dist/sw.js` from `src/sw.js` with this build's assets baked in.
 *
 * The worker can't precache what it can't name, and half those names (every
 * JS and CSS file) change on every build. Without this, an offline launch
 * would find the HTML cached and the script that renders it missing, which is
 * a white page. Hashing the list into the cache name also means each deploy
 * starts from a clean cache and drops the one before it.
 */
function serviceWorker(): Plugin {
  return {
    name: 'wingman-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((n) => n.endsWith('.js') || n.endsWith('.css'));
      const assets = [
        ...built.map((name) => `/${name}`),
        ...PRECACHED_PUBLIC_DIRS.flatMap(publicFiles),
      ].sort();
      const buildId = `${version}-${createHash('sha256').update(assets.join()).digest('hex').slice(0, 8)}`;
      const source = readFileSync(new URL('./src/sw.js', import.meta.url), 'utf8')
        .replace("'__BUILD_ID__'", JSON.stringify(buildId))
        .replace("['__PRECACHE__']", JSON.stringify(assets));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [solidPlugin(), serviceWorker()],
  // Surfaced in the status bar, the way Bruno shows its build number.
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    port: Number(process.env.WINGMAN_PORT || 3002),
  },
  build: {
    target: 'esnext',
  },
  test: {
    // jsdom, not node: the code under test branches on `window.location`
    // (page protocol and origin drive the mixed-content / local-network
    // diagnosis), so it has to run against a document.
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // Solid has to come from the plugin-compiled client build, not the
    // pre-bundled server one, or components render to strings instead of DOM.
    server: { deps: { inline: [/solid-js/, /@solidjs\/testing-library/] } },
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/globals.d.ts',
        // Verbatim captures of two real CLIs' system prompts — string
        // constants with no logic to exercise.
        'src/templates/**',
        // Type-only modules: they compile to nothing, so the instrumenter
        // reports them as 0/0 and drags an otherwise-full report under target.
        'src/formats/types.ts',
        'src/runners/types.ts',
      ],
      // Every statement, line and function is covered, and those three are the
      // gate worth holding at 100. Branches sits lower on purpose: the
      // shortfall is the `typeof ref === "function"` test Solid's compiler
      // emits behind every `ref={...}`, the lazy getters it wraps component
      // props in, and defensive `?? fallback` arms guarding invariants the
      // callers already hold. No test can take both sides of those.
      thresholds: { lines: 100, functions: 100, branches: 97, statements: 100 },
    },
  },
});
