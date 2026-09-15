import type { Db } from '@/lib/db'
import { priceSnapshots } from '@/lib/db/schema'
import type { CheapestDate, FlightProvider } from '@/lib/providers/types'
import type { LeasedTask } from './scheduler'

export interface ScanResult {
  prices: CheapestDate[]
  inserted: number
}

/**
 * Fetch the month and record observations. `observation_key` = provider's foundAt, and the unique index
 * (scan_task_id, depart_date, observation_key) + ON CONFLICT DO NOTHING means re-reading the same cached
 * price — or retrying — never adds a fake sample (plan §3).
 */
export async function scanTask(db: Db, provider: FlightProvider, task: LeasedTask): Promise<ScanResult> {
  const month = task.departMonth.slice(0, 7)
  const prices = await provider.getCheapestByMonth({ origin: task.origin, dest: task.dest, month })
  if (prices.length === 0) return { prices, inserted: 0 }

  const inserted = await db
    .insert(priceSnapshots)
    .values(
      prices.map((p) => ({
        scanTaskId: task.id,
        origin: task.origin,
        dest: task.dest,
        departDate: p.date,
        amountVnd: p.amountVnd,
        carrier: p.carrier,
        stops: p.stops,
        deeplink: p.deeplink,
        sourceFoundAt: p.foundAt,
        observationKey: p.foundAt.toISOString(),
      })),
    )
    .onConflictDoNothing()
    .returning({ id: priceSnapshots.id })

  return { prices, inserted: inserted.length }
}
