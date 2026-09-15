import type { CheapestByMonthParams, CheapestDate, DeeplinkParams, FlightProvider } from '../types'
import { datesInMonth, daysBetween, todayInVietnam } from '@/lib/utils/date'
import { mockPrice } from './generator'

export interface MockProviderOptions {
  /** Routes like "SGN-HAN" that always return one very cheap date (MOCK_FORCE_DEAL). */
  forceDealRoutes?: string[]
  /** Injectable clock for tests. */
  now?: () => Date
}

/**
 * Prices change once per hour: `foundAt` is the start of the current hour, so scanning twice
 * within an hour returns the same observation (exactly like a cache provider).
 */
export class MockProvider implements FlightProvider {
  readonly id = 'mock' as const
  readonly capabilities = { supportsLcc: true, realtime: false, monthlyQuota: null }
  private readonly forceDeal: Set<string>
  private readonly now: () => Date

  constructor(opts: MockProviderOptions = {}) {
    this.forceDeal = new Set((opts.forceDealRoutes ?? []).map((r) => r.toUpperCase()))
    this.now = opts.now ?? (() => new Date())
  }

  async getCheapestByMonth({ origin, dest, month }: CheapestByMonthParams): Promise<CheapestDate[]> {
    const now = this.now()
    const today = todayInVietnam(now)
    const foundAt = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000)
    const window = foundAt.toISOString()
    const future = datesInMonth(month).filter((d) => d > today)
    // The forced deal lands on the middle future date, so it is inside most test watches.
    const dealDate = this.forceDeal.has(`${origin}-${dest}`) ? future[Math.floor(future.length / 2)] : undefined

    return future.map((date) => {
      const { amountVnd, carrier } = mockPrice({
        origin,
        dest,
        date,
        daysToDeparture: daysBetween(today, date),
        window,
        forceDeal: date === dealDate,
      })
      return { date, amountVnd, carrier, stops: 0, foundAt, deeplink: null }
    })
  }

  buildDeeplink({ origin, dest, date, pax }: DeeplinkParams): string {
    const ddmm = `${date.slice(8, 10)}${date.slice(5, 7)}`
    return `https://www.aviasales.com/search/${origin}${ddmm}${dest}${pax}`
  }
}
