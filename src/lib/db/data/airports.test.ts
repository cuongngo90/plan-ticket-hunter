import { describe, expect, it } from 'vitest'
import { AIRPORTS, airportRows } from './airports'

describe('AIRPORTS seed data', () => {
  it('has ~40 airports with unique 3-letter IATA codes', () => {
    expect(AIRPORTS.length).toBeGreaterThanOrEqual(40)
    const codes = AIRPORTS.map((a) => a.iata)
    expect(new Set(codes).size).toBe(codes.length)
    for (const c of codes) expect(c).toMatch(/^[A-Z]{3}$/)
  })

  it('uses valid IANA timezones and 2-letter country codes', () => {
    for (const a of AIRPORTS) {
      expect(a.countryCode).toMatch(/^[A-Z]{2}$/)
      expect(() => new Intl.DateTimeFormat('en', { timeZone: a.timezone })).not.toThrow()
    }
  })

  it('builds an accent-free search_text that matches Vietnamese queries', () => {
    const dad = airportRows().find((r) => r.iata === 'DAD')
    expect(dad?.searchText).toContain('da nang')
    expect(dad?.searchText).toContain('dad')
    const sgn = airportRows().find((r) => r.iata === 'SGN')
    expect(sgn?.searchText).toContain('sai gon')
  })

  it('covers every route used in the provider spike', () => {
    const codes = new Set(AIRPORTS.map((a) => a.iata))
    for (const c of ['SGN', 'HAN', 'DAD', 'PQC', 'VCA']) expect(codes.has(c)).toBe(true)
  })
})
