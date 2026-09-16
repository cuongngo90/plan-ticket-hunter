// Integration: query helpers against a real Postgres (TEST_DATABASE_URL; skipped without it).

import { drizzle } from 'drizzle-orm/postgres-js'
import { eq, inArray } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { addDays, todayInVietnam } from '@/lib/utils/date'
import { createWatch } from '@/lib/watches/create'
import { searchAirports } from './airports'
import { countActiveWatches, listWatchesForUser } from './watches'

const url = process.env.TEST_DATABASE_URL
const client = url ? postgres(url, { prepare: false, max: 2 }) : undefined
const db = (client ? drizzle(client, { schema }) : undefined) as Db

const runId = Math.random().toString(36).slice(2, 8)
const createdUsers: string[] = []
const ROUTE = { origin: 'VKG', dest: 'CAH' } // quiet routes no other test uses

describe.skipIf(!url)('db queries', () => {
  afterAll(async () => {
    if (createdUsers.length) await db.delete(schema.users).where(inArray(schema.users.id, createdUsers))
    await db.delete(schema.scanTasks).where(eq(schema.scanTasks.origin, ROUTE.origin))
    await client?.end()
  })

  it('searchAirports matches IATA, Vietnamese names and accent-free typing', async () => {
    expect((await searchAirports(db, 'DAD'))[0].iata).toBe('DAD')
    expect((await searchAirports(db, 'Đà Nẵng'))[0].iata).toBe('DAD')
    expect((await searchAirports(db, 'da nang'))[0].iata).toBe('DAD')
    expect((await searchAirports(db, 'sai gon'))[0].iata).toBe('SGN')
    expect(await searchAirports(db, 'zzzzzz')).toEqual([])
    expect(await searchAirports(db, '', 3)).toHaveLength(3)
  })

  it('listWatchesForUser returns the best price in range and the sample count', async () => {
    const today = todayInVietnam()
    const [user] = await db
      .insert(schema.users)
      .values({ email: `q-${runId}@test.local` })
      .returning()
    createdUsers.push(user.id)

    const { watch, scanTaskIds } = await createWatch(db, {
      userId: user.id,
      ...ROUTE,
      dateFrom: addDays(today, 10),
      dateTo: addDays(today, 20),
      targetAmountVnd: 1_000_000,
    })

    const observedAt = new Date()
    await db.insert(schema.priceSnapshots).values([
      {
        scanTaskId: scanTaskIds[0],
        ...ROUTE,
        departDate: addDays(today, 12),
        amountVnd: 900_000,
        sourceFoundAt: observedAt,
        observationKey: `${observedAt.toISOString()}-a`,
      },
      {
        scanTaskId: scanTaskIds[0],
        ...ROUTE,
        departDate: addDays(today, 15),
        amountVnd: 700_000, // cheapest, still inside the range
        sourceFoundAt: observedAt,
        observationKey: `${observedAt.toISOString()}-b`,
      },
      {
        scanTaskId: scanTaskIds[0],
        ...ROUTE,
        departDate: addDays(today, 40), // outside the watch range
        amountVnd: 100_000,
        sourceFoundAt: observedAt,
        observationKey: `${observedAt.toISOString()}-c`,
      },
    ])

    const [row] = await listWatchesForUser(db, user.id)
    expect(row.id).toBe(watch.id)
    expect(row.bestAmountVnd).toBe(700_000)
    expect(row.bestDepartDate).toBe(addDays(today, 15))
    expect(row.sampleCount).toBe(2) // the out-of-range date is not counted
    expect(await countActiveWatches(db, user.id)).toBe(1)
  })
})
