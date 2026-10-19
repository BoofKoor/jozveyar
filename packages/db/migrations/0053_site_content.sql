CREATE TYPE "public"."site_content_kind" AS ENUM('home', 'faq', 'terms', 'privacy', 'about', 'contact');--> statement-breakpoint
CREATE TABLE "site_content_drafts" (
	"kind" "site_content_kind" PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"base_version" integer NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_content_drafts_content" CHECK (jsonb_typeof("site_content_drafts"."content") = 'object' AND octet_length("site_content_drafts"."content"::text) <= 131072),
	CONSTRAINT "site_content_drafts_times" CHECK ("site_content_drafts"."updated_at" >= "site_content_drafts"."created_at")
);
--> statement-breakpoint
CREATE TABLE "site_content_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "site_content_kind" NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb,
	"restored_from" integer,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_content_versions_content" CHECK ("site_content_versions"."content" IS NULL OR (jsonb_typeof("site_content_versions"."content") = 'object' AND octet_length("site_content_versions"."content"::text) <= 131072)),
	CONSTRAINT "site_content_versions_restored" CHECK ("site_content_versions"."restored_from" IS NULL OR "site_content_versions"."restored_from" >= 0),
	CONSTRAINT "site_content_versions_default" CHECK (("site_content_versions"."content" IS NULL) = ("site_content_versions"."restored_from" IS NOT DISTINCT FROM 0))
);
--> statement-breakpoint
ALTER TABLE "site_content_drafts" ADD CONSTRAINT "site_content_drafts_updated_by_admin_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_content_versions" ADD CONSTRAINT "site_content_versions_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "site_content_versions_version" ON "site_content_versions" USING btree ("kind","version");