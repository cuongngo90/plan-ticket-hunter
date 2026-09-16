import { formatDdMmYyyy } from '@/lib/utils/date'
import { formatVnd } from '@/lib/utils/money'

export interface DealMessageInput {
  origin: string
  dest: string
  departDate: string // YYYY-MM-DD
  amountVnd: number
  carrier: string | null
  pax: number
  score: number
  rules: string[]
  targetAmountVnd: number | null
  sourceFoundAt: Date | null
  now: Date
}

const RULE_REASON: Record<string, (deal: DealMessageInput) => string> = {
  ABSOLUTE: (deal) =>
    deal.targetAmountVnd ? `thấp hơn giá mục tiêu ${formatVnd(deal.targetAmountVnd)}` : 'dưới giá mục tiêu',
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function ageText(foundAt: Date, now: Date): string {
  const hours = Math.max(0, Math.round((now.getTime() - foundAt.getTime()) / 3_600_000))
  return hours < 1 ? 'vừa ghi nhận' : `ghi nhận ${hours} giờ trước`
}

/** Telegram HTML message (parse_mode=HTML). */
export function formatDealTelegram(deal: DealMessageInput): string {
  const lines = [
    `🔥 <b>${escapeHtml(deal.origin)} → ${escapeHtml(deal.dest)}</b> · ${formatDdMmYyyy(deal.departDate)}`,
    `<b>${formatVnd(deal.amountVnd)}</b>${deal.carrier ? ` · ${escapeHtml(deal.carrier)}` : ''} · 1 người lớn`,
  ]
  if (deal.pax > 1) lines.push(`≈ ${formatVnd(deal.amountVnd * deal.pax)} cho ${deal.pax} khách (ước tính)`)
  const reasons = deal.rules.map((r) => RULE_REASON[r]?.(deal)).filter(Boolean)
  if (reasons.length) lines.push(`Vì sao là deal: ${reasons.join('; ')} · điểm ${deal.score}/100`)
  if (deal.sourceFoundAt) {
    lines.push(`<i>Giá tham khảo, ${ageText(deal.sourceFoundAt, deal.now)} — giá thật có thể khác.</i>`)
  }
  return lines.join('\n')
}
