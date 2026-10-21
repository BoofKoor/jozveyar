CREATE TYPE "public"."site_page_kind" AS ENUM('landing', 'tariff');--> statement-breakpoint
CREATE TYPE "public"."site_page_removal" AS ENUM('gone', 'moved');--> statement-breakpoint
CREATE TABLE "site_page_drafts" (
	"page_id" integer PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"base_version" integer NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_page_drafts_content" CHECK (jsonb_typeof("site_page_drafts"."content") = 'object' AND octet_length("site_page_drafts"."content"::text) <= 131072),
	CONSTRAINT "site_page_drafts_times" CHECK ("site_page_drafts"."updated_at" >= "site_page_drafts"."created_at")
);
--> statement-breakpoint
CREATE TABLE "site_page_slugs" (
	"slug" text PRIMARY KEY NOT NULL,
	"page_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_page_slugs_shape" CHECK ("site_page_slugs"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("site_page_slugs"."slug") BETWEEN 2 AND 60),
	CONSTRAINT "site_page_slugs_reserved" CHECK ("site_page_slugs"."slug" NOT IN ('about', 'admin', 'api', 'apple-icon', 'articles', 'chap-jozve', 'contact', 'favicon', 'fonts', 'icon', 'icons', 'img', 'manifest', 'media', 'opengraph-image', 'order', 'orders', 'pay', 'preview', 'privacy', 'robots', 'sitemap', 'tarefe', 'terms'))
);
--> statement-breakpoint
CREATE TABLE "site_page_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_id" integer NOT NULL,
	"version" integer NOT NULL,
	"slug" text NOT NULL,
	"content" jsonb,
	"restored_from" integer,
	"removal" "site_page_removal",
	"moved_to" integer,
	"live_from" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_page_versions_number" CHECK ("site_page_versions"."version" >= 1),
	CONSTRAINT "site_page_versions_content" CHECK ("site_page_versions"."content" IS NULL OR (jsonb_typeof("site_page_versions"."content") = 'object' AND octet_length("site_page_versions"."content"::text) <= 131072)),
	CONSTRAINT "site_page_versions_shape" CHECK (("site_page_versions"."restored_from" IS NULL OR "site_page_versions"."restored_from" >= 0)
          AND ("site_page_versions"."content" IS NOT NULL OR "site_page_versions"."removal" IS NOT NULL OR "site_page_versions"."restored_from" IS NOT DISTINCT FROM 0)
          AND ("site_page_versions"."removal" IS NULL OR ("site_page_versions"."content" IS NULL AND "site_page_versions"."restored_from" IS NULL))
          AND ("site_page_versions"."restored_from" IS DISTINCT FROM 0 OR "site_page_versions"."content" IS NULL)
          AND ("site_page_versions"."moved_to" IS NULL OR ("site_page_versions"."removal" = 'moved' AND "site_page_versions"."moved_to" <> "site_page_versions"."page_id"))),
	CONSTRAINT "site_page_versions_times" CHECK ("site_page_versions"."live_from" >= "site_page_versions"."created_at"
          AND ("site_page_versions"."withdrawn_at" IS NULL) = ("site_page_versions"."withdrawn_by" IS NULL)
          AND ("site_page_versions"."withdrawn_at" IS NULL OR ("site_page_versions"."withdrawn_at" >= "site_page_versions"."created_at" AND "site_page_versions"."withdrawn_at" < "site_page_versions"."live_from")))
);
--> statement-breakpoint
CREATE TABLE "site_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "site_page_kind" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_page_drafts" ADD CONSTRAINT "site_page_drafts_page_id_site_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."site_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_page_drafts" ADD CONSTRAINT "site_page_drafts_updated_by_admin_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_page_slugs" ADD CONSTRAINT "site_page_slugs_page_id_site_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."site_pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_page_versions" ADD CONSTRAINT "site_page_versions_page_id_site_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."site_pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_page_versions" ADD CONSTRAINT "site_page_versions_moved_to_site_pages_id_fk" FOREIGN KEY ("moved_to") REFERENCES "public"."site_pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_page_versions" ADD CONSTRAINT "site_page_versions_withdrawn_by_admin_users_id_fk" FOREIGN KEY ("withdrawn_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_page_versions" ADD CONSTRAINT "site_page_versions_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_pages" ADD CONSTRAINT "site_pages_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_page_slugs_page" ON "site_page_slugs" USING btree ("page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_page_versions_version" ON "site_page_versions" USING btree ("page_id","version");--> statement-breakpoint
CREATE INDEX "site_page_versions_slug" ON "site_page_versions" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "site_pages_one_tariff" ON "site_pages" USING btree ("kind") WHERE "site_pages"."kind" = 'tariff';