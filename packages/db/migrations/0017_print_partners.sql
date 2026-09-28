-- چاپخانه‌ها و تخصیص سفارش (برش ۵٫۲، ADR-042): جدول `print_partners`، ستون `orders.print_partner_id`، و تاریخچهٔ تخصیص
-- `order_assignments`.
--
-- تولیدی (drizzle-kit). `orders_partner_paid` با `status::text`، مثل `orders_handed_at` (0010): مهاجرت‌های یک اجرا یک تراکنش‌اند
-- و مقدارهای تازهٔ 0010 روی پایگاه دادهٔ تازه در همان تراکنش‌اند. محافظ‌ها (جابه‌جایی فقط در صف و به چاپخانهٔ فعال، تاریخچهٔ
-- فقط افزودنی و کامل، غیرفعال کردن فقط بی سفارش باز) و اثر انگشت برگه با چاپخانه در 0018، دست‌نویس. ردیف «چاپخانهٔ جزوه‌یار» را
-- دادهٔ پایه می‌نشاند، نه مهاجرت.

CREATE TABLE "order_assignments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"from_partner_id" uuid,
	"to_partner_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"admin_user_id" uuid,
	"rule" text,
	"reason" text,
	CONSTRAINT "order_assignments_moves" CHECK ("order_assignments"."from_partner_id" IS DISTINCT FROM "order_assignments"."to_partner_id"),
	CONSTRAINT "order_assignments_actor" CHECK (("order_assignments"."actor" = 'system' AND "order_assignments"."admin_user_id" IS NULL AND "order_assignments"."from_partner_id" IS NULL AND "order_assignments"."reason" IS NULL
            AND "order_assignments"."rule" IN ('city', 'province', 'default', 'oldest'))
       OR ("order_assignments"."actor" = 'admin' AND "order_assignments"."admin_user_id" IS NOT NULL AND "order_assignments"."rule" IS NULL
            AND length(btrim("order_assignments"."reason")) BETWEEN 1 AND 500))
);
--> statement-breakpoint
CREATE TABLE "print_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"province_id" smallint NOT NULL,
	"city_id" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "print_partners_name_unique" UNIQUE("name"),
	CONSTRAINT "print_partners_name" CHECK (length(btrim("print_partners"."name")) BETWEEN 1 AND 100),
	CONSTRAINT "print_partners_default_active" CHECK (NOT "print_partners"."is_default" OR "print_partners"."deactivated_at" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "print_partner_id" uuid;--> statement-breakpoint
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_from_partner_id_print_partners_id_fk" FOREIGN KEY ("from_partner_id") REFERENCES "public"."print_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_to_partner_id_print_partners_id_fk" FOREIGN KEY ("to_partner_id") REFERENCES "public"."print_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_partners" ADD CONSTRAINT "print_partners_province_id_provinces_id_fk" FOREIGN KEY ("province_id") REFERENCES "public"."provinces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_partners" ADD CONSTRAINT "print_partners_city_province_fk" FOREIGN KEY ("city_id","province_id") REFERENCES "public"."cities"("id","province_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_assignments_order" ON "order_assignments" USING btree ("order_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "print_partners_one_default" ON "print_partners" USING btree ("is_default") WHERE "print_partners"."is_default";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_print_partner_id_print_partners_id_fk" FOREIGN KEY ("print_partner_id") REFERENCES "public"."print_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_print_partner" ON "orders" USING btree ("print_partner_id","status");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_partner_paid" CHECK ("orders"."print_partner_id" IS NULL OR "orders"."status"::text NOT IN ('awaiting_payment', 'expired'));