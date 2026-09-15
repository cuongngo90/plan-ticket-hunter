import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '@/lib/env'
import * as schema from './schema'

// One driver everywhere (local Docker Postgres, CI, Neon): postgres-js over TCP.
// On Neon use the pooled connection string (host contains "-pooler").
// `prepare: false` because the pooler runs PgBouncer in transaction mode.

export type Db = PostgresJsDatabase<typeof schema>

const globalForDb = globalThis as unknown as { sanVeSql?: postgres.Sql }

function client(): postgres.Sql {
  // Reuse across hot reloads in dev and across invocations of a warm serverless instance.
  globalForDb.sanVeSql ??= postgres(env().DATABASE_URL, {
    prepare: false,
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
  })
  return globalForDb.sanVeSql
}

let cached: Db | undefined

export function db(): Db {
  cached ??= drizzle(client(), { schema })
  return cached
}

/** For scripts: close the pool so the process can exit. */
export async function closeDb(): Promise<void> {
  await globalForDb.sanVeSql?.end({ timeout: 5 })
  globalForDb.sanVeSql = undefined
  cached = undefined
}
