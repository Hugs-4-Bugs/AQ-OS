import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/lib/**/*.ts', 'src/app/api/**/*.ts'],
      exclude: ['src/lib/types.ts', 'src/lib/db.ts', '**/*.d.ts'],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    // Global setup runs ONCE before all test workers start. It regenerates
    // the Prisma client from the develop schema so every worker loads a
    // client with the correct DMMF (including fields like profileMappings
    // that the main repo's schema lacks). Without this, the shared
    // node_modules @prisma/client may be stale from the main repo's
    // postinstall, causing 'Unknown argument' errors in tests.
    globalSetup: ['./tests/helpers/global-setup.ts'],
    // Disable module cache so each fork re-evaluates modules fresh.
    deps: {
      cacheDir: false,
    },
    // Externalize @prisma/client so vitest does NOT transform it.
    server: {
      deps: {
        external: [/^@prisma\/client/, /^\.prisma\/client/, /^@prisma\/engines/],
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
