// Integration: real Postgres, migrated schema. Run with TEST_DATABASE_URL set:
//   TEST_DATABASE_URL=postgres://… npm run test:int
// Never point it at production — it creates and deletes its own rows, but still.

import { drizzle } from 'drizzle-orm/postgres-js'
import { eq, inArray, sql } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import type { TelegramMessage, TelegramSender } from '@/lib/notifications/channels/telegram'
import { MockProvider } from '@/lib/providers/mock'
import { addDays, todayInVietnam } from '@/lib/utils/date'
import { createWatch } from '@/lib/watches/create'
import { completeTask, leaseDueTasks } from './scheduler'
import { runScanTick, type TickDeps } from './tick'

const url = process.env.TEST_DATABASE_URL
const client = url ? postgres(url, { prepare: false, max: 4 }) : undefined
const db = (client ? drizzle(client, { schema }) : undefined) as Db

const runId = Math.random().toString(36).slice(2, 8)
const createdUsers: string[] = []
const createdTasks: string[] = []

// Each test uses routes nobody else uses, so a shared database cannot interfere.
const ROUTE = { origin: 'CXR', dest: 'VCS' }

class FakeTelegram implements TelegramSender {
  sent: TelegramMessage[] = []
  async send(m: TelegramMessage) {
    this.sent.push(m)
    return { ok: true as const, providerMsgId: String(this.sent.length) }
  }
}

async function makeUser() {
  const [u] = await db
    .insert(schema.users)
    .values({ email: `int-${runId}-${createdUsers.length}@test.local`, telegramChatId: '999' })
    .returning()
  createdUsers.push(u.id)
  return u
}

describe.skipIf(!url)('scan tick against Postgres', () => {
  beforeAll(async () => {
    // start from a clean slate for our routes (a previous crashed run may have left rows)
    await db.delete(schema.scanTasks).where(eq(schema.scanTasks.origin, ROUTE.origin))
  })

  afterAll(async () => {
    if (createdUsers.length) await db.delete(schema.users).where(inArray(schema.users.id, createdUsers))
    if (createdTasks.length) await db.delete(schema.scanTasks).where(inArray(schema.scanTasks.id, createdTasks))
    await db.delete(schema.scanTasks).where(eq(schema.scanTasks.origin, ROUTE.origin))
    await client?.end()
  })

  it('vertical slice #0: watch → scan → deal → exactly one Telegram message, and a rescan adds nothing', async () => {
    const fixedNow = new Date()
    const today = todayInVietnam(fixedNow)
    const user = await makeUser()
    const { scanTaskIds } = await createWatch(db, {
      userId: user.id,
      ...ROUTE,
      dateFrom: addDays(today, 20),
      dateTo: addDays(today, 30),
      targetAmountVnd: 5_000_000, // any mock fare is below → guaranteed ABSOLUTE deal
    })
    createdTasks.push(...scanTaskIds)

    const telegram = new FakeTelegram()
    const deps: TickDeps = {
      db,
      provider: new MockProvider({ now: () => fixedNow }),
      telegram,
      now: () => fixedNow,
      tickBudget: 50,
    }

    const first = await runScanTick(deps)
    expect(first.errors).toEqual([])
    expect(first.alertsCreated).toBe(1)
    expect(first.dispatch.sent).toBe(1)
    expect(telegram.sent).toHaveLength(1)
    expect(telegram.sent[0].chatId).toBe('999')
    expect(telegram.sent[0].html).toContain('CXR → VCS')
    expect(first.snapshotsInserted).toBeGreaterThan(0)

    const [w] = await db.select().from(schema.watches).where(eq(schema.watches.userId, user.id))
    expect(w.lastNotifiedAmountVnd).not.toBeNull()
    const sentRows = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, user.id))
    expect(sentRows.map((r) => r.status)).toEqual(['sent'])

    // Make the tasks due again and rescan with the same observation window.
    await db.update(schema.scanTasks).set({ nextScanAt: sql`now()` }).where(inArray(schema.scanTasks.id, scanTaskIds))
    const second = await runScanTick(deps)
    expect(second.snapshotsInserted).toBe(0) // same foundAt → observation_key dedupe
    expect(second.alertsCreated).toBe(0) // same dedupe_key → ON CONFLICT DO NOTHING
    expect(telegram.sent).toHaveLength(1)
  })

  it('two concurrent leases never return the same task', async () => {
    const months = ['2031-01-01', '2031-02-01', '2031-03-01', '2031-04-01', '2031-05-01', '2031-06-01']
    const tasks = await db
      .insert(schema.scanTasks)
      .values(months.map((departMonth) => ({ ...ROUTE, departMonth })))
      .returning({ id: schema.scanTasks.id })
    const ids = new Set(tasks.map((t) => t.id))
    createdTasks.push(...ids)

    const [a, b] = await Promise.all([leaseDueTasks(db, 100), leaseDueTasks(db, 100)])
    const mine = (xs: { id: string }[]) => xs.map((x) => x.id).filter((id) => ids.has(id))
    const leasedA = mine(a)
    const leasedB = mine(b)
    expect(leasedA.filter((id) => leasedB.includes(id))).toEqual([])
    expect(new Set([...leasedA, ...leasedB]).size).toBe(ids.size)
  })

  it('a worker whose lease expired cannot complete the task', async () => {
    const [task] = await db
      .insert(schema.scanTasks)
      .values({ ...ROUTE, departMonth: '2032-01-01' })
      .returning({ id: schema.scanTasks.id })
    createdTasks.push(task.id)

    const [first] = (await leaseDueTasks(db, 100)).filter((t) => t.id === task.id)
    // simulate the first worker dying: its lease expires and another worker takes over
    await db.update(schema.scanTasks).set({ leasedUntil: sql`now() - interval '1 minute'` }).where(eq(schema.scanTasks.id, task.id))
    const [second] = (await leaseDueTasks(db, 100)).filter((t) => t.id === task.id)
    expect(second.leaseId).not.toBe(first.leaseId)

    expect(await completeTask(db, first, { ok: true, nextScanAt: new Date() })).toBe(false)
    expect(await completeTask(db, second, { ok: true, nextScanAt: new Date() })).toBe(true)
  })
})
