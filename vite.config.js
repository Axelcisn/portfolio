import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { lib: path.resolve(__dirname, 'lib') } },
  test: { environment: 'node', include: ['tests/**/*.spec.js'], globals: true }
});
