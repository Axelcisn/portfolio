// vitest.config.mjs
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,          // provide describe/test/expect as globals
    environment: 'node',    // run in Node env (good for API/unit tests)
    include: ['tests/**/*.spec.js'],
    // you can add a setup file later if needed:
    // setupFiles: ['tests/setup.ts'],
  },
});