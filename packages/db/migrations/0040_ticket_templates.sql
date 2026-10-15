CREATE TYPE "public"."ticket_template_kind" AS ENUM('bijak', 'first_page');--> statement-breakpoint
CREATE TABLE "ticket_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "ticket_template_kind" NOT NULL,
	"version" integer NOT NULL,
	"html" text NOT NULL,
	"sha256" text NOT NULL,
	"file_name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"activated_at" timestamp with time zone,
	"preview_at" timestamp with time zone,
	"preview_order_number" integer,
	"preview_pages" integer,
	"preview_blocked" text[] DEFAULT '{}'::text[] NOT NULL,
	"preview_error" text,
	CONSTRAINT "ticket_templates_size" CHECK (octet_length("ticket_templates"."html") BETWEEN 1 AND 2097152),
	CONSTRAINT "ticket_templates_sha256" CHECK ("ticket_templates"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ticket_templates_version_positive" CHECK ("ticket_templates"."version" >= 1),
	CONSTRAINT "ticket_templates_file_name" CHECK (length("ticket_templates"."file_name") BETWEEN 1 AND 200),
	CONSTRAINT "ticket_templates_activated" CHECK (NOT "ticket_templates"."is_active" OR "ticket_templates"."activated_at" IS NOT NULL),
	CONSTRAINT "ticket_templates_preview" CHECK (("ticket_templates"."preview_at" IS NULL AND "ticket_templates"."preview_pages" IS NULL AND "ticket_templates"."preview_error" IS NULL)
          OR ("ticket_templates"."preview_at" IS NOT NULL AND ("ticket_templates"."preview_pages" IS NULL) <> ("ticket_templates"."preview_error" IS NULL)))
);
--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_one_target";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "ticket_template_id" integer;--> statement-breakpoint
ALTER TABLE "order_tickets" ADD COLUMN "page_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_tickets" ADD COLUMN "bijak_template_id" integer;--> statement-breakpoint
ALTER TABLE "order_tickets" ADD COLUMN "first_page_template_id" integer;--> statement-breakpoint
ALTER TABLE "ticket_templates" ADD CONSTRAINT "ticket_templates_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_templates_version" ON "ticket_templates" USING btree ("kind","version");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_templates_one_active" ON "ticket_templates" USING btree ("kind") WHERE "ticket_templates"."is_active";--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_ticket_template_id_ticket_templates_id_fk" FOREIGN KEY ("ticket_template_id") REFERENCES "public"."ticket_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_tickets" ADD CONSTRAINT "order_tickets_bijak_template_id_ticket_templates_id_fk" FOREIGN KEY ("bijak_template_id") REFERENCES "public"."ticket_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_tickets" ADD CONSTRAINT "order_tickets_first_page_template_id_ticket_templates_id_fk" FOREIGN KEY ("first_page_template_id") REFERENCES "public"."ticket_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_ticket_template_kind" ON "jobs" USING btree ("ticket_template_id","kind");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_one_target" CHECK (num_nonnulls("jobs"."document_id", "jobs"."order_id", "jobs"."shipment_import_id", "jobs"."ticket_template_id") <= 1);--> statement-breakpoint
ALTER TABLE "order_tickets" ADD CONSTRAINT "order_tickets_pages" CHECK ("order_tickets"."page_count" BETWEEN 1 AND 200);