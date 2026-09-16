import { sql } from 'drizzle-orm'
import type { Db } from '@/lib/db'
import { airports, type Airport } from '@/lib/db/schema'
import { normalizeSearch } from '@/lib/utils/text'

/**
 * Autocomplete over `search_text` (accent-free, trigram indexed). An exact IATA match wins,
 * then trigram similarity. `%` uses pg_trgm's similarity threshold; LIKE catches short prefixes
 * that are below it ("ha" → "Hà Nội").
 */
export async function searchAirports(db: Db, query: string, limit = 8): Promise<Airport[]> {
  const term = normalizeSearch(query)
  if (term.length === 0) return db.select().from(airports).orderBy(airports.iata).limit(limit)

  return db
    .select()
    .from(airports)
    .where(sql`${airports.searchText} % ${term} or ${airports.searchText} like ${`%${term}%`}`)
    .orderBy(sql`(${airports.iata} = upper(${term})) desc, similarity(${airports.searchText}, ${term}) desc, ${airports.iata}`)
    .limit(limit)
}
