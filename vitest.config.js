import { defineConfig } from 'vitest/config';

// Standalone test config so the app's React/PWA Vite plugins don't load during unit tests
// (the sync logic is plain JS). Keeps the test run fast and the output clean.
export default defineConfig({
  test: {
    include: ['src/**/*.test.js'],
    environment: 'node',
    // Provides an in-memory IndexedDB + localStorage so Dexie-backed sync code runs in Node.
    setupFiles: ['./vitest.setup.js'],
  },
});
