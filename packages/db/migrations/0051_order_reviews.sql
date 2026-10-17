CREATE TABLE "order_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"rating" smallint,
	"body" text,
	"public_name" text NOT NULL,
	"public_place" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	CONSTRAINT "order_reviews_status" CHECK ("order_reviews"."status" IN ('pending', 'approved', 'hidden', 'deleted')),
	CONSTRAINT "order_reviews_content" CHECK (("order_reviews"."status" = 'deleted') = ("order_reviews"."rating" IS NULL) AND ("order_reviews"."status" <> 'deleted' OR "order_reviews"."body" IS NULL)),
	CONSTRAINT "order_reviews_rating" CHECK ("order_reviews"."rating" IS NULL OR "order_reviews"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "order_reviews_body" CHECK ("order_reviews"."body" IS NULL OR (length("order_reviews"."body") <= 500 AND btrim("order_reviews"."body", E' \n') <> '' AND "order_reviews"."body" = btrim("order_reviews"."body", E' \n'))),
	CONSTRAINT "order_reviews_approved_body" CHECK ("order_reviews"."status" <> 'approved' OR "order_reviews"."body" IS NOT NULL),
	CONSTRAINT "order_reviews_public" CHECK (btrim("order_reviews"."public_name") <> '' AND length("order_reviews"."public_name") <= 100 AND btrim("order_reviews"."public_place") <> '' AND length("order_reviews"."public_place") <= 80),
	CONSTRAINT "order_reviews_decided" CHECK (("order_reviews"."status" = 'pending') = ("order_reviews"."decided_at" IS NULL) AND ("order_reviews"."decided_at" IS NULL) = ("order_reviews"."decided_by" IS NULL) AND ("order_reviews"."decided_at" IS NULL OR "order_reviews"."decided_at" >= "order_reviews"."created_at"))
);
--> statement-breakpoint
ALTER TABLE "order_reviews" ADD CONSTRAINT "order_reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_reviews_order" ON "order_reviews" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_reviews_status" ON "order_reviews" USING btree ("status","created_at");