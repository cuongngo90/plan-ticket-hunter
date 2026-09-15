import { describe, expect, it } from 'vitest'
import type { CheapestDate } from '@/lib/providers/types'
import { baseIntervalHours, nextScanAt } from './cadence'
import { scoreDeal } from './deal-detector'
import { dedupeKey, priceBucket } from './dedupe'
import { bestForWatch, nearestWatchedDate } from './tick'

describe('cadence', () => {
  it.each([
    [2, 3],
    [10, 4],
    [30, 8],
    [45, 12],
    [100, 24],
    [200, 48],
  ])('%i days to departure → every %ih', (days, hours) => {
    expect(baseIntervalHours(days)).toBe(hours)
  })

  const now = new Date('2026-09-16T00:00:00Z')
  const hoursAfter = (d: Date) => (d.getTime() - now.getTime()) / 3_600_000

  it('adds ±10% jitter', () => {
    expect(hoursAfter(nextScanAt({ now, daysToDeparture: 45, failures: 0, random: 0 }))).toBeCloseTo(10.8)
    expect(hoursAfter(nextScanAt({ now, daysToDeparture: 45, failures: 0, random: 0.999999 }))).toBeCloseTo(13.2)
  })

  it('backs off 2ⁿ on failures, capped at 48h', () => {
    expect(hoursAfter(nextScanAt({ now, daysToDeparture: 10, failures: 2, random: 0.5 }))).toBeCloseTo(8)
    expect(hoursAfter(nextScanAt({ now, daysToDeparture: 100, failures: 5, random: 0.5 }))).toBeCloseTo(48)
  })
})

describe('scoreDeal (slice #0: ABSOLUTE only)', () => {
  it.each([
    [1_500_000, 1_500_000, 50],
    [1_350_000, 1_500_000, 60],
    [600_000, 1_500_000, 80],
    [1_600_000, 1_500_000, 0],
  ])('%i vs target %i → %i', (amountVnd, targetAmountVnd, score) => {
    expect(scoreDeal({ amountVnd, targetAmountVnd }).score).toBe(score)
  })

  it('no target → no absolute deal', () => {
    expect(scoreDeal({ amountVnd: 100_000, targetAmountVnd: null })).toEqual({ score: 0, rules: [] })
  })
})

describe('dedupeKey', () => {
  const base = { watchId: 'w1', episodeNo: 0, departDate: '2026-10-16', carrier: 'VJ', amountVnd: 1_180_000 }

  it('is stable for prices within the same ~2% bucket', () => {
    expect(priceBucket(1_180_000)).toBe(priceBucket(1_185_000))
    expect(dedupeKey(base)).toBe(dedupeKey({ ...base, amountVnd: 1_185_000 }))
  })

  it('changes with a new episode, date, carrier or a clearly different price', () => {
    const k = dedupeKey(base)
    expect(dedupeKey({ ...base, episodeNo: 1 })).not.toBe(k)
    expect(dedupeKey({ ...base, departDate: '2026-10-17' })).not.toBe(k)
    expect(dedupeKey({ ...base, carrier: 'VN' })).not.toBe(k)
    expect(dedupeKey({ ...base, amountVnd: 1_000_000 })).not.toBe(k)
  })
})

describe('tick helpers', () => {
  const p = (date: string, amountVnd: number): CheapestDate => ({
    date,
    amountVnd,
    carrier: 'VJ',
    stops: 0,
    foundAt: new Date(),
    deeplink: null,
  })
  const prices = [p('2026-10-09', 500_000), p('2026-10-12', 900_000), p('2026-10-15', 800_000), p('2026-10-21', 400_000)]

  it('bestForWatch only considers future dates inside the watch range', () => {
    const watch = { dateFrom: '2026-10-10', dateTo: '2026-10-20' }
    // 10-09 and 10-21 are cheaper but outside the range
    expect(bestForWatch(watch, prices, '2026-09-16')?.date).toBe('2026-10-15')
    // once 10-15 is today, nothing in range is left in the future
    expect(bestForWatch(watch, prices, '2026-10-15')).toBeUndefined()
  })

  it('nearestWatchedDate clips each watch to the month and to tomorrow', () => {
    const ws = [
      { dateFrom: '2026-09-20', dateTo: '2026-10-05' },
      { dateFrom: '2026-10-12', dateTo: '2026-10-20' },
    ]
    expect(nearestWatchedDate(ws, '2026-10', '2026-09-16')).toBe('2026-10-01')
    expect(nearestWatchedDate(ws, '2026-10', '2026-10-03')).toBe('2026-10-04')
    expect(nearestWatchedDate(ws, '2026-10', '2026-10-25')).toBeNull()
  })
})
