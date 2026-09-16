// Provider-agnostic domain types (plan §4). Nothing outside lib/providers/<name>/ may see a provider's raw format.

export type ProviderId = 'mock' | 'travelpayouts'

/** Cheapest known price for one departure date, 1 adult, economy, one-way. */
export interface CheapestDate {
  date: string // YYYY-MM-DD, local departure date
  amountVnd: number
  carrier: string | null // IATA code
  stops: number | null
  /** When the provider observed this price. Drives observation_key: same foundAt = same observation. */
  foundAt: Date
  deeplink: string | null
}

export interface CheapestByMonthParams {
  origin: string
  dest: string
  month: string // YYYY-MM
}

export interface DeeplinkParams {
  origin: string
  dest: string
  date: string // YYYY-MM-DD
  pax: number
}

export interface ProviderCapabilities {
  supportsLcc: boolean
  realtime: boolean
  monthlyQuota: number | null
}

export interface FlightProvider {
  readonly id: ProviderId
  readonly capabilities: ProviderCapabilities
  getCheapestByMonth(p: CheapestByMonthParams): Promise<CheapestDate[]>
  buildDeeplink(p: DeeplinkParams): string
}
