import { defineConfig } from 'drizzle-kit'

// drizzle-kit does not read .env files itself.
try {
  process.loadEnvFile('.env.local')
} catch {
  // no .env.local (CI passes DATABASE_URL directly)
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
})
