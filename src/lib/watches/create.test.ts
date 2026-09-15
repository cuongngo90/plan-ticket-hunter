import { describe, expect, it } from 'vitest'
import { createWatchInput } from './create'

const valid = { userId: 'u1', origin: 'SGN', dest: 'HAN', dateFrom: '2026-10-10', dateTo: '2026-10-20' }

describe('createWatchInput', () => {
  it('accepts a valid watch and applies defaults', () => {
    expect(createWatchInput.parse(valid)).toMatchObject({ pax: 1, targetAmountVnd: null })
  })

  it.each([
    [{ origin: 'sgn' }, 'Mã sân bay'],
    [{ dest: 'SGN' }, 'khác nhau'],
    [{ dateTo: '2026-10-01' }, 'trước ngày kết thúc'],
    [{ dateTo: '2026-12-31' }, 'tối đa 62 ngày'],
    [{ pax: 0 }, ''],
  ])('rejects %o', (patch, message) => {
    const r = createWatchInput.safeParse({ ...valid, ...patch })
    expect(r.success).toBe(false)
    if (!r.success && message) expect(r.error.issues.map((i) => i.message).join(' ')).toContain(message)
  })
})
