import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Integration tests: need a migrated Postgres in TEST_DATABASE_URL (skipped otherwise).
// Vitest does not read .env files; CI passes TEST_DATABASE_URL directly.
try {
  process.loadEnvFile('.env.local')
} catch {
  // no .env.local
}

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.int.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
})
