import { describe, expect, it } from 'vitest'
import { verifyCronSecret } from './cron-auth'

describe('verifyCronSecret', () => {
  it('accepts only the exact secret', () => {
    expect(verifyCronSecret('s3cret-s3cret-123', 's3cret-s3cret-123')).toBe(true)
    expect(verifyCronSecret('s3cret-s3cret-124', 's3cret-s3cret-123')).toBe(false)
    expect(verifyCronSecret('short', 's3cret-s3cret-123')).toBe(false)
    expect(verifyCronSecret(null, 's3cret-s3cret-123')).toBe(false)
    expect(verifyCronSecret('anything', undefined)).toBe(false)
  })
})
