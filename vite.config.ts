/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
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
