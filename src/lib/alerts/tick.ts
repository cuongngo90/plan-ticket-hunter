import { and, eq } from 'drizzle-orm'
import { alertEvents, watchScanTasks, watches, type Watch } from '@/lib/db/schema'
import { dispatchDue, type DispatchDeps, type DispatchSummary } from '@/lib/notifications/dispatcher'
import type { CheapestDate, FlightProvider } from '@/lib/providers/types'
import { addDays, daysBetween, monthOf, todayInVietnam } from '@/lib/utils/date'
import { nextScanAt } from './cadence'
import { scoreDeal } from './deal-detector'
import { dedupeKey } from './dedupe'
import { scanTask } from './scanner'
import { completeTask, leaseDueTasks, type LeasedTask } from './scheduler'

// One cron tick (plan §1, BACKGROUND): lease due tasks → scan → detect deals → dispatch due alerts.

const DEFAULT_TICK_BUDGET = 20
/** Soft time budget, below Vercel's 300s maxDuration. */
const SOFT_DEADLINE_MS = 250_000

export interface TickDeps extends Omit<DispatchDeps, 'deeplink'> {
  provider: FlightProvider
  tickBudget?: number
}

export interface TickSummary {
  leased: number
  scanned: number
  failed: number
  lostLease: number
  snapshotsInserted: number
  alertsCreated: number
  dispatch: DispatchSummary
  errors: string[]
}

/** Cheapest price among the dates this watch cares about (future dates inside [dateFrom, dateTo]). */
export function bestForWatch(watch: Pick<Watch, 'dateFrom' | 'dateTo'>, prices: CheapestDate[], today: string) {
  let best: CheapestDate | undefined
  for (const p of prices) {
    if (p.date <= today || p.date < watch.dateFrom || p.date > watch.dateTo) continue
    if (!best || p.amountVnd < best.amountVnd) best = p
  }
  return best
}

/** Nearest future departure date inside any watch's range and this task's month; null when none is left. */
export function nearestWatchedDate(ws: Pick<Watch, 'dateFrom' | 'dateTo'>[], month: string, today: string): string | null {
  const monthStart = `${month}-01`
  const monthEnd = `${month}-31` // string comparison: any real date in the month is ≤ "-31"
  let nearest: string | null = null
  for (const w of ws) {
    const from = [w.dateFrom, monthStart, addDays(today, 1)].sort().at(-1)!
    const to = w.dateTo < monthEnd ? w.dateTo : monthEnd
    if (from <= to && (nearest === null || from < nearest)) nearest = from
  }
  return nearest
}

async function processTask(deps: TickDeps, task: LeasedTask, summary: TickSummary): Promise<void> {
  const { db, provider } = deps
  const now = deps.now()
  const today = todayInVietnam(now)
  const month = monthOf(task.departMonth)

  const linked = await db
    .select({ watch: watches })
    .from(watchScanTasks)
    .innerJoin(watches, eq(watches.id, watchScanTasks.watchId))
    .where(and(eq(watchScanTasks.scanTaskId, task.id), eq(watches.active, true)))
  const watchList = linked.map((l) => l.watch)

  if (watchList.length === 0) {
    // Nobody watches it now; linking a new watch re-activates it (lib/watches/create.ts).
    await completeTask(db, task, { ok: true, nextScanAt: now, status: 'idle' })
    return
  }
  const nearest = nearestWatchedDate(watchList, month, today)
  if (nearest === null) {
    // Every watched date in this month has passed.
    await completeTask(db, task, { ok: true, nextScanAt: now, status: 'done' })
    return
  }

  try {
    const { prices, inserted } = await scanTask(db, provider, task)
    summary.snapshotsInserted += inserted

    for (const w of watchList) {
      const best = bestForWatch(w, prices, today)
      if (!best) continue
      const { score, rules } = scoreDeal({ amountVnd: best.amountVnd, targetAmountVnd: w.targetAmountVnd })
      if (score < w.minDealScore) continue
      const created = await db
        .insert(alertEvents)
        .values({
          watchId: w.id,
          userId: w.userId,
          departDate: best.date,
          amountVnd: best.amountVnd,
          carrier: best.carrier,
          deeplink: best.deeplink,
          sourceFoundAt: best.foundAt,
          score,
          rules,
          dedupeKey: dedupeKey({
            watchId: w.id,
            episodeNo: w.episodeNo,
            departDate: best.date,
            carrier: best.carrier,
            amountVnd: best.amountVnd,
          }),
          scheduledFor: now,
        })
        .onConflictDoNothing()
        .returning({ id: alertEvents.id })
      summary.alertsCreated += created.length
    }

    const ok = await completeTask(db, task, {
      ok: true,
      nextScanAt: nextScanAt({ now, daysToDeparture: daysBetween(today, nearest), failures: 0 }),
    })
    if (ok) summary.scanned++
    else summary.lostLease++
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    summary.failed++
    summary.errors.push(`${task.origin}-${task.dest} ${month}: ${message}`)
    await completeTask(db, task, {
      ok: false,
      error: message,
      nextScanAt: nextScanAt({
        now,
        daysToDeparture: daysBetween(today, nearest),
        failures: task.consecutiveFailures + 1,
      }),
    })
  }
}

export async function runScanTick(deps: TickDeps): Promise<TickSummary> {
  const started = Date.now()
  const summary: TickSummary = {
    leased: 0,
    scanned: 0,
    failed: 0,
    lostLease: 0,
    snapshotsInserted: 0,
    alertsCreated: 0,
    dispatch: { claimed: 0, sent: 0, retrying: 0, givenUp: 0 },
    errors: [],
  }

  const tasks = await leaseDueTasks(deps.db, deps.tickBudget ?? DEFAULT_TICK_BUDGET)
  summary.leased = tasks.length
  for (const task of tasks) {
    // Unprocessed tasks keep their lease until it expires, then get picked up by a later tick.
    if (Date.now() - started > SOFT_DEADLINE_MS) break
    await processTask(deps, task, summary)
  }

  summary.dispatch = await dispatchDue({
    ...deps,
    deeplink: (p) => deps.provider.buildDeeplink(p),
  })
  return summary
}
