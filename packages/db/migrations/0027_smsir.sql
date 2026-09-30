-- پیامک sms.ir (برش ۷٫۱، ADR-049): دو کلید تازهٔ قالب (`SMS_PAID_TEMPLATE`، `SMS_TRACKING_TEMPLATE`)، هزینهٔ هر پیامک که sms.ir گفت
-- (`sms_messages.cost`)، پیامک پرداخت از صف مثل رهگیری (`sms_messages_queued`، و `payments.sms_message_id` که فقط پرداخت موفق دارد)، و
-- نمایهٔ سقف هر مرورگر (`otp_requests_session`).
--
-- تولیدی (drizzle-kit). گذار پیامک پرداخت، «هر پرداختی که موفق می‌شود پیامک دارد» و «هزینه فقط با رفتن» تریگرند و در 0028، دست‌نویس.

ALTER TABLE "service_secrets" DROP CONSTRAINT "service_secrets_name";--> statement-breakpoint
ALTER TABLE "sms_messages" DROP CONSTRAINT "sms_messages_queued";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "sms_message_id" bigint;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD COLUMN "cost" double precision;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_sms_message_id_sms_messages_id_fk" FOREIGN KEY ("sms_message_id") REFERENCES "public"."sms_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "otp_requests_session" ON "otp_requests" USING btree ("session_hash","created_at");--> statement-breakpoint
CREATE INDEX "payments_sms" ON "payments" USING btree ("sms_message_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_sms_success" CHECK ("payments"."sms_message_id" IS NULL OR "payments"."status" = 'succeeded');--> statement-breakpoint
ALTER TABLE "service_secrets" ADD CONSTRAINT "service_secrets_name" CHECK ("service_secrets"."name" IN ('SMS_API_KEY', 'SMS_OTP_TEMPLATE', 'SMS_PAID_TEMPLATE', 'SMS_TRACKING_TEMPLATE', 'PAYMENT_MERCHANT_ID'));--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_cost" CHECK ("sms_messages"."cost" IS NULL OR ("sms_messages"."cost" >= 0 AND "sms_messages"."status" IN ('logged', 'sent')));--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_queued" CHECK ("sms_messages"."status" NOT IN ('pending', 'sending') OR ("sms_messages"."purpose" IN ('tracking', 'order_paid') AND "sms_messages"."body" IS NOT NULL));