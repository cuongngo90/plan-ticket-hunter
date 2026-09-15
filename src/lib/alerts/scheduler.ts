import { sql } from 'drizzle-orm'
import type { Db } from '@/lib/db'

// Leasing scan tasks (plan §3, "Lease nguyên tử"). The lease MUST stay a single statement:
// SELECT … FOR UPDATE on its own would release the row lock before we mark it, and two ticks could
// pick the same task. lease_id makes completion safe: a worker whose lease expired cannot overwrite.

export interface LeasedTask {
  id: string
  origin: string
  dest: string
  departMonth: string // YYYY-MM-DD (first of month)
  leaseId: string
  consecutiveFailures: number
}

interface LeasedRow extends Record<string, unknown> {
  id: string
  origin: string
  dest: string
  depart_month: string
  lease_id: string
  consecutive_failures: number
}

export async function leaseDueTasks(db: Db, limit: number, leaseMinutes = 5): Promise<LeasedTask[]> {
  const rows = await db.execute<LeasedRow>(sql`
    update scan_tasks
    set leased_until = now() + make_interval(mins => ${leaseMinutes}), lease_id = gen_random_uuid()
    where id in (
      select id from scan_tasks
      where status = 'active' and next_scan_at <= now()
        and (leased_until is null or leased_until < now())
      order by next_scan_at asc
      limit ${limit}
      for update skip locked
    )
    returning id, origin, dest, depart_month::text as depart_month, lease_id, consecutive_failures`)
  return rows.map((r) => ({
    id: r.id,
    origin: r.origin,
    dest: r.dest,
    departMonth: r.depart_month,
    leaseId: r.lease_id,
    consecutiveFailures: r.consecutive_failures,
  }))
}

export type TaskOutcome =
  | { ok: true; nextScanAt: Date; status?: 'active' | 'idle' | 'done' }
  | { ok: false; nextScanAt: Date; error: string }

/** Release the lease. Returns false when the lease was lost (expired and taken by another worker). */
export async function completeTask(db: Db, task: LeasedTask, outcome: TaskOutcome): Promise<boolean> {
  const status = (outcome.ok && outcome.status) || 'active'
  const rows = await db.execute(sql`
    update scan_tasks set
      next_scan_at = ${outcome.nextScanAt.toISOString()},
      leased_until = null,
      lease_id = null,
      last_scanned_at = now(),
      status = ${status}::scan_task_status,
      consecutive_failures = ${outcome.ok ? sql`0` : sql`consecutive_failures + 1`},
      last_error = ${outcome.ok ? null : outcome.error.slice(0, 500)}
    where id = ${task.id} and lease_id = ${task.leaseId}
    returning id`)
  return rows.length === 1
}
