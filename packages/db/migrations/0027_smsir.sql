-- پیامک واقعی sms.ir (برش ۷٫۱، ADR-049): دو کلید تازهٔ قالب (پرداخت و رهگیری) در `service_secrets`؛ پیامک پرداخت از صف، مثل
-- رهگیری: ردیف «منتظر» در همان تراکنش پرداخت موفق، با `payments.sms_message_id` (یکتا: یک پیامک برای هر پرداخت)؛ هزینهٔ هر
-- پیامک که sms.ir گفت (`cost`)؛ کد تأیید زنده با پنل واقعی هرگز در پایگاه داده (`sms_messages_otp_secret`)؛ و نمایهٔ `otp_requests`
-- روی مرورگر برای سقف هر مرورگر.
--
-- تولیدی (drizzle-kit). گذار منتظر و در حال فرستادن پیامک پرداخت، و «پرداخت موفق پیامک منتظرش را دارد»، تریگرند و در 0028، دست‌نویس.

ALTER TABLE "service_secrets" DROP CONSTRAINT "service_secrets_name";--> statement-breakpoint
ALTER TABLE "sms_messages" DROP CONSTRAINT "sms_messages_queued";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "sms_message_id" bigint;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD COLUMN "cost" numeric;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_sms_message_id_sms_messages_id_fk" FOREIGN KEY ("sms_message_id") REFERENCES "public"."sms_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "otp_requests_session" ON "otp_requests" USING btree ("session_hash","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_sms" ON "payments" USING btree ("sms_message_id");--> statement-breakpoint
ALTER TABLE "service_secrets" ADD CONSTRAINT "service_secrets_name" CHECK ("service_secrets"."name" IN ('SMS_API_KEY', 'SMS_OTP_TEMPLATE', 'SMS_PAID_TEMPLATE', 'SMS_TRACKING_TEMPLATE', 'PAYMENT_MERCHANT_ID'));--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_otp_secret" CHECK ("sms_messages"."purpose" <> 'otp' OR "sms_messages"."provider" = 'console' OR ("sms_messages"."body" IS NULL AND "sms_messages"."params" IS NULL));--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_cost" CHECK ("sms_messages"."cost" IS NULL OR "sms_messages"."cost" >= 0);--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_queued" CHECK ("sms_messages"."status" NOT IN ('pending', 'sending') OR ("sms_messages"."purpose" IN ('tracking', 'order_paid') AND "sms_messages"."body" IS NOT NULL));