/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  plugins: [solidPlugin()],
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
