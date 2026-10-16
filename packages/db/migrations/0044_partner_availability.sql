ALTER TABLE "order_assignments" DROP CONSTRAINT "order_assignments_actor";--> statement-breakpoint
ALTER TABLE "print_partners" ADD COLUMN "availability" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "print_partners" ADD COLUMN "closed_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "print_partners" ADD COLUMN "closed_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "print_partners" ADD COLUMN "availability_note" text;--> statement-breakpoint
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_actor" CHECK (("order_assignments"."actor" = 'system' AND "order_assignments"."admin_user_id" IS NULL AND "order_assignments"."from_partner_id" IS NULL AND "order_assignments"."reason" IS NULL
            AND "order_assignments"."rule" IS NOT NULL AND "order_assignments"."rule" IN ('city', 'province', 'nearest', 'reopening', 'default', 'oldest'))
       OR ("order_assignments"."actor" = 'admin' AND "order_assignments"."admin_user_id" IS NOT NULL AND "order_assignments"."rule" IS NULL
            AND (("order_assignments"."reason" IS NOT NULL AND length(btrim("order_assignments"."reason")) BETWEEN 1 AND 500)
                 OR ("order_assignments"."reason" IS NULL AND "order_assignments"."from_partner_id" IS NULL))));--> statement-breakpoint
ALTER TABLE "print_partners" ADD CONSTRAINT "print_partners_closed" CHECK ("print_partners"."availability" IN ('open', 'busy', 'closed')
       AND ("print_partners"."availability" = 'closed') = ("print_partners"."closed_from" IS NOT NULL)
       AND ("print_partners"."closed_from" IS NULL) = ("print_partners"."closed_until" IS NULL)
       AND ("print_partners"."closed_from" IS NULL OR ("print_partners"."closed_from" < "print_partners"."closed_until" AND "print_partners"."closed_until" <= "print_partners"."closed_from" + interval '366 days')));--> statement-breakpoint
ALTER TABLE "print_partners" ADD CONSTRAINT "print_partners_availability_note" CHECK ("print_partners"."availability_note" IS NULL
       OR ("print_partners"."availability" <> 'open' AND length("print_partners"."availability_note") BETWEEN 1 AND 200
           AND "print_partners"."availability_note" = btrim("print_partners"."availability_note")));