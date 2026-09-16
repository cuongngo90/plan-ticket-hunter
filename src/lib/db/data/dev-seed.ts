// Deterministic fixtures for `npm run db:seed:dev` (plan §11.8): price histories that exercise every
// deal rule, plus the users and watches that watch them. Pure — the script does the writing.

import { hash01 } from '@/lib/providers/mock/generator'
import { addDays, daysBetween } from '@/lib/utils/date'

export type PricePattern =
  | 'flat' // no deal
  | 'declining' // −25% over the window: RELATIVE_MEDIAN territory
  | 'crash' // −40% on the last day: strong deal
  | 'sparse' // only 3 observations: relative rules must stay off (sample_count < 8)
  | 'tet' // seasonal spike
  | 'imminent' // departure within days: short cadence

export interface SeedRoute {
  origin: string
  dest: string
  pattern: PricePattern
  baseVnd: number
}

export const SEED_ROUTES: SeedRoute[] = [
  { origin: 'SGN', dest: 'HAN', pattern: 'declining', baseVnd: 1_400_000 },
  { origin: 'SGN', dest: 'DAD', pattern: 'crash', baseVnd: 1_000_000 },
  { origin: 'HAN', dest: 'PQC', pattern: 'flat', baseVnd: 1_600_000 },
  { origin: 'HAN', dest: 'DAD', pattern: 'sparse', baseVnd: 1_000_000 },
  { origin: 'SGN', dest: 'CXR', pattern: 'tet', baseVnd: 1_200_000 },
  { origin: 'SGN', dest: 'HUI', pattern: 'imminent', baseVnd: 1_100_000 },
]

export interface SeedSnapshot {
  departDate: string
  amountVnd: number
  carrier: string
  /** Days before "today" the price was observed; also the observation key. */
  observedDaysAgo: number
}

const CARRIERS = ['VJ', 'VN', 'VU', 'QH']
const HISTORY_DAYS = 90

/** Multiplier applied to the base price for an observation made `daysAgo` days ago. */
export function patternFactor(pattern: PricePattern, daysAgo: number): number {
  const progress = (HISTORY_DAYS - daysAgo) / HISTORY_DAYS // 0 = oldest, 1 = today
  switch (pattern) {
    case 'flat':
      return 1
    case 'declining':
      return 1 - 0.25 * progress
    case 'crash':
      return daysAgo === 0 ? 0.6 : 1
    case 'sparse':
      return 1
    case 'tet':
      return 1 + 1.2 * progress
    case 'imminent':
      return 1 + 0.8 * progress
  }
}

/** Observation days (days ago) for a pattern: sparse gets 3, the rest get one every 3 days. */
export function observationDays(pattern: PricePattern): number[] {
  if (pattern === 'sparse') return [12, 6, 0]
  const days: number[] = []
  for (let d = HISTORY_DAYS; d >= 0; d -= 3) days.push(d)
  return days
}

/** 90 days of history for one route, for departure dates inside the given month window. */
export function seedSnapshots(route: SeedRoute, today: string): SeedSnapshot[] {
  const departFrom = route.pattern === 'imminent' ? addDays(today, 2) : addDays(today, 25)
  const departDates = [0, 3, 6, 9].map((d) => addDays(departFrom, d))
  const out: SeedSnapshot[] = []
  for (const departDate of departDates) {
    const urgency = 1 + 0.5 * Math.max(0, (30 - daysBetween(today, departDate)) / 30)
    for (const observedDaysAgo of observationDays(route.pattern)) {
      const noise = 0.95 + 0.1 * hash01(`${route.origin}${route.dest}|${departDate}|${observedDaysAgo}`)
      const amount = route.baseVnd * patternFactor(route.pattern, observedDaysAgo) * urgency * noise
      out.push({
        departDate,
        amountVnd: Math.round(amount / 1000) * 1000,
        carrier: CARRIERS[Math.floor(hash01(`c|${route.origin}${route.dest}|${departDate}`) * CARRIERS.length)],
        observedDaysAgo,
      })
    }
  }
  return out
}

export interface SeedUser {
  email: string
  label: string
  channels: 'telegram' | 'push' | 'both'
}

export const SEED_USERS: SeedUser[] = [
  { email: 'dev-telegram@sanve.local', label: 'chỉ Telegram', channels: 'telegram' },
  { email: 'dev-push@sanve.local', label: 'chỉ Web Push', channels: 'push' },
  { email: 'dev-both@sanve.local', label: 'cả hai kênh', channels: 'both' },
]

export interface SeedWatch {
  userIndex: number
  origin: string
  dest: string
  dateFrom: string
  dateTo: string
  pax: number
  targetAmountVnd: number | null
}

/** 12 watches spread over the seed routes, including one spanning two months and one with pax = 3. */
export function seedWatches(today: string): SeedWatch[] {
  return SEED_ROUTES.flatMap((route, i) => {
    const near = route.pattern === 'imminent' ? addDays(today, 1) : addDays(today, 24)
    const far = addDays(near, 12)
    return [
      {
        userIndex: i % SEED_USERS.length,
        origin: route.origin,
        dest: route.dest,
        dateFrom: near,
        dateTo: far,
        pax: route.pattern === 'tet' ? 3 : 1,
        targetAmountVnd: Math.round((route.baseVnd * 0.8) / 1000) * 1000,
      },
      {
        userIndex: (i + 1) % SEED_USERS.length,
        origin: route.dest,
        dest: route.origin,
        // deliberately long: crosses a month boundary for most of the year
        dateFrom: addDays(today, 20),
        dateTo: addDays(today, 50),
        pax: 1,
        targetAmountVnd: i === 0 ? null : Math.round((route.baseVnd * 0.9) / 1000) * 1000,
      },
    ]
  })
}
