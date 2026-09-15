// Vertical slice #0: create the owner user + a watch without the (not yet built) UI and auth.
//   npm run dev:watch -- --route SGN-HAN --target 1500000
// Options: --email (default: first ALLOWED_EMAILS) --route --from --to (YYYY-MM-DD, default: 10th–20th next month)
//          --target (VND) --pax

import { parseArgs } from 'node:util'
import { eq, sql } from 'drizzle-orm'
import { closeDb, db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { env } from '@/lib/env'
import { todayInVietnam } from '@/lib/utils/date'
import { createWatch } from '@/lib/watches/create'

function nextMonthDay(day: number): string {
  const [y, m] = todayInVietnam().split('-').map(Number)
  const d = new Date(Date.UTC(y, m, day)) // month index m = next month
  return d.toISOString().slice(0, 10)
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      route: { type: 'string', default: 'SGN-HAN' },
      from: { type: 'string', default: nextMonthDay(10) },
      to: { type: 'string', default: nextMonthDay(20) },
      target: { type: 'string', default: '1500000' },
      pax: { type: 'string', default: '1' },
    },
  })
  const e = env()
  const email = (values.email ?? e.ALLOWED_EMAILS[0])?.toLowerCase()
  if (!email) throw new Error('Cần --email hoặc ALLOWED_EMAILS trong .env.local')
  const [origin, dest] = values.route.toUpperCase().split('-')

  // Find-or-create the owner (the unique index is on lower(email), which ON CONFLICT via Drizzle cannot target).
  // Until users link Telegram themselves (slice 8), take the chat id from env.
  const [existing] = await db().select().from(users).where(sql`lower(${users.email}) = ${email}`)
  const [user] = existing
    ? await db()
        .update(users)
        .set({ telegramChatId: e.TELEGRAM_CHAT_ID ?? existing.telegramChatId })
        .where(eq(users.id, existing.id))
        .returning()
    : await db()
        .insert(users)
        .values({ email, telegramChatId: e.TELEGRAM_CHAT_ID ?? null })
        .returning()

  const { watch, scanTaskIds } = await createWatch(db(), {
    userId: user.id,
    origin,
    dest,
    dateFrom: values.from,
    dateTo: values.to,
    pax: Number(values.pax),
    targetAmountVnd: Number(values.target),
  })

  console.log(`✔ User ${user.email} (telegram_chat_id: ${user.telegramChatId ?? 'chưa có — sẽ dùng TELEGRAM_CHAT_ID'})`)
  console.log(`✔ Watch ${watch.id}: ${watch.origin}→${watch.dest} ${watch.dateFrom}..${watch.dateTo}, mục tiêu ${watch.targetAmountVnd}₫`)
  console.log(`✔ Gắn ${scanTaskIds.length} scan task — đến hạn quét ngay`)
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(closeDb)
