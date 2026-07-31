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
    include: ['src/**/*.test.ts'],
  },
});
