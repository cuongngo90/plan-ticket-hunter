// Read-only sanity check of the database after migrate + seed.
//   npx tsx --env-file=.env.local scripts/check-db.ts

import { sql } from 'drizzle-orm'
import { closeDb, db } from '@/lib/db'
import { normalizeSearch } from '@/lib/utils/text'

async function main() {
  const d = db()
  const [version] = await d.execute<{ server_version: string }>(sql`show server_version`)
  const ext = await d.execute<{ extname: string }>(sql`select extname from pg_extension where extname = 'pg_trgm'`)
  const tables = await d.execute<{ table_name: string }>(
    sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`,
  )
  console.log(`Postgres ${version.server_version} · pg_trgm: ${ext.length ? 'có' : 'KHÔNG'}`)
  console.log(`Bảng: ${tables.map((t) => t.table_name).join(', ')}`)

  for (const q of ['Đà Nẵng', 'sai gon', 'phu quoc', 'han', 'bangkok']) {
    const term = normalizeSearch(q)
    const rows = await d.execute<{ iata: string; city: string; score: number }>(sql`
      select iata, city, round(similarity(search_text, ${term})::numeric, 2)::float as score
      from airports
      where search_text % ${term} or search_text like ${'%' + term + '%'}
      order by (iata = upper(${term})) desc, similarity(search_text, ${term}) desc
      limit 3`)
    console.log(`  "${q}" → ${rows.map((r) => `${r.iata} (${r.city})`).join(', ') || 'không có'}`)
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(closeDb)
