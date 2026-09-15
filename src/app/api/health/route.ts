import { sql } from 'drizzle-orm'
import { connection } from 'next/server'
import { db } from '@/lib/db'

type Check = 'ok' | 'missing_config' | 'error'

export async function GET() {
  await connection() // always run at request time, never prerender

  let dbStatus: Check
  let latencyMs: number | undefined
  if (!process.env.DATABASE_URL) {
    dbStatus = 'missing_config'
  } else {
    const started = performance.now()
    try {
      await db().execute(sql`select 1`)
      dbStatus = 'ok'
      latencyMs = Math.round(performance.now() - started)
    } catch (err) {
      console.error('[health] db check failed', err)
      dbStatus = 'error'
    }
  }

  return Response.json(
    { db: dbStatus, dbLatencyMs: latencyMs, time: new Date().toISOString() },
    { status: dbStatus === 'ok' ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
