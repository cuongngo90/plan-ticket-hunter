// Deterministic fake prices so dev and tests never spend provider calls (plan §4).
// Same inputs → same price; the price only changes when the observation window changes.

const BASE_VND: Record<string, number> = {
  'SGN-HAN': 1_400_000,
  'HAN-SGN': 1_400_000,
  'SGN-DAD': 1_000_000,
  'DAD-SGN': 1_000_000,
  'HAN-DAD': 1_000_000,
  'DAD-HAN': 1_000_000,
  'HAN-PQC': 1_600_000,
  'PQC-HAN': 1_600_000,
}
const DEFAULT_BASE_VND = 1_200_000
const CARRIERS = ['VJ', 'VN', 'VU', 'QH']
const FLASH_SALE_CHANCE = 0.03

/** FNV-1a → [0, 1). Stable across runs and platforms. */
export function hash01(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 2 ** 32
}

/** Tết (roughly late Jan – mid Feb) ×2.2, summer (Jun–Aug) ×1.4. */
export function seasonFactor(date: string): number {
  const [, m, d] = date.split('-').map(Number)
  if ((m === 1 && d >= 20) || (m === 2 && d <= 15)) return 2.2
  if (m >= 6 && m <= 8) return 1.4
  return 1
}

/** Last-minute tickets get pricier: ×1.8 within 3 days, easing to ×1 at 30+ days. */
export function urgencyFactor(daysToDeparture: number): number {
  if (daysToDeparture <= 3) return 1.8
  if (daysToDeparture >= 30) return 1
  return 1 + 0.8 * ((30 - daysToDeparture) / 27)
}

export interface MockPriceInput {
  origin: string
  dest: string
  date: string // YYYY-MM-DD
  daysToDeparture: number
  /** Changes when a "new observation" happens (e.g. the hour of the scan). */
  observationWindow: string
  forceDeal?: boolean
}

export interface MockPrice {
  amountVnd: number
  carrier: string
}

export function mockPrice(input: MockPriceInput): MockPrice {
  const { origin, dest, date, daysToDeparture, observationWindow, forceDeal } = input
  const route = `${origin}-${dest}`
  const base = BASE_VND[route] ?? DEFAULT_BASE_VND
  const noise = 0.85 + 0.3 * hash01(`${route}|${date}|${observationWindow}`) // ±15%
  const flash = hash01(`flash|${route}|${date}|${observationWindow}`) < FLASH_SALE_CHANCE ? 0.55 : 1
  const raw = base * seasonFactor(date) * urgencyFactor(daysToDeparture) * noise * flash * (forceDeal ? 0.4 : 1)
  return {
    amountVnd: Math.round(raw / 1000) * 1000, // fares end in 000
    carrier: CARRIERS[Math.floor(hash01(`carrier|${route}|${date}`) * CARRIERS.length)],
  }
}
