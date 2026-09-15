// Travelpayouts (Aviasales) Data API — cached prices found by Aviasales users.
// Three endpoints are probed because we do not yet know which one gives the best
// month coverage, carrier info and `found_at` (needed for observation_key in the plan).

import type { CallLog, DayPrice, Raw, Route, RouteMonthResult } from './lib.ts'
import {
  cheapestPerDate,
  isRecord,
  pickNumber,
  pickString,
  redact,
  timedFetch,
} from './lib.ts'

const BASE = 'https://api.travelpayouts.com'
const TIMEOUT_MS = 30_000

type Endpoint = 'prices_for_dates' | 'month_matrix' | 'calendar'
export const TP_ENDPOINTS: Endpoint[] = ['prices_for_dates', 'month_matrix', 'calendar']

function buildUrl(endpoint: Endpoint, route: Route, month: string, token: string): string {
  const common = { origin: route.origin, destination: route.destination, currency: 'vnd' }
  switch (endpoint) {
    case 'prices_for_dates':
      return `${BASE}/aviasales/v3/prices_for_dates?${new URLSearchParams({
        ...common,
        departure_at: month,
        one_way: 'true',
        direct: 'false',
        sorting: 'price',
        limit: '1000',
        page: '1',
      })}`
    case 'month_matrix':
      return `${BASE}/v2/prices/month-matrix?${new URLSearchParams({
        ...common,
        month: `${month}-01`,
        one_way: 'true',
        show_to_affiliates: 'true',
        token,
      })}`
    case 'calendar':
      return `${BASE}/v1/prices/calendar?${new URLSearchParams({
        ...common,
        depart_date: month,
        calendar_type: 'departure_date',
        token,
      })}`
  }
}

/** v3 returns `data: []`; v1 calendar returns `data: { "YYYY-MM-DD": {...} }`. */
function extractItems(json: unknown): Raw[] {
  if (!isRecord(json)) return []
  const data = json.data
  if (Array.isArray(data)) return data.filter(isRecord)
  if (isRecord(data)) {
    return Object.entries(data)
      .filter(([, v]) => isRecord(v))
      .map(([key, v]) => ({ _key: key, ...(v as Raw) }))
  }
  return []
}

function toDayPrice(item: Raw, currency: string): DayPrice | null {
  const when = pickString(item, ['departure_at', 'depart_date', '_key'])
  const amount = pickNumber(item, ['price', 'value'])
  if (!when || amount === null) return null
  const link = pickString(item, ['link'])
  return {
    // departure_at is local time with offset ("2026-10-15T06:00:00+07:00"): first 10 chars = local date
    date: when.slice(0, 10),
    amount,
    currency,
    carrier: pickString(item, ['airline', 'carrier']),
    transfers: pickNumber(item, ['transfers', 'number_of_changes']),
    foundAt: pickString(item, ['found_at']),
    deeplink: link ? `https://www.aviasales.com${link}` : null,
  }
}

export async function probeTravelpayouts(
  endpoint: Endpoint,
  route: Route,
  month: string,
  scopeDates: string[],
  token: string,
  calls: CallLog[],
): Promise<RouteMonthResult> {
  const url = buildUrl(endpoint, route, month, token)
  const res = await timedFetch(url, { headers: { 'X-Access-Token': token } }, TIMEOUT_MS)
  calls.push({
    provider: 'travelpayouts',
    endpoint,
    url: redact(url, [token]),
    status: res.status,
    ms: res.ms,
    error: res.error,
  })

  const base: RouteMonthResult = {
    provider: 'travelpayouts',
    endpoint,
    route,
    month,
    daysInScope: scopeDates.length,
    days: [],
    carriersSeen: [],
    rawFieldNames: [],
    currencies: [],
  }
  if (res.error) return { ...base, error: res.error }

  const json = res.json
  if (isRecord(json) && json.success === false) {
    return { ...base, error: `success=false: ${JSON.stringify(json.error ?? json).slice(0, 300)}` }
  }

  const currency = (isRecord(json) && typeof json.currency === 'string' ? json.currency : 'vnd').toUpperCase()
  const items = extractItems(json)
  const inScope = new Set(scopeDates)
  const prices = items
    .map((it) => toDayPrice(it, currency))
    .filter((p): p is DayPrice => p !== null && inScope.has(p.date))

  return {
    ...base,
    days: cheapestPerDate(prices),
    carriersSeen: [...new Set(prices.map((p) => p.carrier).filter((c): c is string => !!c))].sort(),
    rawFieldNames: items[0] ? Object.keys(items[0]).filter((k) => k !== '_key').sort() : [],
    currencies: [currency],
  }
}
