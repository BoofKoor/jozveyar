CREATE TABLE "mobile_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mobile" text NOT NULL,
	"reason" text NOT NULL,
	"order_number" integer,
	"blocked_by" uuid NOT NULL,
	"blocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unblocked_by" uuid,
	"unblocked_at" timestamp with time zone,
	CONSTRAINT "mobile_blocks_mobile" CHECK ("mobile_blocks"."mobile" ~ '^09[0-9]{9}$'),
	CONSTRAINT "mobile_blocks_reason" CHECK (length("mobile_blocks"."reason") <= 500 AND btrim("mobile_blocks"."reason") <> '' AND "mobile_blocks"."reason" = btrim("mobile_blocks"."reason")),
	CONSTRAINT "mobile_blocks_unblocked" CHECK (("mobile_blocks"."unblocked_at" IS NULL) = ("mobile_blocks"."unblocked_by" IS NULL) AND ("mobile_blocks"."unblocked_at" IS NULL OR "mobile_blocks"."unblocked_at" >= "mobile_blocks"."blocked_at"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mobile_blocks_live" ON "mobile_blocks" USING btree ("mobile") WHERE "mobile_blocks"."unblocked_at" IS NULL;