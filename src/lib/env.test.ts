import { describe, expect, it } from 'vitest'
import { parseEnv } from './env'

const base = { DATABASE_URL: 'postgres://user:pass@localhost:5432/sanve' }

describe('parseEnv', () => {
  it('accepts the minimal Phase 1 env and applies defaults', () => {
    const env = parseEnv(base)
    expect(env.NODE_ENV).toBe('development')
    expect(env.ALLOWED_EMAILS).toEqual([])
    expect(env.MOCK_PROVIDER).toBe(false)
  })

  it('accepts postgresql:// URLs (Neon format)', () => {
    expect(() => parseEnv({ DATABASE_URL: 'postgresql://u:p@ep-x-pooler.neon.tech/db?sslmode=require' })).not.toThrow()
  })

  it('normalizes the email allowlist', () => {
    const env = parseEnv({ ...base, ALLOWED_EMAILS: ' A@Gmail.com, b@x.vn ,, ' })
    expect(env.ALLOWED_EMAILS).toEqual(['a@gmail.com', 'b@x.vn'])
  })

  it('parses boolean flags', () => {
    expect(parseEnv({ ...base, MOCK_PROVIDER: '1' }).MOCK_PROVIDER).toBe(true)
    expect(parseEnv({ ...base, MOCK_PROVIDER: 'false' }).MOCK_PROVIDER).toBe(false)
  })

  it('rejects a missing or non-postgres DATABASE_URL with a readable message', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/)
    expect(() => parseEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/)
  })

  it('rejects a short CRON_SECRET', () => {
    expect(() => parseEnv({ ...base, CRON_SECRET: 'short' })).toThrow(/CRON_SECRET/)
  })
})
