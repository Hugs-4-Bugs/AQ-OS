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
    // Disable module cache so each fork re-evaluates modules fresh.
    // This prevents stale PrismaClient DMMF from being shared across
    // workers when the shared node_modules is regenerated from a
    // different schema.
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
