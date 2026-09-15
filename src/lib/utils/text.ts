/**
 * Lowercase, accent-free form used for airport search, so "da nang", "Đà Nẵng" and "DAD" all match.
 * Done in the app instead of Postgres `unaccent()`, which is not IMMUTABLE and cannot back an index.
 */
export function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
