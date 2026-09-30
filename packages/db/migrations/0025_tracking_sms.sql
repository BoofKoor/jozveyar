-- پیامک رهگیری (برش ۶٫۳، ADR-047): هر مرسوله پیامکش را نگه می‌دارد (`shipments.sms_message_id`)، و ردیف `sms_messages` رهگیری در همان
-- تراکنش مرسوله «منتظر» نوشته می‌شود و بعد از commit فرستاده. هدف تازهٔ `tracking`، وضعیت‌های `pending` و `sending`، پارامترهای
-- قالب، شمار تلاش‌ها، و زمان آخرین تلاش و رفتن.
--
-- تولیدی (drizzle-kit). گذار وضعیت پیامک، «هر مرسولهٔ تازه پیامک دارد»، سؤال ۶۷ و «کد کنارگذاشته پیامک نمی‌گیرد» تریگرند و در
-- 0026، دست‌نویس.

ALTER TABLE "shipments" ADD COLUMN "sms_message_id" bigint;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD COLUMN "params" jsonb;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD COLUMN "attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_sms_message_id_sms_messages_id_fk" FOREIGN KEY ("sms_message_id") REFERENCES "public"."sms_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipments_sms" ON "shipments" USING btree ("sms_message_id");--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_purpose" CHECK ("sms_messages"."purpose" IN ('otp', 'order_paid', 'tracking'));--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_status" CHECK ("sms_messages"."status" IN ('logged', 'sent', 'failed', 'pending', 'sending'));--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_queued" CHECK ("sms_messages"."status" NOT IN ('pending', 'sending') OR ("sms_messages"."purpose" = 'tracking' AND "sms_messages"."body" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_sent_at" CHECK (("sms_messages"."sent_at" IS NULL) OR "sms_messages"."status" IN ('logged', 'sent'));