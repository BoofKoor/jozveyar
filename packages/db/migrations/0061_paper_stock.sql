CREATE TABLE "paper_stock_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"print_partner_id" uuid NOT NULL,
	"paper_type_id" text NOT NULL,
	"paper_size" "paper_size" NOT NULL,
	"threshold_sheets" integer,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paper_stock_items_paper" CHECK ("paper_stock_items"."paper_type_id" ~ '^[a-z][a-z0-9_]{1,39}$'),
	CONSTRAINT "paper_stock_items_threshold" CHECK ("paper_stock_items"."threshold_sheets" IS NULL OR "paper_stock_items"."threshold_sheets" BETWEEN 0 AND 10000000)
);
--> statement-breakpoint
CREATE TABLE "paper_stock_moves" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"delta_sheets" integer NOT NULL,
	"counted_sheets" integer,
	"order_id" uuid,
	"undoes" bigint,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_id" uuid,
	CONSTRAINT "paper_stock_moves_kind" CHECK ("paper_stock_moves"."kind" IN ('purchase', 'waste', 'count', 'print', 'unprint')),
	CONSTRAINT "paper_stock_moves_shape" CHECK (abs("paper_stock_moves"."delta_sheets") <= 100000000
       AND (("paper_stock_moves"."kind" IN ('purchase', 'waste', 'count') AND "paper_stock_moves"."created_by" IS NOT NULL AND "paper_stock_moves"."request_id" IS NOT NULL
             AND "paper_stock_moves"."order_id" IS NULL AND "paper_stock_moves"."undoes" IS NULL
             AND (("paper_stock_moves"."kind" = 'purchase' AND "paper_stock_moves"."delta_sheets" > 0 AND "paper_stock_moves"."counted_sheets" IS NULL)
               OR ("paper_stock_moves"."kind" = 'waste' AND "paper_stock_moves"."delta_sheets" < 0 AND "paper_stock_moves"."counted_sheets" IS NULL AND "paper_stock_moves"."note" IS NOT NULL)
               OR ("paper_stock_moves"."kind" = 'count' AND "paper_stock_moves"."counted_sheets" BETWEEN 0 AND 10000000
                   AND "paper_stock_moves"."note" IS NOT NULL)))
         OR ("paper_stock_moves"."kind" IN ('print', 'unprint') AND "paper_stock_moves"."order_id" IS NOT NULL AND "paper_stock_moves"."created_by" IS NULL AND "paper_stock_moves"."request_id" IS NULL
             AND "paper_stock_moves"."note" IS NULL AND "paper_stock_moves"."counted_sheets" IS NULL
             AND (("paper_stock_moves"."kind" = 'print' AND "paper_stock_moves"."delta_sheets" < 0 AND "paper_stock_moves"."undoes" IS NULL)
               OR ("paper_stock_moves"."kind" = 'unprint' AND "paper_stock_moves"."delta_sheets" > 0 AND "paper_stock_moves"."undoes" IS NOT NULL))))),
	CONSTRAINT "paper_stock_moves_note" CHECK ("paper_stock_moves"."note" IS NULL OR (length("paper_stock_moves"."note") BETWEEN 1 AND 300 AND "paper_stock_moves"."note" = btrim("paper_stock_moves"."note")))
);
--> statement-breakpoint
ALTER TABLE "paper_stock_items" ADD CONSTRAINT "paper_stock_items_print_partner_id_print_partners_id_fk" FOREIGN KEY ("print_partner_id") REFERENCES "public"."print_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_stock_items" ADD CONSTRAINT "paper_stock_items_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_stock_moves" ADD CONSTRAINT "paper_stock_moves_item_id_paper_stock_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."paper_stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_stock_moves" ADD CONSTRAINT "paper_stock_moves_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_stock_moves" ADD CONSTRAINT "paper_stock_moves_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_stock_moves" ADD CONSTRAINT "paper_stock_moves_undoes_fk" FOREIGN KEY ("undoes") REFERENCES "public"."paper_stock_moves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "paper_stock_items_key" ON "paper_stock_items" USING btree ("print_partner_id","paper_type_id","paper_size");--> statement-breakpoint
CREATE INDEX "paper_stock_moves_item" ON "paper_stock_moves" USING btree ("item_id","id");--> statement-breakpoint
CREATE INDEX "paper_stock_moves_order" ON "paper_stock_moves" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paper_stock_moves_request" ON "paper_stock_moves" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paper_stock_moves_undoes" ON "paper_stock_moves" USING btree ("undoes");