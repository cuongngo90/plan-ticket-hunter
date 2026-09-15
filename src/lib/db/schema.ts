import { sql } from 'drizzle-orm'
import { char, index, pgTable, smallint, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

// Phase 1 tables. The rest of the model (scan_tasks, watches, price_snapshots, …) lands in Phase 2 slice 1.

/** Column names follow the Auth.js Drizzle adapter's `users` table so the adapter can use it as-is in Phase 2. */
export const users = pgTable(
  'users',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text('name'),
    email: text('email').notNull(),
    emailVerified: timestamp('emailVerified', { mode: 'date', withTimezone: true }),
    image: text('image'),

    // preferences
    quietHoursStart: smallint('quiet_hours_start').notNull().default(22),
    quietHoursEnd: smallint('quiet_hours_end').notNull().default(7),
    maxAlertsPerDay: smallint('max_alerts_per_day').notNull().default(5),
    maxActiveWatches: smallint('max_active_watches').notNull().default(5),

    // Telegram channel
    telegramChatId: text('telegram_chat_id'),
    telegramBlockedAt: timestamp('telegram_blocked_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_lower_idx').on(sql`lower(${t.email})`)],
)

export const airports = pgTable(
  'airports',
  {
    iata: char('iata', { length: 3 }).primaryKey(),
    name: text('name').notNull(),
    city: text('city').notNull(),
    cityVi: text('city_vi'),
    countryCode: char('country_code', { length: 2 }).notNull(),
    timezone: text('timezone').notNull(),
    /** normalizeSearch(iata + name + city + city_vi) — see lib/utils/text.ts */
    searchText: text('search_text').notNull(),
  },
  (t) => [index('airports_search_trgm_idx').using('gin', t.searchText.op('gin_trgm_ops'))],
)

export type User = typeof users.$inferSelect
export type Airport = typeof airports.$inferSelect
export type NewAirport = typeof airports.$inferInsert
