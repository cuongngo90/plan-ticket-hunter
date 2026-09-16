import { describe, expect, it } from 'vitest'
import { hash01, mockPrice, seasonFactor, urgencyFactor } from './generator'
import { MockProvider } from './index'

describe('mock generator', () => {
  const base = { origin: 'SGN', dest: 'HAN', date: '2026-10-15', daysToDeparture: 29, observationWindow: 'w1' }

  it('is deterministic for the same input', () => {
    expect(mockPrice(base)).toEqual(mockPrice(base))
    expect(hash01('x')).toBe(hash01('x'))
  })

  it('changes price when the observation window changes', () => {
    const prices = new Set(
      ['w1', 'w2', 'w3', 'w4'].map((observationWindow) => mockPrice({ ...base, observationWindow }).amountVnd),
    )
    expect(prices.size).toBeGreaterThan(1)
  })

  it('rounds fares to thousands', () => {
    expect(mockPrice(base).amountVnd % 1000).toBe(0)
  })

  it('applies season and urgency factors', () => {
    expect(seasonFactor('2027-02-05')).toBe(2.2)
    expect(seasonFactor('2026-07-10')).toBe(1.4)
    expect(seasonFactor('2026-10-10')).toBe(1)
    expect(urgencyFactor(2)).toBe(1.8)
    expect(urgencyFactor(45)).toBe(1)
    expect(urgencyFactor(16)).toBeGreaterThan(1)
  })

  it('forced deal is far below the normal price', () => {
    expect(mockPrice({ ...base, forceDeal: true }).amountVnd).toBeLessThan(mockPrice(base).amountVnd * 0.5)
  })
})

describe('MockProvider', () => {
  const now = () => new Date('2026-09-16T03:25:00Z') // 10:25 in Vietnam

  it('returns only future dates of the month, one per date', async () => {
    const p = new MockProvider({ now })
    const sep = await p.getCheapestByMonth({ origin: 'SGN', dest: 'HAN', month: '2026-09' })
    expect(sep[0].date).toBe('2026-09-17')
    expect(sep.at(-1)?.date).toBe('2026-09-30')
    const oct = await p.getCheapestByMonth({ origin: 'SGN', dest: 'HAN', month: '2026-10' })
    expect(oct).toHaveLength(31)
  })

  it('uses the start of the hour as foundAt, so rescans within an hour are the same observation', async () => {
    const p = new MockProvider({ now })
    const [a] = await p.getCheapestByMonth({ origin: 'SGN', dest: 'HAN', month: '2026-10' })
    expect(a.foundAt.toISOString()).toBe('2026-09-16T03:00:00.000Z')
  })

  it('MOCK_FORCE_DEAL makes one date much cheaper', async () => {
    const normal = await new MockProvider({ now }).getCheapestByMonth({ origin: 'SGN', dest: 'HAN', month: '2026-10' })
    const forced = await new MockProvider({ now, forceDealRoutes: ['sgn-han'] }).getCheapestByMonth({
      origin: 'SGN',
      dest: 'HAN',
      month: '2026-10',
    })
    const cheaper = forced.filter((f, i) => f.amountVnd < normal[i].amountVnd)
    expect(cheaper).toHaveLength(1)
    expect(cheaper[0].date).toBe('2026-10-16')
  })

  it('builds an Aviasales deeplink with ddmm and pax', () => {
    expect(new MockProvider().buildDeeplink({ origin: 'SGN', dest: 'HAN', date: '2026-10-10', pax: 2 })).toBe(
      'https://www.aviasales.com/search/SGN1010HAN2',
    )
  })
})
