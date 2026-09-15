// Shared types and helpers for the provider spike (Phase 0).
// Runs on plain Node 22.18+ (built-in type stripping): no enums, `import type`, explicit .ts imports.

export type ProviderName = 'travelpayouts'

export interface Route {
  origin: string
  destination: string
}

/** Cheapest observed price for one departure date. */
export interface DayPrice {
  date: string // YYYY-MM-DD, local departure date
  amount: number // major units of `currency`
  currency: string
  carrier: string | null // IATA code
  transfers: number | null
  foundAt: string | null // ISO time the provider observed this price (cache providers)
  deeplink: string | null
}

export interface RouteMonthResult {
  provider: ProviderName
  endpoint: string
  route: Route
  month: string // YYYY-MM
  daysInScope: number // future dates we asked about
  days: DayPrice[] // cheapest per date
  carriersSeen: string[] // every carrier in the response, not just the cheapest
  rawFieldNames: string[] // field names of one raw item, to learn the real schema
  currencies: string[]
  error?: string
}

export interface CallLog {
  provider: ProviderName
  endpoint: string
  url: string // secrets redacted
  status: number
  ms: number
  error?: string
}

export interface HttpResult {
  status: number
  ms: number
  json: unknown
  error?: string
}

export async function timedFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<HttpResult> {
  const started = performance.now()
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    const text = await res.text()
    let json: unknown = null
    try {
      json = JSON.parse(text)
    } catch {
      json = { nonJsonBody: text.slice(0, 500) }
    }
    return {
      status: res.status,
      ms: Math.round(performance.now() - started),
      json,
      error: res.ok ? undefined : `HTTP ${res.status}: ${text.slice(0, 300)}`,
    }
  } catch (err) {
    return {
      status: 0,
      ms: Math.round(performance.now() - started),
      json: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export function redact(url: string, secrets: Array<string | undefined>): string {
  let out = url
  for (const s of secrets) if (s) out = out.split(s).join('***')
  return out
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const pad = (n: number) => String(n).padStart(2, '0')

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "Next month" and "3 months from now", as in the plan. */
export function defaultMonths(today: Date): string[] {
  return [1, 3].map((offset) => {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  })
}

/** All dates in `month` strictly after `today`. */
export function futureDatesInMonth(month: string, today: Date): string[] {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  const todayIso = isoDate(today)
  const out: string[] = []
  for (let day = 1; day <= last; day++) {
    const iso = `${month}-${pad(day)}`
    if (iso > todayIso) out.push(iso)
  }
  return out
}

export function cheapestPerDate(prices: DayPrice[]): DayPrice[] {
  const best = new Map<string, DayPrice>()
  for (const p of prices) {
    const cur = best.get(p.date)
    if (!cur || p.amount < cur.amount) best.set(p.date, p)
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// --- defensive field access: the spike exists to learn the real schemas ---

export type Raw = Record<string, unknown>

export function isRecord(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function pickString(item: Raw, keys: string[]): string | null {
  for (const k of keys) {
    const v = item[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return null
}

export function pickNumber(item: Raw, keys: string[]): number | null {
  for (const k of keys) {
    const v = item[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  }
  return null
}
