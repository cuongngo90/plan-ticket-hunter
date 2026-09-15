// Turns raw spike results into the coverage table + stop-point verdict from the plan (Phase 0).

import type { CallLog, RouteMonthResult } from './lib.ts'
import { median } from './lib.ts'

// Plan, Phase 0 stop point: missing VietJet, or missing > 30% of days on the main routes.
const MIN_COVERAGE = 0.7
const VIETNAMESE_CARRIERS = ['VJ', 'QH', 'VN', 'VU'] // VietJet, Bamboo, Vietnam Airlines, Vietravel
const COMBINED = 'gộp các endpoint'

const routeKey = (r: RouteMonthResult) => `${r.route.origin}-${r.route.destination}`
const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`)
const vnd = (x: number | null) => (x === null ? '–' : Math.round(x).toLocaleString('vi-VN'))

export function coverage(r: RouteMonthResult): number | null {
  return r.daysInScope ? r.days.length / r.daysInScope : null
}

function priceAgeHours(r: RouteMonthResult, now: Date): number | null {
  const ages = r.days
    .map((d) => (d.foundAt ? (now.getTime() - Date.parse(d.foundAt)) / 3_600_000 : NaN))
    .filter((h) => Number.isFinite(h))
  return median(ages)
}

interface EndpointVerdict {
  endpoint: string
  medianCoverage: number | null
  routesWithVJ: number
  routesTotal: number
  hasFoundAt: boolean
  hasDeeplink: boolean
  currencies: string[]
  pass: boolean
}

/**
 * The app may combine endpoints (e.g. one for day coverage, another for carrier names),
 * so also score the union of all endpoints per route × month.
 */
function combined(results: RouteMonthResult[]): RouteMonthResult[] {
  const groups = new Map<string, RouteMonthResult[]>()
  for (const r of results) {
    const k = `${routeKey(r)}|${r.month}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  return [...groups.values()]
    .filter((rs) => new Set(rs.map((r) => r.endpoint)).size > 1)
    .map((rs) => ({
      ...rs[0],
      endpoint: COMBINED,
      days: [...new Map(rs.flatMap((r) => r.days).map((d) => [d.date, d])).values()],
      carriersSeen: [...new Set(rs.flatMap((r) => r.carriersSeen))].sort(),
      currencies: [...new Set(rs.flatMap((r) => r.currencies))],
      error: undefined,
    }))
}

function verdicts(results: RouteMonthResult[]): EndpointVerdict[] {
  const groups = new Map<string, RouteMonthResult[]>()
  for (const r of [...results, ...combined(results)]) {
    groups.set(r.endpoint, [...(groups.get(r.endpoint) ?? []), r])
  }
  return [...groups.values()].map((rs) => {
    const routes = new Set(rs.map(routeKey))
    const routesWithVJ = new Set(rs.filter((r) => r.carriersSeen.includes('VJ')).map(routeKey)).size
    const cov = median(rs.map(coverage).filter((c): c is number => c !== null))
    return {
      endpoint: rs[0].endpoint,
      medianCoverage: cov,
      routesWithVJ,
      routesTotal: routes.size,
      hasFoundAt: rs.some((r) => r.days.some((d) => d.foundAt !== null)),
      hasDeeplink: rs.some((r) => r.days.some((d) => d.deeplink !== null)),
      currencies: [...new Set(rs.flatMap((r) => r.currencies))],
      // VietJet must show up on a majority of routes, and coverage must clear the bar
      pass: cov !== null && cov >= MIN_COVERAGE && routesWithVJ * 2 > routes.size,
    }
  })
}

