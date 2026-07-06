import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@reflow/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@reflow/react': resolve(__dirname, 'packages/react/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
