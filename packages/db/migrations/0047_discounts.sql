CREATE TYPE "public"."discount_kind" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TABLE "discount_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" "discount_kind" NOT NULL,
	"percent" smallint,
	"max_discount_rials" bigint,
	"amount_rials" bigint,
	"min_order_rials" bigint DEFAULT 0 NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"total_limit" integer,
	"per_customer_limit" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_codes_code" CHECK ("discount_codes"."code" ~ '^[A-Z0-9]{3,20}$'),
	CONSTRAINT "discount_codes_terms" CHECK (("discount_codes"."kind" = 'percent' AND "discount_codes"."percent" IS NOT NULL AND "discount_codes"."percent" BETWEEN 1 AND 100 AND "discount_codes"."amount_rials" IS NULL
             AND ("discount_codes"."max_discount_rials" IS NULL OR "discount_codes"."max_discount_rials" > 0))
          OR ("discount_codes"."kind" = 'fixed' AND "discount_codes"."amount_rials" IS NOT NULL AND "discount_codes"."amount_rials" > 0 AND "discount_codes"."percent" IS NULL
             AND "discount_codes"."max_discount_rials" IS NULL)),
	CONSTRAINT "discount_codes_min_order" CHECK ("discount_codes"."min_order_rials" >= 0),
	CONSTRAINT "discount_codes_window" CHECK ("discount_codes"."valid_from" IS NULL OR "discount_codes"."valid_until" IS NULL OR "discount_codes"."valid_from" < "discount_codes"."valid_until"),
	CONSTRAINT "discount_codes_limits" CHECK (("discount_codes"."total_limit" IS NULL OR "discount_codes"."total_limit" >= 1) AND "discount_codes"."per_customer_limit" >= 1),
	CONSTRAINT "discount_codes_note" CHECK ("discount_codes"."note" IS NULL OR length(btrim("discount_codes"."note")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "discount_tiers" (
	"price_list_version" integer NOT NULL,
	"from_rials" bigint NOT NULL,
	"percent" smallint NOT NULL,
	"free_shipping" boolean NOT NULL,
	CONSTRAINT "discount_tiers_price_list_version_from_rials_pk" PRIMARY KEY("price_list_version","from_rials"),
	CONSTRAINT "discount_tiers_from" CHECK ("discount_tiers"."from_rials" > 0),
	CONSTRAINT "discount_tiers_percent" CHECK ("discount_tiers"."percent" BETWEEN 0 AND 50),
	CONSTRAINT "discount_tiers_reward" CHECK ("discount_tiers"."percent" > 0 OR "discount_tiers"."free_shipping")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_code_id" uuid;--> statement-breakpoint
ALTER TABLE "discount_tiers" ADD CONSTRAINT "discount_tiers_price_list_version_price_lists_version_fk" FOREIGN KEY ("price_list_version") REFERENCES "public"."price_lists"("version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discount_codes_code_unique" ON "discount_codes" USING btree ("code");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_code_id_discount_codes_id_fk" FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_discount_code" ON "orders" USING btree ("discount_code_id","status") WHERE "orders"."discount_code_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_rials" CHECK ("orders"."discount_rials" BETWEEN 0 AND "orders"."subtotal_rials");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_code" CHECK (("orders"."discount_code_id" IS NULL AND "orders"."price_breakdown"->'discount'->>'source' IS DISTINCT FROM 'code')
          OR ("orders"."discount_code_id" IS NOT NULL AND "orders"."discount_code_id"::text IS NOT DISTINCT FROM "orders"."price_breakdown"->'discount'->>'codeId'
              AND "orders"."price_breakdown"->'discount'->>'source' = 'code' AND "orders"."discount_rials" > 0));