// How often a scan task is re-scanned (plan §5, "Cadence"). Pure.

const HOUR_MS = 3_600_000
const MAX_BACKOFF_HOURS = 48

/** ≤3 days → 3h · ≤14 → 4h · ≤30 → 8h · ≤60 → 12h · ≤120 → 24h · otherwise 48h. */
export function baseIntervalHours(daysToDeparture: number): number {
  if (daysToDeparture <= 3) return 3
  if (daysToDeparture <= 14) return 4
  if (daysToDeparture <= 30) return 8
  if (daysToDeparture <= 60) return 12
  if (daysToDeparture <= 120) return 24
  return 48
}

export interface NextScanInput {
  now: Date
  /** Days until the nearest future departure date any watch on the task cares about. */
  daysToDeparture: number
  /** Consecutive failures including this one (0 after a success). */
  failures: number
  /** [0, 1) — injectable for tests; spreads tasks by ±10% so they do not all fall due together. */
  random?: number
}

export function nextScanAt({ now, daysToDeparture, failures, random = Math.random() }: NextScanInput): Date {
  // Every consecutive failure doubles the wait (plan §5), capped so a broken task still retries daily-ish.
  const hours = Math.min(MAX_BACKOFF_HOURS, baseIntervalHours(daysToDeparture) * 2 ** failures)
  const jitter = 0.9 + 0.2 * random
  return new Date(now.getTime() + hours * jitter * HOUR_MS)
}
