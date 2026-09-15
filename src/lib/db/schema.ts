import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// Data model: docs/plan/ke-hoach-san-ve.md §3. Still to come: route_stats, push_subscriptions,
// telegram_link_tokens, provider_cache, provider_quota_usage (later Phase 2 slices).

const tstz = (name: string) => timestamp(name, { withTimezone: true })
const vnd = (name: string) => bigint(name, { mode: 'number' }) // VND has no minor unit; < 2^53 by far

/** Column names follow the Auth.js Drizzle adapter's `users` table so the adapter can use it as-is. */
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
    telegramBlockedAt: tstz('telegram_blocked_at'),

    createdAt: tstz('created_at').notNull().defaultNow(),
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

export const scanTaskStatus = pgEnum('scan_task_status', ['active', 'idle', 'done'])

/** The unit of scanning: one route × departure month (1 adult, economy), shared by every watch on it. */
export const scanTasks = pgTable(
  'scan_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    origin: char('origin', { length: 3 }).notNull(),
    dest: char('dest', { length: 3 }).notNull(),
    /** First day of the month. */
    departMonth: date('depart_month').notNull(),
    status: scanTaskStatus('status').notNull().default('active'),
    nextScanAt: tstz('next_scan_at').notNull().defaultNow(),
    leasedUntil: tstz('leased_until'),
    leaseId: uuid('lease_id'),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    lastScannedAt: tstz('last_scanned_at'),
    lastError: text('last_error'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('scan_tasks_route_month_idx').on(t.origin, t.dest, t.departMonth),
    index('scan_tasks_due_idx').on(t.nextScanAt).where(sql`${t.status} = 'active'`),
  ],
)

/** A user's intent. Only a filter over snapshots — never scanned on its own. */
export const watches = pgTable(
  'watches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    origin: char('origin', { length: 3 }).notNull(),
    dest: char('dest', { length: 3 }).notNull(),
    dateFrom: date('date_from').notNull(),
    dateTo: date('date_to').notNull(),
    pax: smallint('pax').notNull().default(1),
    targetAmountVnd: vnd('target_amount_vnd'),
    dropThresholdPct: real('drop_threshold_pct').notNull().default(0.15),
    minDealScore: smallint('min_deal_score').notNull().default(50),
    cooldownHours: smallint('cooldown_hours').notNull().default(12),
    /** Deal episode: bumps when the price rebounds, so the watch can alert again (plan §5). */
    episodeNo: integer('episode_no').notNull().default(0),
    lastNotifiedAt: tstz('last_notified_at'),
    lastNotifiedAmountVnd: vnd('last_notified_amount_vnd'),
    active: boolean('active').notNull().default(true),
    pausedReason: text('paused_reason'),
    expiresAt: tstz('expires_at'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('watches_route_active_idx').on(t.origin, t.dest).where(sql`${t.active}`),
    index('watches_user_created_idx').on(t.userId, t.createdAt),
  ],
)

/** N-N: a watch whose date range spans two months is linked to two tasks. */
export const watchScanTasks = pgTable(
  'watch_scan_tasks',
  {
    watchId: uuid('watch_id')
      .notNull()
      .references(() => watches.id, { onDelete: 'cascade' }),
    scanTaskId: uuid('scan_task_id')
      .notNull()
      .references(() => scanTasks.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.watchId, t.scanTaskId] }), index('watch_scan_tasks_task_idx').on(t.scanTaskId)],
)

/** One row per real observation of the cheapest price for (task, departure date). */
export const priceSnapshots = pgTable(
  'price_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    scanTaskId: uuid('scan_task_id')
      .notNull()
      .references(() => scanTasks.id, { onDelete: 'cascade' }),
    origin: char('origin', { length: 3 }).notNull(),
    dest: char('dest', { length: 3 }).notNull(),
    departDate: date('depart_date').notNull(),
    amountVnd: vnd('amount_vnd').notNull(),
    carrier: text('carrier'),
    stops: smallint('stops'),
    deeplink: text('deeplink'),
    observedAt: tstz('observed_at').notNull().defaultNow(),
    sourceFoundAt: tstz('source_found_at').notNull(),
    /** = source_found_at for cache providers: re-reading the same cached price must not add a sample. */
    observationKey: text('observation_key').notNull(),
  },
  (t) => [
    uniqueIndex('price_snapshots_observation_idx').on(t.scanTaskId, t.departDate, t.observationKey),
    index('price_snapshots_route_date_idx').on(t.origin, t.dest, t.departDate, t.observedAt.desc()),
    index('price_snapshots_observed_brin').using('brin', t.observedAt),
  ],
)

/** A detected deal, separate from delivery. The unique dedupe_key is the last line of defence against spam. */
export const alertEvents = pgTable(
  'alert_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    watchId: uuid('watch_id')
      .notNull()
      .references(() => watches.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    departDate: date('depart_date').notNull(),
    amountVnd: vnd('amount_vnd').notNull(),
    carrier: text('carrier'),
    deeplink: text('deeplink'),
    sourceFoundAt: tstz('source_found_at'),
    score: smallint('score').notNull(),
    rules: jsonb('rules').$type<string[]>().notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    scheduledFor: tstz('scheduled_for').notNull().defaultNow(),
    dispatchedAt: tstz('dispatched_at'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('alert_events_dedupe_idx').on(t.dedupeKey),
    index('alert_events_pending_idx').on(t.scheduledFor).where(sql`${t.dispatchedAt} is null`),
  ],
)

export const notificationChannel = pgEnum('notification_channel', ['web_push', 'telegram'])
export const notificationStatus = pgEnum('notification_status', ['sent', 'failed', 'skipped'])

/** Delivery log: one row per channel attempt. */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    alertEventId: uuid('alert_event_id').references(() => alertEvents.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: notificationChannel('channel').notNull(),
    status: notificationStatus('status').notNull(),
    providerMsgId: text('provider_msg_id'),
    errorCode: text('error_code'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [index('notifications_user_sent_idx').on(t.userId, t.createdAt.desc()).where(sql`${t.status} = 'sent'`)],
)

export type User = typeof users.$inferSelect
export type Airport = typeof airports.$inferSelect
export type NewAirport = typeof airports.$inferInsert
export type ScanTask = typeof scanTasks.$inferSelect
export type Watch = typeof watches.$inferSelect
export type PriceSnapshot = typeof priceSnapshots.$inferSelect
export type AlertEvent = typeof alertEvents.$inferSelect
