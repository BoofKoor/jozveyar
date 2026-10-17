CREATE TABLE "report_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report" text NOT NULL,
	"context" jsonb NOT NULL,
	"file_name" text NOT NULL,
	"money" boolean NOT NULL,
	"print_partner_id" uuid,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pdf" "bytea",
	"pages" integer,
	"sha256" text,
	"error" text,
	"finished_at" timestamp with time zone,
	CONSTRAINT "report_exports_report" CHECK ("report_exports"."report" IN ('production', 'shipping')),
	CONSTRAINT "report_exports_file_name" CHECK ("report_exports"."file_name" ~ '^[a-z0-9][a-z0-9-]{0,118}[.]pdf$'),
	CONSTRAINT "report_exports_context" CHECK (jsonb_typeof("report_exports"."context") = 'object' AND octet_length("report_exports"."context"::text) <= 4194304),
	CONSTRAINT "report_exports_result" CHECK (("report_exports"."finished_at" IS NULL AND "report_exports"."pdf" IS NULL AND "report_exports"."pages" IS NULL AND "report_exports"."sha256" IS NULL AND "report_exports"."error" IS NULL)
          OR ("report_exports"."finished_at" IS NOT NULL AND "report_exports"."error" IS NULL AND "report_exports"."pdf" IS NOT NULL AND "report_exports"."pages" IS NOT NULL AND "report_exports"."sha256" IS NOT NULL
              AND octet_length("report_exports"."pdf") BETWEEN 1 AND 16777216
              AND "report_exports"."pages" BETWEEN 1 AND 200 AND "report_exports"."sha256" ~ '^[0-9a-f]{64}$')
          OR ("report_exports"."finished_at" IS NOT NULL AND "report_exports"."error" IS NOT NULL AND "report_exports"."pdf" IS NULL AND "report_exports"."pages" IS NULL AND "report_exports"."sha256" IS NULL
              AND length(btrim("report_exports"."error")) BETWEEN 1 AND 500))
);
--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_one_target";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "report_export_id" uuid;--> statement-breakpoint
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_print_partner_id_print_partners_id_fk" FOREIGN KEY ("print_partner_id") REFERENCES "public"."print_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_requested_by_admin_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_exports_requested" ON "report_exports" USING btree ("requested_at");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_report_export_id_report_exports_id_fk" FOREIGN KEY ("report_export_id") REFERENCES "public"."report_exports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_report_export_kind" ON "jobs" USING btree ("report_export_id","kind");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_one_target" CHECK (num_nonnulls("jobs"."document_id", "jobs"."order_id", "jobs"."shipment_import_id", "jobs"."ticket_template_id", "jobs"."report_export_id") <= 1);