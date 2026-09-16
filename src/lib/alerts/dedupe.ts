import { createHash } from 'node:crypto'

// Gate 5 (plan §5): the unique alert_events.dedupe_key. Two ticks racing, a retry, or a rescan that sees
// the same price all produce the same key, so ON CONFLICT DO NOTHING drops the duplicate.

/** Prices within the same ~2% band share a bucket, so 1.180.000 vs 1.185.000 is "the same deal". */
export function priceBucket(amountVnd: number): number {
  return Math.floor(Math.log(amountVnd) / Math.log(1.02))
}

export interface DedupeInput {
  watchId: string
  episodeNo: number
  departDate: string
  carrier: string | null
  amountVnd: number
}

export function dedupeKey(input: DedupeInput): string {
  const parts = [input.watchId, input.episodeNo, input.departDate, input.carrier ?? '-', priceBucket(input.amountVnd)]
  return createHash('sha256').update(parts.join('|')).digest('hex')
}
