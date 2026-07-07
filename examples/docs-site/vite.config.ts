import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@reflow/react/styles.css', replacement: resolve(__dirname, '../../packages/react/src/styles.css') },
      { find: '@reflow/react', replacement: resolve(__dirname, '../../packages/react/src/index.ts') },
      { find: '@reflow/core', replacement: resolve(__dirname, '../../packages/core/src/index.ts') },
    ],
  },
});
