import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true,
    // The tests run against the library as \`design-book\` ships it: with the
    // built-in renderers registered. tests/engine-entry.test.ts checks the
    // engine on its own.
    setupFiles: ['tests/setup.ts'],
  },
});
