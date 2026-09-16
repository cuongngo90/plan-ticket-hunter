// Development fixtures (plan §11.8): 3 users with different channels, 6 routes with distinct price
// patterns, 90 days of history, 12 watches. Wipes only the rows it owns, so it is safe to re-run.
//   npm run db:seed:dev
// Refuses to touch a database that looks like production (has real users).

import { eq, inArray, sql } from 'drizzle-orm'
import { closeDb, db } from '@/lib/db'
import { SEED_ROUTES, SEED_USERS, seedSnapshots, seedWatches } from '@/lib/db/data/dev-seed'
import { priceSnapshots, scanTasks, users, type User } from '@/lib/db/schema'
import { addDays, monthOf, todayInVietnam } from '@/lib/utils/date'
import { createWatch } from '@/lib/watches/create'

const SEED_EMAILS = SEED_USERS.map((u) => u.email)

async function main() {
  const today = todayInVietnam()
  const d = db()

  const [{ others }] = await d
    .select({ others: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${users.email} not in ${SEED_EMAILS}`)
  if (others > 0 && !process.argv.includes('--force')) {
    throw new Error(
      `Database có ${others} user không phải dữ liệu seed — có thể là production. Dùng --force nếu chắc chắn.`,
    )
  }

  // Remove the previous seed run (cascades to watches, alerts, notifications).
  await d.delete(users).where(inArray(users.email, SEED_EMAILS))

  const createdUsers: User[] = []
  for (const u of SEED_USERS) {
    const [row] = await d
      .insert(users)
      .values({
        email: u.email,
        name: `Dev ${u.label}`,
        telegramChatId: u.channels === 'push' ? null : `dev-chat-${createdUsers.length + 1}`,
      })
      .returning()
    createdUsers.push(row)
  }

  const watchSpecs = seedWatches(today)
  const scanTaskIds = new Set<string>()
  for (const w of watchSpecs) {
    const { scanTaskIds: ids } = await createWatch(d, {
      userId: createdUsers[w.userIndex].id,
      origin: w.origin,
      dest: w.dest,
      dateFrom: w.dateFrom,
      dateTo: w.dateTo,
      pax: w.pax,
      targetAmountVnd: w.targetAmountVnd,
    })
    ids.forEach((id) => scanTaskIds.add(id))
  }

  // 90 days of price history for the tasks that match the seed routes.
  let snapshots = 0
  for (const route of SEED_ROUTES) {
    const rows = seedSnapshots(route, today)
    for (const month of new Set(rows.map((r) => monthOf(r.departDate)))) {
      const [task] = await d
        .select()
        .from(scanTasks)
        .where(
          sql`${scanTasks.origin} = ${route.origin} and ${scanTasks.dest} = ${route.dest} and ${scanTasks.departMonth} = ${`${month}-01`}`,
        )
      if (!task) continue
      const values = rows
        .filter((r) => monthOf(r.departDate) === month)
        .map((r) => {
          const observedAt = new Date(`${addDays(today, -r.observedDaysAgo)}T03:00:00Z`)
          return {
            scanTaskId: task.id,
            origin: route.origin,
            dest: route.dest,
            departDate: r.departDate,
            amountVnd: r.amountVnd,
            carrier: r.carrier,
            stops: 0,
            observedAt,
            sourceFoundAt: observedAt,
            observationKey: observedAt.toISOString(),
          }
        })
      if (values.length === 0) continue
      const inserted = await d.insert(priceSnapshots).values(values).onConflictDoNothing().returning({ id: priceSnapshots.id })
      snapshots += inserted.length
    }
  }

  // Make one task due right now so `curl /api/cron/scan` has something to do.
  const [first] = await d.select().from(scanTasks).limit(1)
  if (first) await d.update(scanTasks).set({ nextScanAt: sql`now()` }).where(eq(scanTasks.id, first.id))

  console.log(`✔ ${createdUsers.length} user, ${watchSpecs.length} watch, ${scanTaskIds.size} scan task, ${snapshots} snapshot`)
  console.log(`  Kênh: ${SEED_USERS.map((u) => `${u.email} (${u.label})`).join(' · ')}`)
  console.log('  Lưu ý: route_stats được tính ở rollup (slice 7), chưa có ở slice này.')
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(closeDb)
