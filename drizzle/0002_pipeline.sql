CREATE TYPE "public"."notification_channel" AS ENUM('web_push', 'telegram');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."scan_task_status" AS ENUM('active', 'idle', 'done');--> statement-breakpoint
CREATE TABLE "alert_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watch_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"depart_date" date NOT NULL,
	"amount_vnd" bigint NOT NULL,
	"carrier" text,
	"deeplink" text,
	"source_found_at" timestamp with time zone,
	"score" smallint NOT NULL,
	"rules" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_event_id" uuid,
	"user_id" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"status" "notification_status" NOT NULL,
	"provider_msg_id" text,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"scan_task_id" uuid NOT NULL,
	"origin" char(3) NOT NULL,
	"dest" char(3) NOT NULL,
	"depart_date" date NOT NULL,
	"amount_vnd" bigint NOT NULL,
	"carrier" text,
	"stops" smallint,
	"deeplink" text,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_found_at" timestamp with time zone NOT NULL,
	"observation_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin" char(3) NOT NULL,
	"dest" char(3) NOT NULL,
	"depart_month" date NOT NULL,
	"status" "scan_task_status" DEFAULT 'active' NOT NULL,
	"next_scan_at" timestamp with time zone DEFAULT now() NOT NULL,
	"leased_until" timestamp with time zone,
	"lease_id" uuid,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_scanned_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watch_scan_tasks" (
	"watch_id" uuid NOT NULL,
	"scan_task_id" uuid NOT NULL,
	CONSTRAINT "watch_scan_tasks_watch_id_scan_task_id_pk" PRIMARY KEY("watch_id","scan_task_id")
);
--> statement-breakpoint
CREATE TABLE "watches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"origin" char(3) NOT NULL,
	"dest" char(3) NOT NULL,
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"pax" smallint DEFAULT 1 NOT NULL,
	"target_amount_vnd" bigint,
	"drop_threshold_pct" real DEFAULT 0.15 NOT NULL,
	"min_deal_score" smallint DEFAULT 50 NOT NULL,
	"cooldown_hours" smallint DEFAULT 12 NOT NULL,
	"episode_no" integer DEFAULT 0 NOT NULL,
	"last_notified_at" timestamp with time zone,
	"last_notified_amount_vnd" bigint,
	"active" boolean DEFAULT true NOT NULL,
	"paused_reason" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_watch_id_watches_id_fk" FOREIGN KEY ("watch_id") REFERENCES "public"."watches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alert_event_id_alert_events_id_fk" FOREIGN KEY ("alert_event_id") REFERENCES "public"."alert_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_scan_task_id_scan_tasks_id_fk" FOREIGN KEY ("scan_task_id") REFERENCES "public"."scan_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_scan_tasks" ADD CONSTRAINT "watch_scan_tasks_watch_id_watches_id_fk" FOREIGN KEY ("watch_id") REFERENCES "public"."watches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_scan_tasks" ADD CONSTRAINT "watch_scan_tasks_scan_task_id_scan_tasks_id_fk" FOREIGN KEY ("scan_task_id") REFERENCES "public"."scan_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watches" ADD CONSTRAINT "watches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_events_dedupe_idx" ON "alert_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "alert_events_pending_idx" ON "alert_events" USING btree ("scheduled_for") WHERE "alert_events"."dispatched_at" is null;--> statement-breakpoint
CREATE INDEX "notifications_user_sent_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST) WHERE "notifications"."status" = 'sent';--> statement-breakpoint
CREATE UNIQUE INDEX "price_snapshots_observation_idx" ON "price_snapshots" USING btree ("scan_task_id","depart_date","observation_key");--> statement-breakpoint
CREATE INDEX "price_snapshots_route_date_idx" ON "price_snapshots" USING btree ("origin","dest","depart_date","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "price_snapshots_observed_brin" ON "price_snapshots" USING brin ("observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scan_tasks_route_month_idx" ON "scan_tasks" USING btree ("origin","dest","depart_month");--> statement-breakpoint
CREATE INDEX "scan_tasks_due_idx" ON "scan_tasks" USING btree ("next_scan_at") WHERE "scan_tasks"."status" = 'active';--> statement-breakpoint
CREATE INDEX "watch_scan_tasks_task_idx" ON "watch_scan_tasks" USING btree ("scan_task_id");--> statement-breakpoint
CREATE INDEX "watches_route_active_idx" ON "watches" USING btree ("origin","dest") WHERE "watches"."active";--> statement-breakpoint
CREATE INDEX "watches_user_created_idx" ON "watches" USING btree ("user_id","created_at");