// Calendar-date helpers. Departure dates are plain "YYYY-MM-DD" strings (Postgres `date`), handled in UTC
// so no local timezone shifts them.

const DAY_MS = 86_400_000

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Today's calendar date in Vietnam (UTC+7, no DST). */
export function todayInVietnam(now: Date = new Date()): string {
  return toIsoDate(new Date(now.getTime() + 7 * 3_600_000))
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS)
}

export function addDays(iso: string, days: number): string {
  return toIsoDate(new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS))
}

/** "YYYY-MM" → every "YYYY-MM-DD" of that month. */
export function datesInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
}

/** Months ("YYYY-MM") touched by an inclusive date range. */
export function monthsInRange(fromIso: string, toIso: string): string[] {
  const out: string[] = []
  let [y, m] = fromIso.slice(0, 7).split('-').map(Number)
  const end = toIso.slice(0, 7)
  for (;;) {
    const month = `${y}-${String(m).padStart(2, '0')}`
    out.push(month)
    if (month >= end) return out
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
}
