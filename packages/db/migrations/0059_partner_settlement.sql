CREATE TABLE "partner_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"print_partner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_rials" bigint NOT NULL,
	"day" timestamp with time zone NOT NULL,
	"period_from" timestamp with time zone,
	"period_until" timestamp with time zone,
	"tracking" text,
	"note" text,
	"order_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_id" uuid NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	CONSTRAINT "partner_ledger_kind" CHECK ("partner_ledger"."kind" IN ('payment', 'adjustment')),
	CONSTRAINT "partner_ledger_shape" CHECK (abs("partner_ledger"."amount_rials") <= 100000000000 AND "partner_ledger"."amount_rials" % 10 = 0
       AND (("partner_ledger"."kind" = 'payment' AND "partner_ledger"."amount_rials" > 0 AND "partner_ledger"."order_id" IS NULL)
         OR ("partner_ledger"."kind" = 'adjustment' AND "partner_ledger"."amount_rials" <> 0 AND "partner_ledger"."note" IS NOT NULL
             AND "partner_ledger"."period_from" IS NULL AND "partner_ledger"."tracking" IS NULL))),
	CONSTRAINT "partner_ledger_period" CHECK (("partner_ledger"."period_from" IS NULL) = ("partner_ledger"."period_until" IS NULL)
       AND ("partner_ledger"."period_from" IS NULL OR ("partner_ledger"."period_from" < "partner_ledger"."period_until" AND "partner_ledger"."period_until" <= "partner_ledger"."period_from" + interval '400 days'))),
	CONSTRAINT "partner_ledger_texts" CHECK (("partner_ledger"."tracking" IS NULL OR (length("partner_ledger"."tracking") BETWEEN 1 AND 40 AND "partner_ledger"."tracking" = btrim("partner_ledger"."tracking")))
       AND ("partner_ledger"."note" IS NULL OR (length("partner_ledger"."note") BETWEEN 1 AND 300 AND "partner_ledger"."note" = btrim("partner_ledger"."note")))),
	CONSTRAINT "partner_ledger_void" CHECK (("partner_ledger"."voided_at" IS NULL) = ("partner_ledger"."voided_by" IS NULL) AND ("partner_ledger"."voided_at" IS NULL) = ("partner_ledger"."void_reason" IS NULL)
       AND ("partner_ledger"."void_reason" IS NULL OR (length("partner_ledger"."void_reason") BETWEEN 1 AND 300 AND "partner_ledger"."void_reason" = btrim("partner_ledger"."void_reason"))))
);
--> statement-breakpoint
ALTER TABLE "report_exports" DROP CONSTRAINT "report_exports_report";--> statement-breakpoint
ALTER TABLE "order_assignments" ADD COLUMN "share_bp" integer;--> statement-breakpoint
ALTER TABLE "order_assignments" ADD COLUMN "share_rials" bigint;--> statement-breakpoint
ALTER TABLE "print_partners" ADD COLUMN "share_bp" integer;--> statement-breakpoint
ALTER TABLE "partner_ledger" ADD CONSTRAINT "partner_ledger_print_partner_id_print_partners_id_fk" FOREIGN KEY ("print_partner_id") REFERENCES "public"."print_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_ledger" ADD CONSTRAINT "partner_ledger_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_ledger" ADD CONSTRAINT "partner_ledger_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_ledger" ADD CONSTRAINT "partner_ledger_voided_by_admin_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_ledger_partner" ON "partner_ledger" USING btree ("print_partner_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_ledger_request" ON "partner_ledger" USING btree ("request_id");--> statement-breakpoint
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_share" CHECK (("order_assignments"."share_bp" IS NULL) = ("order_assignments"."share_rials" IS NULL)
       AND ("order_assignments"."share_bp" IS NULL OR ("order_assignments"."share_bp" BETWEEN 0 AND 10000 AND "order_assignments"."share_rials" >= 0 AND "order_assignments"."share_rials" % 10 = 0)));--> statement-breakpoint
ALTER TABLE "print_partners" ADD CONSTRAINT "print_partners_share" CHECK ("print_partners"."share_bp" IS NULL OR "print_partners"."share_bp" BETWEEN 0 AND 10000);--> statement-breakpoint
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_report" CHECK ("report_exports"."report" IN ('production', 'shipping', 'settlement'));