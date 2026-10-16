CREATE TABLE "order_notes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"partner_visible" boolean NOT NULL,
	"request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_notes_body" CHECK (length("order_notes"."body") <= 1000 AND btrim("order_notes"."body", E' \n') <> '' AND "order_notes"."body" = btrim("order_notes"."body", E' \n'))
);
--> statement-breakpoint
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_notes_order" ON "order_notes" USING btree ("order_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_notes_request" ON "order_notes" USING btree ("request_id");