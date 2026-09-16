import { describe, expect, it } from 'vitest'
import { daysBetween } from '@/lib/utils/date'
import { SEED_ROUTES, SEED_USERS, observationDays, patternFactor, seedSnapshots, seedWatches } from './dev-seed'

const today = '2026-09-16'

describe('dev seed fixtures', () => {
  it('gives sparse routes too few samples for the relative rules', () => {
    expect(observationDays('sparse')).toHaveLength(3)
    expect(observationDays('flat').length).toBeGreaterThanOrEqual(8)
  })

  it('declining drops ~25% and crash only on the last observation', () => {
    expect(patternFactor('declining', 90)).toBeCloseTo(1)
    expect(patternFactor('declining', 0)).toBeCloseTo(0.75)
    expect(patternFactor('crash', 3)).toBe(1)
    expect(patternFactor('crash', 0)).toBe(0.6)
    expect(patternFactor('tet', 0)).toBeGreaterThan(2)
  })

  it('is deterministic and covers ~90 days of history', () => {
    const route = SEED_ROUTES[0]
    const a = seedSnapshots(route, today)
    expect(seedSnapshots(route, today)).toEqual(a)
    expect(Math.max(...a.map((s) => s.observedDaysAgo))).toBe(90)
    expect(a.every((s) => s.amountVnd % 1000 === 0)).toBe(true)
    expect(new Set(a.map((s) => s.departDate)).size).toBe(4)
  })

  it('puts the imminent route a couple of days out and the rest further away', () => {
    const imminent = SEED_ROUTES.find((r) => r.pattern === 'imminent')!
    const soonest = seedSnapshots(imminent, today).reduce((a, b) => (a.departDate < b.departDate ? a : b))
    expect(daysBetween(today, soonest.departDate)).toBe(2)
  })

  it('creates 12 watches, one with pax 3 and several spanning a month boundary', () => {
    const ws = seedWatches(today)
    expect(ws).toHaveLength(12)
    expect(ws.some((w) => w.pax === 3)).toBe(true)
    expect(ws.some((w) => daysBetween(w.dateFrom, w.dateTo) === 30)).toBe(true)
    expect(ws.some((w) => w.targetAmountVnd === null)).toBe(true)
    expect(ws.every((w) => w.userIndex < SEED_USERS.length)).toBe(true)
  })
})
