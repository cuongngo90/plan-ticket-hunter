import { eq, sql } from 'drizzle-orm'
import type { Db } from '@/lib/db'
import { alertEvents, notifications, users, watches } from '@/lib/db/schema'
import type { TelegramSender } from './channels/telegram'
import { formatDealTelegram, type DealMessageInput } from './templates'

// Sends every alert_event that is due (scheduled_for ≤ now, not yet dispatched) — deals found in this tick
// and ones deferred earlier (quiet hours, digest). Web Push lands in slice 8; Telegram only for now.
//
// Claim before sending so two concurrent ticks never send the same alert twice. A send that fails or has no
// channel is put back in the queue (dispatched_at = null, scheduled_for pushed out) until MAX_ATTEMPTS, so
// alerts are not silently lost — the plan requires every undelivered due alert to be retried.

const MAX_ATTEMPTS = 5
const RETRY_DELAY_MIN = 15

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
  /** Failed and rescheduled for another attempt. */
  retrying: number
  /** Gave up after MAX_ATTEMPTS. */
  givenUp: number
}

interface DueRow extends Record<string, unknown> {
  id: string
  watch_id: string
  user_id: string
  depart_date: string
  amount_vnd: string | number
  carrier: string | null
  deeplink: string | null
  source_found_at: string | Date | null
  score: number
  rules: string[]
  attempts: number
  origin: string
  dest: string
  pax: number
  target_amount_vnd: string | number | null
  telegram_chat_id: string | null
  telegram_blocked_at: string | Date | null
}

function toDealMessage(row: DueRow, now: Date): DealMessageInput {
  return {
    origin: row.origin,
    dest: row.dest,
    departDate: row.depart_date,
    amountVnd: Number(row.amount_vnd),
    carrier: row.carrier,
    pax: row.pax,
    score: row.score,
    rules: row.rules,
    targetAmountVnd: row.target_amount_vnd === null ? null : Number(row.target_amount_vnd),
    sourceFoundAt: row.source_found_at ? new Date(row.source_found_at) : null,
    now,
  }
}

async function claimDue(db: Db, limit: number): Promise<DueRow[]> {
  return db.execute<DueRow>(sql`
    with claimed as (
      update alert_events set dispatched_at = now(), attempts = attempts + 1
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
           c.source_found_at, c.score, c.rules, c.attempts,
           w.origin, w.dest, w.pax, w.target_amount_vnd,
           u.telegram_chat_id, u.telegram_blocked_at
    from claimed c
    join watches w on w.id = c.watch_id
    join users u on u.id = c.user_id`)
}

/** Put a failed alert back in the queue, unless it has been tried too many times. */
async function requeue(db: Db, row: DueRow): Promise<boolean> {
  if (row.attempts >= MAX_ATTEMPTS) return false
  await db
    .update(alertEvents)
    .set({ dispatchedAt: null, scheduledFor: sql`now() + make_interval(mins => ${RETRY_DELAY_MIN})` })
    .where(eq(alertEvents.id, row.id))
  return true
}

export async function dispatchDue(deps: DispatchDeps, limit = 50): Promise<DispatchSummary> {
  const { db } = deps
  const due = await claimDue(db, limit)
  const summary: DispatchSummary = { claimed: due.length, sent: 0, retrying: 0, givenUp: 0 }

  for (const row of due) {
    const chatId = row.telegram_chat_id ?? deps.fallbackChatId
    const blocked = row.telegram_blocked_at !== null
    const unavailable = !deps.telegram ? 'NOT_CONFIGURED' : blocked ? 'BLOCKED' : !chatId ? 'NO_CHAT_ID' : null

    const result = unavailable
      ? ({ ok: false, errorCode: unavailable, blocked } as const)
      : await deps.telegram!.send({
          chatId: chatId!,
          html: formatDealTelegram(toDealMessage(row, deps.now())),
          button: {
            text: 'Xem giá thật',
            url: row.deeplink ?? deps.deeplink({ origin: row.origin, dest: row.dest, date: row.depart_date, pax: row.pax }),
          },
        })

    await db.insert(notifications).values({
      alertEventId: row.id,
      userId: row.user_id,
      channel: 'telegram',
      status: result.ok ? 'sent' : unavailable ? 'skipped' : 'failed',
      providerMsgId: result.ok ? result.providerMsgId : null,
      errorCode: result.ok ? null : result.errorCode,
    })

    if (result.ok) {
      summary.sent++
      await db
        .update(watches)
        .set({ lastNotifiedAt: deps.now(), lastNotifiedAmountVnd: Number(row.amount_vnd) })
        .where(eq(watches.id, row.watch_id))
      continue
    }

    if (result.blocked && !blocked) {
      await db.update(users).set({ telegramBlockedAt: deps.now() }).where(eq(users.id, row.user_id))
    }
    // A blocked user will not become reachable by retrying; anything else might.
    const willRetry = !result.blocked && (await requeue(db, row))
    if (willRetry) summary.retrying++
    else summary.givenUp++
  }
  return summary
}
