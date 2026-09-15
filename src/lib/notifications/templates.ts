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

const RULE_REASON: Record<string, (i: DealMessageInput) => string> = {
  ABSOLUTE: (i) => (i.targetAmountVnd ? `thấp hơn giá mục tiêu ${formatVnd(i.targetAmountVnd)}` : 'dưới giá mục tiêu'),
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function ddmmyyyy(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

function ageText(foundAt: Date, now: Date): string {
  const hours = Math.max(0, Math.round((now.getTime() - foundAt.getTime()) / 3_600_000))
  return hours < 1 ? 'vừa ghi nhận' : `ghi nhận ${hours} giờ trước`
}

/** Telegram HTML message (parse_mode=HTML). */
export function formatDealTelegram(i: DealMessageInput): string {
  const lines = [
    `🔥 <b>${escapeHtml(i.origin)} → ${escapeHtml(i.dest)}</b> · ${ddmmyyyy(i.departDate)}`,
    `<b>${formatVnd(i.amountVnd)}</b>${i.carrier ? ` · ${escapeHtml(i.carrier)}` : ''} · 1 người lớn`,
  ]
  if (i.pax > 1) lines.push(`≈ ${formatVnd(i.amountVnd * i.pax)} cho ${i.pax} khách (ước tính)`)
  const reasons = i.rules.map((r) => RULE_REASON[r]?.(i)).filter(Boolean)
  if (reasons.length) lines.push(`Vì sao là deal: ${reasons.join('; ')} · điểm ${i.score}/100`)
  if (i.sourceFoundAt) lines.push(`<i>Giá tham khảo, ${ageText(i.sourceFoundAt, i.now)} — giá thật có thể khác.</i>`)
  return lines.join('\n')
}
