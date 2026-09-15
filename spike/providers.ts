// Phase 0 — provider spike: is Travelpayouts data good enough for Vietnamese domestic routes?
// Standalone, no dependencies.
//
//   node --env-file=spike/.env spike/providers.ts [options]
//
// Options:
//   --routes=SGN-HAN,SGN-DAD      override routes
//   --months=2026-10,2026-12      override months (default: next month and +3 months)

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import type { CallLog, Route, RouteMonthResult } from './lib.ts'
import { defaultMonths, futureDatesInMonth, isoDate, sleep } from './lib.ts'
import { TP_ENDPOINTS, probeTravelpayouts } from './travelpayouts.ts'
import { coverage, renderMarkdown } from './report.ts'

const DEFAULT_ROUTES = ['SGN-HAN', 'SGN-DAD', 'HAN-PQC', 'SGN-VCA', 'HAN-DAD']
const TP_DELAY_MS = 300

const { values: args } = parseArgs({
  options: {
    routes: { type: 'string' },
    months: { type: 'string' },
  },
})

function parseRoutes(s: string): Route[] {
  return s.split(',').map((pair) => {
    const [origin, destination] = pair.trim().toUpperCase().split('-')
    if (!/^[A-Z]{3}$/.test(origin ?? '') || !/^[A-Z]{3}$/.test(destination ?? '')) {
      throw new Error(`Tuyến không hợp lệ: "${pair}" (định dạng SGN-HAN)`)
    }
    return { origin, destination }
  })
}

async function main() {
  const now = new Date()
  const routes = parseRoutes(args.routes ?? DEFAULT_ROUTES.join(','))
  const months = args.months ? args.months.split(',').map((m) => m.trim()) : defaultMonths(now)
  for (const m of months) {
    if (!/^\d{4}-\d{2}$/.test(m)) throw new Error(`Tháng không hợp lệ: "${m}" (định dạng YYYY-MM)`)
  }

  const token = process.env.TRAVELPAYOUTS_TOKEN?.trim()
  if (!token) {
    console.error('Thiếu TRAVELPAYOUTS_TOKEN. Xem spike/README.md để lấy token.')
    process.exitCode = 1
    return
  }

  console.log(`Tuyến: ${routes.map((r) => `${r.origin}-${r.destination}`).join(', ')} · Tháng: ${months.join(', ')}`)
  console.log(`▶ Travelpayouts: ${routes.length * months.length * TP_ENDPOINTS.length} lượt gọi`)

  const results: RouteMonthResult[] = []
  const calls: CallLog[] = []
  for (const route of routes) {
    for (const month of months) {
      const scope = futureDatesInMonth(month, now)
      for (const endpoint of TP_ENDPOINTS) {
        const r = await probeTravelpayouts(endpoint, route, month, scope, token, calls)
        results.push(r)
        logResult(r)
        await sleep(TP_DELAY_MS)
      }
    }
  }

  const outDir = join(import.meta.dirname, 'results')
  mkdirSync(outDir, { recursive: true })
  const stamp = `${isoDate(now)}_${now.toTimeString().slice(0, 8).replace(/:/g, '')}`
  const jsonPath = join(outDir, `${stamp}.json`)
  const mdPath = join(outDir, `${stamp}.md`)
  writeFileSync(jsonPath, JSON.stringify({ generatedAt: now.toISOString(), routes, months, results, calls }, null, 2))
  writeFileSync(mdPath, renderMarkdown(results, calls, now))

  console.log(`\n✔ Dữ liệu thô: ${jsonPath}\n✔ Báo cáo:     ${mdPath}`)
}

function logResult(r: RouteMonthResult) {
  const cov = coverage(r)
  const status = r.error
    ? `✖ ${r.error.slice(0, 120)}`
    : `${r.days.length}/${r.daysInScope} ngày (${cov === null ? '–' : Math.round(cov * 100)}%) · ${r.carriersSeen.join(' ') || 'không rõ hãng'}`
  console.log(`  ${r.endpoint} ${r.route.origin}-${r.route.destination} ${r.month}: ${status}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
