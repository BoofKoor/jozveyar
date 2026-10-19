CREATE TYPE "public"."site_image_kind" AS ENUM('logo', 'banner');--> statement-breakpoint
CREATE TABLE "site_image_files" (
	"image_id" integer NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" text NOT NULL,
	"has_alpha" boolean NOT NULL,
	CONSTRAINT "site_image_files_image_id_name_pk" PRIMARY KEY("image_id","name"),
	CONSTRAINT "site_image_files_name" CHECK ("site_image_files"."name" IN ('logo', 'favicon', 'apple', 'icon192', 'icon512', 'og', 'desktop', 'mobile')),
	CONSTRAINT "site_image_files_type" CHECK (("site_image_files"."name" = 'favicon' AND "site_image_files"."content_type" = 'image/x-icon')
          OR ("site_image_files"."name" IN ('desktop', 'mobile') AND "site_image_files"."content_type" IN ('image/png', 'image/jpeg'))
          OR ("site_image_files"."name" NOT IN ('favicon', 'desktop', 'mobile') AND "site_image_files"."content_type" = 'image/png')),
	CONSTRAINT "site_image_files_size" CHECK (octet_length("site_image_files"."bytes") BETWEEN 1 AND 4194304
          AND "site_image_files"."width" BETWEEN 1 AND 4096 AND "site_image_files"."height" BETWEEN 1 AND 4096),
	CONSTRAINT "site_image_files_sha256" CHECK ("site_image_files"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "site_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "site_image_kind" NOT NULL,
	"version" integer NOT NULL,
	"main" "bytea" NOT NULL,
	"main_name" text NOT NULL,
	"extra" "bytea",
	"extra_name" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"built_at" timestamp with time zone,
	"error" text,
	"published_at" timestamp with time zone,
	CONSTRAINT "site_images_version_positive" CHECK ("site_images"."version" >= 1),
	CONSTRAINT "site_images_main" CHECK (octet_length("site_images"."main") BETWEEN 1 AND 1048576 AND length("site_images"."main_name") BETWEEN 1 AND 200),
	CONSTRAINT "site_images_extra" CHECK (("site_images"."extra" IS NULL AND "site_images"."extra_name" IS NULL)
          OR ("site_images"."extra" IS NOT NULL AND "site_images"."extra_name" IS NOT NULL
              AND octet_length("site_images"."extra") BETWEEN 1 AND 1048576 AND length("site_images"."extra_name") BETWEEN 1 AND 200)),
	CONSTRAINT "site_images_error" CHECK ("site_images"."error" IS NULL OR ("site_images"."built_at" IS NOT NULL AND length(btrim("site_images"."error")) BETWEEN 1 AND 500)),
	CONSTRAINT "site_images_published" CHECK ("site_images"."published_at" IS NULL OR ("site_images"."built_at" IS NOT NULL AND "site_images"."error" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_one_target";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "site_image_id" integer;--> statement-breakpoint
ALTER TABLE "site_image_files" ADD CONSTRAINT "site_image_files_image_id_site_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."site_images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_images" ADD CONSTRAINT "site_images_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_image_files_sha256" ON "site_image_files" USING btree ("sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "site_images_version" ON "site_images" USING btree ("kind","version");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_site_image_id_site_images_id_fk" FOREIGN KEY ("site_image_id") REFERENCES "public"."site_images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_site_image_kind" ON "jobs" USING btree ("site_image_id","kind");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_one_target" CHECK (num_nonnulls("jobs"."document_id", "jobs"."order_id", "jobs"."shipment_import_id", "jobs"."ticket_template_id", "jobs"."report_export_id", "jobs"."site_image_id") <= 1);