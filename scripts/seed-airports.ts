// Upsert the airport list. Safe to re-run.
//   npm run db:seed:airports

import { sql } from 'drizzle-orm'
import { closeDb, db } from '@/lib/db'
import { airportRows } from '@/lib/db/data/airports'
import { airports } from '@/lib/db/schema'

async function main() {
  const rows = airportRows()
  await db()
    .insert(airports)
    .values(rows)
    .onConflictDoUpdate({
      target: airports.iata,
      set: {
        name: sql`excluded.name`,
        city: sql`excluded.city`,
        cityVi: sql`excluded.city_vi`,
        countryCode: sql`excluded.country_code`,
        timezone: sql`excluded.timezone`,
        searchText: sql`excluded.search_text`,
      },
    })
  const [{ count }] = await db().select({ count: sql<number>`count(*)::int` }).from(airports)
  console.log(`✔ Upsert ${rows.length} sân bay — bảng airports hiện có ${count} dòng`)
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(closeDb)
