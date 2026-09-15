import { describe, expect, it } from 'vitest'
import { addDays, datesInMonth, daysBetween, monthsInRange, todayInVietnam } from './date'

describe('date utils', () => {
  it('todayInVietnam uses UTC+7', () => {
    expect(todayInVietnam(new Date('2026-09-15T16:59:00Z'))).toBe('2026-09-15')
    expect(todayInVietnam(new Date('2026-09-15T17:00:00Z'))).toBe('2026-09-16')
  })

  it('daysBetween and addDays are inverse', () => {
    expect(daysBetween('2026-09-16', '2026-10-16')).toBe(30)
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(daysBetween('2026-03-01', addDays('2026-03-01', 45))).toBe(45)
  })

  it('datesInMonth handles month lengths and leap years', () => {
    expect(datesInMonth('2026-02')).toHaveLength(28)
    expect(datesInMonth('2028-02')).toHaveLength(29)
    expect(datesInMonth('2026-10').at(-1)).toBe('2026-10-31')
  })

  it('monthsInRange spans months and years', () => {
    expect(monthsInRange('2026-10-10', '2026-10-20')).toEqual(['2026-10'])
    expect(monthsInRange('2026-12-20', '2027-01-05')).toEqual(['2026-12', '2027-01'])
  })
})
