-- صف تأیید (برش ۶٫۲، ADR-046): «هیچ‌کدام» روی سطر فایل پست، با کننده و زمانش. «همین است» و «دادن دستی» خودشان مرسوله‌اند
-- (`shipments.matched_by` = `review` یا `manual`، از 0021)، پس صف جدول تصمیم ندارد؛ و ایندکس جزئی سطرهای صفی که هنوز «هیچ‌کدام»
-- نخورده‌اند، برای شمار پیشخوان و فهرست صف.
--
-- تولیدی (drizzle-kit). «یک بار»، «فقط سطر صف» و پاک شدن متن سطرِ «هیچ‌کدام» تریگرند و در 0024، دست‌نویس.

ALTER TABLE "shipment_import_rows" ADD COLUMN "dismissed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipment_import_rows" ADD COLUMN "dismissed_by" uuid;--> statement-breakpoint
ALTER TABLE "shipment_import_rows" ADD CONSTRAINT "shipment_import_rows_dismissed_by_admin_users_id_fk" FOREIGN KEY ("dismissed_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipment_import_rows_review" ON "shipment_import_rows" USING btree ("import_id","row_no") WHERE "shipment_import_rows"."verdict" = 'review' AND "shipment_import_rows"."dismissed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "shipment_import_rows" ADD CONSTRAINT "shipment_import_rows_dismissed" CHECK (("shipment_import_rows"."dismissed_at" IS NULL) = ("shipment_import_rows"."dismissed_by" IS NULL) AND ("shipment_import_rows"."dismissed_at" IS NULL OR "shipment_import_rows"."verdict" IN ('matched', 'review', 'unmatched')));