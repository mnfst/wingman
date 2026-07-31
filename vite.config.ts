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
      // Branches stops short of 100 on purpose. The shortfall is entirely in
      // the code Solid's JSX compiler emits — the `typeof ref === "function"`
      // test behind every `ref={...}`, and the lazy prop getters it wraps
      // component props in. No test can take both sides of those.
      thresholds: { lines: 100, functions: 100, branches: 98, statements: 100 },
    },
  },
});
