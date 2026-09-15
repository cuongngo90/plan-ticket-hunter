import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Constant-time check of the x-cron-secret header. Hashing first gives equal-length buffers,
 * so neither the content nor the length of the secret leaks through timing.
 */
export function verifyCronSecret(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) return false
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}
