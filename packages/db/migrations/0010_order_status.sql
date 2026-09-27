-- وضعیت سفارش پس از پرداخت (برش ۴٫۳، ADR-039): «در حال چاپ»، «تحویل پست شد» و «لغو شد»؛ زمان تحویل به پست؛ و
-- ادمینی که وضعیت را عوض کرد.
--
-- تولیدی (drizzle-kit). مقدارهای تازهٔ `order_status` در این اجرا فقط افزوده می‌شوند و در هیچ محدودیت یا نمایه‌ای به
-- کار نمی‌روند: migrator همهٔ مهاجرت‌های یک اجرا را در یک تراکنش اعمال می‌کند، و پستگرس مقداری را که
-- `ALTER TYPE … ADD VALUE` در همان تراکنش افزوده به کار نمی‌برد («unsafe use of new value»؛ روی پایگاه دادهٔ زنده،
-- که نوعش پیش‌تر commit شده، حتماً). پس `orders_paid_has_dates` با دو مقدار پیش از پرداخت نوشته شده و `orders_handed_at`
-- با `status::text`؛ جریان وضعیت‌ها در تریگر 0011 است، که بدنه‌اش فقط هنگام اجرا خوانده می‌شود.

ALTER TYPE "public"."order_status" ADD VALUE 'printing';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'handed_to_post';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_paid_has_dates";--> statement-breakpoint
ALTER TABLE "order_status_events" ADD COLUMN "admin_user_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "handed_to_post_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_handed" ON "orders" USING btree ("handed_to_post_at");--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_admin" CHECK (("order_status_events"."actor" = 'admin') = ("order_status_events"."admin_user_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_handed_at" CHECK (("orders"."status"::text = 'handed_to_post') = ("orders"."handed_to_post_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_paid_has_dates" CHECK ("orders"."status" IN ('awaiting_payment', 'expired') OR ("orders"."paid_at" IS NOT NULL AND "orders"."post_handoff_due_at" IS NOT NULL));