CREATE TYPE "public"."bot_item_status" AS ENUM('new', 'processing', 'screened_out', 'rejected', 'duplicate', 'queued', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."comment_status" AS ENUM('visible', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."location_precision" AS ENUM('exact', 'street', 'neighborhood', 'district', 'city', 'region', 'country', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."news_origin" AS ENUM('user', 'bot', 'admin');--> statement-breakpoint
CREATE TYPE "public"."news_relation" AS ENUM('update', 'correction', 'development');--> statement-breakpoint
CREATE TYPE "public"."news_status" AS ENUM('pending', 'published', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."point_action" AS ENUM('report_published', 'verification_approved', 'comment_posted', 'comment_removed', 'bonus', 'penalty');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('rss', 'x', 'web');--> statement-breakpoint
CREATE TYPE "public"."source_trust" AS ENUM('official', 'media', 'community');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name_tr" text NOT NULL,
	"name_en" text NOT NULL,
	"ai_hint" text,
	"color" text NOT NULL,
	"icon" text NOT NULL,
	"is_sensitive" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"news_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"status" "comment_status" DEFAULT 'visible' NOT NULL,
	"hidden_reason" text,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"status" "news_status" DEFAULT 'pending' NOT NULL,
	"origin" "news_origin" NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"content" text,
	"category_id" uuid NOT NULL,
	"location_label" text NOT NULL,
	"location_mention" text,
	"province" text,
	"district" text,
	"neighborhood" text,
	"street" text,
	"precision" "location_precision" DEFAULT 'unknown' NOT NULL,
	"location_confidence" real,
	"latitude" double precision,
	"longitude" double precision,
	"public_latitude" double precision,
	"public_longitude" double precision,
	"public_precision" "location_precision" DEFAULT 'unknown' NOT NULL,
	"location_notes" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"source_id" uuid,
	"source_url" text,
	"source_external_id" text,
	"image_url" text,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"editorial_score" real,
	"editorial_confidence" real,
	"is_sensitive" boolean DEFAULT false NOT NULL,
	"sensitivity_type" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"ai_analysis" jsonb,
	"dedupe_key" text,
	"parent_id" uuid,
	"relation" "news_relation",
	"suggested_parent_id" uuid,
	"suggested_parent_confidence" real,
	"suggested_parent_reason" text,
	"submitted_by_id" text,
	"reviewed_by_id" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"rejection_reason" text,
	"view_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"citation_count" integer DEFAULT 0 NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_slug_unique" UNIQUE("slug"),
	CONSTRAINT "news_dedupeKey_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "news_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"news_id" uuid NOT NULL,
	"source_id" uuid,
	"url" text NOT NULL,
	"title" text,
	"publisher_name" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_views" (
	"news_id" uuid NOT NULL,
	"day" text NOT NULL,
	"visitor_hash" text NOT NULL,
	CONSTRAINT "news_views_news_id_day_visitor_hash_pk" PRIMARY KEY("news_id","day","visitor_hash")
);
--> statement-breakpoint
CREATE TABLE "point_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"action" "point_action" NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"reference_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "source_kind" NOT NULL,
	"name" text NOT NULL,
	"handle" text,
	"url" text,
	"homepage_url" text,
	"logo_url" text,
	"description" text,
	"trust" "source_trust" DEFAULT 'media' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"poll_interval_minutes" integer DEFAULT 15 NOT NULL,
	"max_items_per_poll" integer DEFAULT 20 NOT NULL,
	"auto_publish" boolean DEFAULT false NOT NULL,
	"keyword_filter" text[] DEFAULT '{}'::text[] NOT NULL,
	"external_id" text,
	"cursor" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"next_poll_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_polled_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"fail_streak" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_bans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"banned_by_id" text,
	"expires_at" timestamp with time zone,
	"lifted_at" timestamp with time zone,
	"lifted_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"bio" text,
	"points" integer DEFAULT 0 NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL,
	"published_report_count" integer DEFAULT 0 NOT NULL,
	"verification_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"preferred_category_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"home_latitude" double precision,
	"home_longitude" double precision,
	"home_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"news_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"address" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"note" text,
	"evidence_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "verification_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by_id" text,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"code" text NOT NULL,
	"message" text,
	"source_id" uuid,
	"item_id" uuid,
	"news_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" numeric(12, 6),
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"url" text,
	"title" text,
	"body" text NOT NULL,
	"author" text,
	"published_at" timestamp with time zone,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"status" "bot_item_status" DEFAULT 'new' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"rejection_reason" text,
	"analysis" jsonb,
	"geocode" jsonb,
	"parent_suggestion" jsonb,
	"news_id" uuid,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geocode_cache" (
	"query_key" text PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"provider" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"display_name" text,
	"precision" "location_precision",
	"result" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_news_id_news_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news" ADD CONSTRAINT "news_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news" ADD CONSTRAINT "news_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news" ADD CONSTRAINT "news_parent_id_news_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."news"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news" ADD CONSTRAINT "news_suggested_parent_id_news_id_fk" FOREIGN KEY ("suggested_parent_id") REFERENCES "public"."news"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news" ADD CONSTRAINT "news_submitted_by_id_user_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news" ADD CONSTRAINT "news_reviewed_by_id_user_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_citations" ADD CONSTRAINT "news_citations_news_id_news_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_citations" ADD CONSTRAINT "news_citations_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_views" ADD CONSTRAINT "news_views_news_id_news_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_banned_by_id_user_id_fk" FOREIGN KEY ("banned_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_lifted_by_id_user_id_fk" FOREIGN KEY ("lifted_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_news_id_news_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_reviewed_by_id_user_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_items" ADD CONSTRAINT "bot_items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_items" ADD CONSTRAINT "bot_items_news_id_news_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "comments_news_created_idx" ON "comments" USING btree ("news_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "comments_user_idx" ON "comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "news_status_occurred_idx" ON "news" USING btree ("status","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "news_status_created_idx" ON "news" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "news_public_position_idx" ON "news" USING btree ("public_latitude","public_longitude");--> statement-breakpoint
CREATE INDEX "news_category_idx" ON "news" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "news_parent_idx" ON "news" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "news_source_external_idx" ON "news" USING btree ("source_id","source_external_id");--> statement-breakpoint
CREATE INDEX "news_submitted_by_idx" ON "news" USING btree ("submitted_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "news_citations_news_url_key" ON "news_citations" USING btree ("news_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "point_transactions_reference_key" ON "point_transactions" USING btree ("user_id","action","reference_id");--> statement-breakpoint
CREATE INDEX "point_transactions_user_created_idx" ON "point_transactions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "sources_kind_handle_key" ON "sources" USING btree ("kind","handle") WHERE "sources"."handle" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "sources_kind_url_key" ON "sources" USING btree ("kind","url") WHERE "sources"."url" is not null and "sources"."kind" <> 'x';--> statement-breakpoint
CREATE INDEX "sources_due_idx" ON "sources" USING btree ("is_active","next_poll_at");--> statement-breakpoint
CREATE INDEX "user_bans_user_idx" ON "user_bans" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "verifications_news_user_key" ON "verifications" USING btree ("news_id","user_id");--> statement-breakpoint
CREATE INDEX "verifications_status_created_idx" ON "verifications" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "bot_events_created_idx" ON "bot_events" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bot_events_item_idx" ON "bot_events" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "bot_events_code_created_idx" ON "bot_events" USING btree ("code","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "bot_items_source_external_key" ON "bot_items" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "bot_items_queue_idx" ON "bot_items" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "bot_items_created_idx" ON "bot_items" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bot_items_hash_idx" ON "bot_items" USING btree ("content_hash");