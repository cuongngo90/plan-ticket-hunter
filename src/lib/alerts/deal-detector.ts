// Deal scoring (plan §5). Pure: same input → same score.
// Slice #0 ships the ABSOLUTE rule; the relative rules (RELATIVE_MEDIAN, PERCENTILE, ALL_TIME_LOW,
// which need route_stats with sample_count ≥ 8) land in slice 7.

export type DealRule = 'ABSOLUTE'

export interface DealInput {
  amountVnd: number
  targetAmountVnd: number | null
}

export interface DealScore {
  score: number // 0–100
  rules: DealRule[]
}

/** At or under the user's target: 50 points (enough to alert on its own), +1 per 1% below target, capped at 80. */
function absoluteRule({ amountVnd, targetAmountVnd }: DealInput): number {
  if (targetAmountVnd === null || targetAmountVnd <= 0 || amountVnd > targetAmountVnd) return 0
  const pctBelow = (targetAmountVnd - amountVnd) / targetAmountVnd
  return Math.min(80, 50 + Math.floor(pctBelow * 100))
}

export function scoreDeal(input: DealInput): DealScore {
  const rules: DealRule[] = []
  let score = 0
  const absolute = absoluteRule(input)
  if (absolute > 0) {
    rules.push('ABSOLUTE')
    score += absolute
  }
  return { score: Math.min(100, score), rules }
}