export function renderMarkdown(results: RouteMonthResult[], calls: CallLog[], now: Date): string {
  const lines: string[] = []
  lines.push(`# Kết quả spike Travelpayouts — ${now.toISOString()}`, '')

  lines.push('## Kết luận theo điểm dừng của plan', '')
  lines.push(
    `Tiêu chí đạt: độ phủ ngày (trung vị) ≥ ${pct(MIN_COVERAGE)} **và** có VietJet trên quá nửa số tuyến.`,
    '',
    '| Endpoint | Độ phủ (trung vị) | Tuyến có VJ | `found_at` | Deeplink | Tiền tệ | Đạt? |',
    '|---|---|---|---|---|---|---|',
  )
  const vs = verdicts(results)
  for (const v of vs) {
    lines.push(
      `| ${v.endpoint} | ${pct(v.medianCoverage)} | ${v.routesWithVJ}/${v.routesTotal} | ${v.hasFoundAt ? 'có' : 'không'} | ${v.hasDeeplink ? 'có' : 'không'} | ${v.currencies.join(', ') || '–'} | ${v.pass ? '✅' : '❌'} |`,
    )
  }
  const passing = vs.filter((v) => v.pass)
  lines.push(
    '',
    passing.length
      ? `**Đạt (${passing.map((v) => v.endpoint).join(', ')})** — dùng Travelpayouts làm provider, xem thêm các mục kiểm tra thủ công bên dưới.`
      : '**Không đạt → theo plan: DỪNG, xem xét lại trước khi dựng app.**',
    '',
  )

  lines.push('## Chi tiết theo tuyến × tháng', '')
  lines.push(
    '| Endpoint | Tuyến | Tháng | Độ phủ | Giá trung vị | Tuổi giá trung vị (giờ) | Hãng thấy được | Lỗi |',
    '|---|---|---|---|---|---|---|---|',
  )
  for (const r of results) {
    const carriers = r.carriersSeen
      .map((c) => (VIETNAMESE_CARRIERS.includes(c) ? `**${c}**` : c))
      .join(' ')
    const age = priceAgeHours(r, now)
    lines.push(
      `| ${r.endpoint} | ${routeKey(r)} | ${r.month} | ${r.days.length}/${r.daysInScope} (${pct(coverage(r))}) | ${vnd(median(r.days.map((d) => d.amount)))} ${r.currencies.join('/')} | ${age === null ? '–' : Math.round(age)} | ${carriers || '–'} | ${r.error ? r.error.slice(0, 80).replace(/\|/g, '/') : ''} |`,
    )
  }

  lines.push('', '## Schema thật (tên trường của 1 item)', '')
  const seen = new Set<string>()
  for (const r of results) {
    if (seen.has(r.endpoint) || !r.rawFieldNames.length) continue
    seen.add(r.endpoint)
    lines.push(`- **${r.endpoint}:** \`${r.rawFieldNames.join('`, `')}\``)
  }

  lines.push('', '## Lượt gọi', '')
  const byEndpoint = new Map<string, CallLog[]>()
  for (const c of calls) byEndpoint.set(c.endpoint, [...(byEndpoint.get(c.endpoint) ?? []), c])
  lines.push('| Endpoint | Số lượt | Lỗi | Latency trung vị (ms) |', '|---|---|---|---|')
  for (const [k, cs] of byEndpoint) {
    lines.push(`| ${k} | ${cs.length} | ${cs.filter((c) => c.error).length} | ${median(cs.map((c) => c.ms)) ?? '–'} |`)
  }

  lines.push('', '## Mẫu cần đối chiếu tay (so với web hãng / đại lý)', '')
  lines.push('| Endpoint | Tuyến | Ngày | Giá | Hãng | Giá tra tay | Chênh lệch |', '|---|---|---|---|---|---|---|')
  const samples = results
    .filter((r) => r.days.length)
    .map((r) => ({ r, d: r.days.reduce((a, b) => (b.amount < a.amount ? b : a)) }))
    .slice(0, 10)
  for (const { r, d } of samples) {
    const link = d.deeplink ? ` ([link](${d.deeplink}))` : ''
    lines.push(`| ${r.endpoint} | ${routeKey(r)} | ${d.date} | ${vnd(d.amount)} ${d.currency}${link} | ${d.carrier ?? '–'} |  |  |`)
  }

  lines.push(
    '',
    '## Kiểm tra thủ công (điền tay)',
    '',
    '- [ ] ToS: có cho dùng Data API mà không gắn link affiliate không? Nếu bắt buộc thì gắn marker vào deeplink.',
    '- [ ] Rate limit thực tế (xem header response / tài liệu).',
    '- [ ] Đối chiếu 5–10 mẫu ở bảng trên, ghi chênh lệch.',
    '',
    '## Quyết định',
    '',
    '- Endpoint dùng cho `getCheapestByMonth`: …',
    '- Endpoint lấy tên hãng / deeplink: …',
    '- `observation_key` lấy từ: …',
    '- Ngưỡng "giá cache quá cũ": … giờ',
    '',
  )
  return lines.join('\n')
}
