import { and, desc, eq, sql } from 'drizzle-orm'
import type { Db } from '@/lib/db'
import { alertEvents, watches, type AlertEvent, type Watch } from '@/lib/db/schema'

/** Minimum real observations before the relative deal rules switch on (plan §5). */
export const MIN_SAMPLES_FOR_RELATIVE_RULES = 8

export interface WatchWithPrice extends Watch {
  /** Cheapest price seen for this watch's route inside its date range, or null while collecting. */
  bestAmountVnd: number | null
  bestDepartDate: string | null
  observedAt: Date | null
  /** Real observations so far — the UI shows "đang thu thập (x/8)" below the threshold. */
  sampleCount: number
}

interface WatchRow extends Record<string, unknown> {
  best_amount_vnd: string | number | null
  best_depart_date: string | null
  observed_at: string | Date | null
  sample_count: number
}

/** Watches of one user, each with the best price currently known for its range. */
export async function listWatchesForUser(db: Db, userId: string): Promise<WatchWithPrice[]> {
  const rows = await db.execute<WatchRow & Record<string, unknown>>(sql`
    select w.*,
           b.amount_vnd as best_amount_vnd,
           b.depart_date::text as best_depart_date,
           b.observed_at,
           coalesce(s.sample_count, 0)::int as sample_count
    from watches w
    left join lateral (
      select p.amount_vnd, p.depart_date, p.observed_at
      from price_snapshots p
      where p.origin = w.origin and p.dest = w.dest
        and p.depart_date between w.date_from and w.date_to
      order by p.amount_vnd asc, p.observed_at desc
      limit 1
    ) b on true
    left join lateral (
      select count(*) as sample_count
      from price_snapshots p
      where p.origin = w.origin and p.dest = w.dest
        and p.depart_date between w.date_from and w.date_to
    ) s on true
    where w.user_id = ${userId}
    order by w.created_at desc`)

  return rows.map((r) => ({
    ...(r as unknown as Watch),
    bestAmountVnd: r.best_amount_vnd === null ? null : Number(r.best_amount_vnd),
    bestDepartDate: r.best_depart_date,
    observedAt: r.observed_at ? new Date(r.observed_at) : null,
    sampleCount: r.sample_count,
  }))
}

export async function listAlertsForUser(db: Db, userId: string, limit = 50): Promise<AlertEvent[]> {
  return db
    .select()
    .from(alertEvents)
    .where(eq(alertEvents.userId, userId))
    .orderBy(desc(alertEvents.createdAt))
    .limit(limit)
}

export async function countActiveWatches(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(watches)
    .where(and(eq(watches.userId, userId), eq(watches.active, true)))
  return row.n
}
