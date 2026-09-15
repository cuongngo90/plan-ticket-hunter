import { describe, expect, it } from 'vitest'
import { normalizeSearch } from './text'

describe('normalizeSearch', () => {
  it.each([
    ['Đà Nẵng', 'da nang'],
    ['Hồ Chí Minh', 'ho chi minh'],
    ['  Phú   Quốc ', 'phu quoc'],
    ['Buôn Ma Thuột', 'buon ma thuot'],
    ['SGN', 'sgn'],
    ['Nội Bài', 'noi bai'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeSearch(input)).toBe(expected)
  })
})
