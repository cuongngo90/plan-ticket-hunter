CREATE TABLE "airports" (
	"iata" char(3) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"city_vi" text,
	"country_code" char(2) NOT NULL,
	"timezone" text NOT NULL,
	"search_text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp with time zone,
	"image" text,
	"quiet_hours_start" smallint DEFAULT 22 NOT NULL,
	"quiet_hours_end" smallint DEFAULT 7 NOT NULL,
	"max_alerts_per_day" smallint DEFAULT 5 NOT NULL,
	"max_active_watches" smallint DEFAULT 5 NOT NULL,
	"telegram_chat_id" text,
	"telegram_blocked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "airports_search_trgm_idx" ON "airports" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));