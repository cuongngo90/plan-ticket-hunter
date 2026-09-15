import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/lib/db'
import { scanTasks, watchScanTasks, watches, type Watch } from '@/lib/db/schema'
import { daysBetween, monthsInRange, todayInVietnam } from '@/lib/utils/date'

const iata = z.string().regex(/^[A-Z]{3}$/, 'Mã sân bay phải là 3 chữ in hoa (vd. SGN)')
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
const MAX_RANGE_DAYS = 62

export const createWatchInput = z
  .object({
    userId: z.string().min(1),
    origin: iata,
    dest: iata,
    dateFrom: isoDate,
    dateTo: isoDate,
    pax: z.number().int().min(1).max(9).default(1),
    targetAmountVnd: z.number().int().positive().nullable().default(null),
  })
  .refine((w) => w.origin !== w.dest, { message: 'Điểm đi và điểm đến phải khác nhau', path: ['dest'] })
  .refine((w) => w.dateFrom <= w.dateTo, { message: 'Ngày bắt đầu phải trước ngày kết thúc', path: ['dateTo'] })
  .refine((w) => daysBetween(w.dateFrom, w.dateTo) <= MAX_RANGE_DAYS, {
    message: `Khoảng ngày tối đa ${MAX_RANGE_DAYS} ngày`,
    path: ['dateTo'],
  })

export type CreateWatchInput = z.input<typeof createWatchInput>

/**
 * Create a watch and link it to one scan task per month in its range (plan §3: scan unit = route × month).
 * Linking re-activates an idle/done task and makes it due now, so the first scan happens on the next tick.
 */
export async function createWatch(db: Db, raw: CreateWatchInput, now = new Date()): Promise<{ watch: Watch; scanTaskIds: string[] }> {
  const input = createWatchInput.parse(raw)
  if (input.dateTo <= todayInVietnam(now)) throw new Error('Khoảng ngày đã qua')

  return db.transaction(async (tx) => {
    const [watch] = await tx
      .insert(watches)
      .values({
        userId: input.userId,
        origin: input.origin,
        dest: input.dest,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        pax: input.pax,
        targetAmountVnd: input.targetAmountVnd,
        expiresAt: new Date(`${input.dateTo}T23:59:59+07:00`),
      })
      .returning()

    const scanTaskIds: string[] = []
    for (const month of monthsInRange(input.dateFrom, input.dateTo)) {
      const [task] = await tx
        .insert(scanTasks)
        .values({ origin: input.origin, dest: input.dest, departMonth: `${month}-01` })
        .onConflictDoUpdate({
          target: [scanTasks.origin, scanTasks.dest, scanTasks.departMonth],
          set: {
            status: 'active',
            // keep the schedule of an already-active task; wake an idle/done one now
            nextScanAt: sql`case when ${scanTasks.status} = 'active' then ${scanTasks.nextScanAt} else now() end`,
          },
        })
        .returning({ id: scanTasks.id })
      await tx.insert(watchScanTasks).values({ watchId: watch.id, scanTaskId: task.id }).onConflictDoNothing()
      scanTaskIds.push(task.id)
    }
    return { watch, scanTaskIds }
  })
}
