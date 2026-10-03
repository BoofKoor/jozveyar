-- پیامک به چاپخانه (برش ۷٫۶، ADR-049؛ سؤال‌های ۱۲۶، ۱۴۳ و ۱۷۲ تا ۱۷۷): موبایل اعلان اختیاری هر چاپخانه (`print_partners.notify_mobile`،
-- نرمال، `09…`)؛ پیامک «منتظر» هر تخصیص به چاپخانه‌ای که موبایل دارد، با `order_assignments.sms_message_id` (یکتا: یک پیامک برای هر
-- تخصیص)؛ هدف تازهٔ `partner_order` و صفش؛ و کلید ششم `SMS_PARTNER_TEMPLATE`.
--
-- تولیدی (drizzle-kit). «تخصیص به چاپخانهٔ با موبایل پیامک تازهٔ خودش را دارد» و «پیامک چاپخانه فقط تا وقتی سفارش در صف چاپ همان
-- چاپخانه است زنده است» تریگرند و در 0036، دست‌نویس.

ALTER TABLE "service_secrets" DROP CONSTRAINT "service_secrets_name";--> statement-breakpoint
ALTER TABLE "sms_messages" DROP CONSTRAINT "sms_messages_purpose";--> statement-breakpoint
ALTER TABLE "sms_messages" DROP CONSTRAINT "sms_messages_queued";--> statement-breakpoint
ALTER TABLE "order_assignments" ADD COLUMN "sms_message_id" bigint;--> statement-breakpoint
ALTER TABLE "print_partners" ADD COLUMN "notify_mobile" text;--> statement-breakpoint
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_sms_message_id_sms_messages_id_fk" FOREIGN KEY ("sms_message_id") REFERENCES "public"."sms_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_assignments_sms" ON "order_assignments" USING btree ("sms_message_id");--> statement-breakpoint
ALTER TABLE "print_partners" ADD CONSTRAINT "print_partners_notify_mobile" CHECK ("print_partners"."notify_mobile" IS NULL OR "print_partners"."notify_mobile" ~ '^09[0-9]{9}$');--> statement-breakpoint
ALTER TABLE "service_secrets" ADD CONSTRAINT "service_secrets_name" CHECK ("service_secrets"."name" IN ('SMS_API_KEY', 'SMS_OTP_TEMPLATE', 'SMS_PAID_TEMPLATE', 'SMS_TRACKING_TEMPLATE', 'SMS_PARTNER_TEMPLATE', 'PAYMENT_MERCHANT_ID'));--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_purpose" CHECK ("sms_messages"."purpose" IN ('otp', 'order_paid', 'tracking', 'partner_order'));--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_queued" CHECK ("sms_messages"."status" NOT IN ('pending', 'sending') OR ("sms_messages"."purpose" IN ('tracking', 'order_paid', 'partner_order') AND "sms_messages"."body" IS NOT NULL));