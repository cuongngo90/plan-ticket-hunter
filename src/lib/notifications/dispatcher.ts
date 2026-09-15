import { eq, sql } from 'drizzle-orm'
import type { Db } from '@/lib/db'
import { notifications, users, watches } from '@/lib/db/schema'
import type { TelegramSender } from './channels/telegram'
import { formatDealTelegram } from './templates'

// Sends every alert_event that is due (scheduled_for ≤ now, not yet dispatched) — both deals found in this
// tick and ones deferred earlier (quiet hours, digest). Web Push lands in slice 8; Telegram only for now.

export interface DispatchDeps {
  db: Db
  telegram: TelegramSender | null
  /** Slice #0: owner's chat id for users who have not linked Telegram yet. */
  fallbackChatId?: string
  deeplink: (p: { origin: string; dest: string; date: string; pax: number }) => string
  now: () => Date
}

export interface DispatchSummary {
  claimed: number
  sent: number
  failed: number
  skipped: number
}

interface DueRow extends Record<string, unknown> {
  id: string
  watch_id: string
  user_id: string
  depart_date: string
  amount_vnd: string | number
  carrier: string | null
  deeplink: string | null
  source_found_at: string | null
  score: number
  rules: string[]
  origin: string
  dest: string
  pax: number
  target_amount_vnd: string | number | null
  telegram_chat_id: string | null
  telegram_blocked_at: string | null
}

export async function dispatchDue(deps: DispatchDeps, limit = 50): Promise<DispatchSummary> {
  const { db } = deps
  // Claim first (mark dispatched) so two concurrent ticks never send the same alert twice.
  // Trade-off for slice #0: a send that fails is logged, not retried.
  const due = await db.execute<DueRow>(sql`
    with claimed as (
      update alert_events set dispatched_at = now()
      where id in (
        select id from alert_events
        where dispatched_at is null and scheduled_for <= now()
        order by scheduled_for
        limit ${limit}
        for update skip locked
      )
      returning *
    )
    select c.id, c.watch_id, c.user_id, c.depart_date::text as depart_date, c.amount_vnd, c.carrier, c.deeplink,
           c.source_found_at, c.score, c.rules,
           w.origin, w.dest, w.pax, w.target_amount_vnd,
           u.telegram_chat_id, u.telegram_blocked_at
    from claimed c
    join watches w on w.id = c.watch_id
    join users u on u.id = c.user_id`)

  const summary: DispatchSummary = { claimed: due.length, sent: 0, failed: 0, skipped: 0 }

  for (const a of due) {
    const amountVnd = Number(a.amount_vnd)
    const chatId = a.telegram_chat_id ?? deps.fallbackChatId
    if (!deps.telegram || !chatId || a.telegram_blocked_at) {
      summary.skipped++
      await db.insert(notifications).values({
        alertEventId: a.id,
        userId: a.user_id,
        channel: 'telegram',
        status: 'skipped',
        errorCode: !deps.telegram ? 'NOT_CONFIGURED' : a.telegram_blocked_at ? 'BLOCKED' : 'NO_CHAT_ID',
      })
      continue
    }

    const html = formatDealTelegram({
      origin: a.origin,
      dest: a.dest,
      departDate: a.depart_date,
      amountVnd,
      carrier: a.carrier,
      pax: a.pax,
      score: a.score,
      rules: a.rules,
      targetAmountVnd: a.target_amount_vnd === null ? null : Number(a.target_amount_vnd),
      sourceFoundAt: a.source_found_at ? new Date(a.source_found_at) : null,
      now: deps.now(),
    })
    const url = a.deeplink ?? deps.deeplink({ origin: a.origin, dest: a.dest, date: a.depart_date, pax: a.pax })
    const result = await deps.telegram.send({ chatId, html, button: { text: 'Xem giá thật', url } })

    await db.insert(notifications).values({
      alertEventId: a.id,
      userId: a.user_id,
      channel: 'telegram',
      status: result.ok ? 'sent' : 'failed',
      providerMsgId: result.ok ? result.providerMsgId : null,
      errorCode: result.ok ? null : result.errorCode,
    })

    if (result.ok) {
      summary.sent++
      await db
        .update(watches)
        .set({ lastNotifiedAt: deps.now(), lastNotifiedAmountVnd: amountVnd })
        .where(eq(watches.id, a.watch_id))
    } else {
      summary.failed++
      if (result.blocked) {
        await db.update(users).set({ telegramBlockedAt: deps.now() }).where(eq(users.id, a.user_id))
      }
    }
  }
  return summary
}
