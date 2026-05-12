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
});
