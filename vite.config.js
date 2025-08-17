import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.spec.js'] },
  resolve: { alias: { lib: fileURLToPath(new URL('./lib', import.meta.url)) } }
});
