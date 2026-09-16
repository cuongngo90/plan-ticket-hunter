import { describe, expect, it, vi } from 'vitest'
import { formatVnd } from '@/lib/utils/money'
import { createTelegramSender } from './channels/telegram'
import { formatDealTelegram } from './templates'

describe('formatVnd', () => {
  it('uses Vietnamese thousands separators', () => {
    expect(formatVnd(1_180_000)).toBe('1.180.000₫')
  })
})

describe('formatDealTelegram', () => {
  const base = {
    origin: 'SGN',
    dest: 'HAN',
    departDate: '2026-10-16',
    amountVnd: 560_000,
    carrier: 'VJ',
    pax: 1,
    score: 80,
    rules: ['ABSOLUTE'],
    targetAmountVnd: 1_500_000,
    sourceFoundAt: new Date('2026-09-16T03:00:00Z'),
    now: new Date('2026-09-16T05:10:00Z'),
  }

  it('shows route, date, price, reason and price age', () => {
    const msg = formatDealTelegram(base)
    expect(msg).toContain('SGN → HAN')
    expect(msg).toContain('16/10/2026')
    expect(msg).toContain('560.000₫')
    expect(msg).toContain('thấp hơn giá mục tiêu 1.500.000₫')
    expect(msg).toContain('ghi nhận 2 giờ trước')
  })

  it('adds a multi-passenger estimate', () => {
    expect(formatDealTelegram({ ...base, pax: 3 })).toContain('≈ 1.680.000₫ cho 3 khách')
  })

  it('escapes HTML', () => {
    expect(formatDealTelegram({ ...base, carrier: '<b>' })).toContain('&lt;b&gt;')
  })
})

describe('telegram sender', () => {
  const msg = { chatId: '42', html: 'hi', button: { text: 'Xem', url: 'https://x.test' } }

  it('returns the message id on success and sends an inline button', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true, result: { message_id: 7 } }))
    const res = await createTelegramSender('TOKEN', fetchImpl as unknown as typeof fetch).send(msg)
    expect(res).toEqual({ ok: true, providerMsgId: '7' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.telegram.org/botTOKEN/sendMessage')
    expect(JSON.parse(init.body as string)).toMatchObject({
      chat_id: '42',
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: 'Xem', url: 'https://x.test' }]] },
    })
  })

  it('flags 403 as blocked', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }, { status: 403 }),
    )
    const res = await createTelegramSender('T', fetchImpl as unknown as typeof fetch).send(msg)
    expect(res).toMatchObject({ ok: false, blocked: true })
  })

  it('never throws on network errors', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNRESET')
    })
    const res = await createTelegramSender('T', fetchImpl as unknown as typeof fetch).send(msg)
    expect(res).toMatchObject({ ok: false, blocked: false })
  })
})
