-- کلیدهای سرویس‌های بیرونی که مالک از پنل گذاشته (برش ۴٫۶، ADR-041): کلید API کاوه‌نگار، قالب کد پیامکی و کد
-- پذیرندهٔ زیبال، مهروموم‌شده با `SECRETS_KEY`. مقدار پنل بر `.env` مقدم است؛ ردیف نبودن یعنی `.env`.
--
-- تولیدی (drizzle-kit). CHECKها: فقط همین سه نام، و فقط شکل مهروموم (`v1.<iv>.<رمزشده>`)، تا مقدار خام در پایگاه داده
-- ننشیند.
CREATE TABLE "service_secrets" (
	"name" text PRIMARY KEY NOT NULL,
	"sealed" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "service_secrets_name" CHECK ("service_secrets"."name" IN ('SMS_API_KEY', 'SMS_OTP_TEMPLATE', 'PAYMENT_MERCHANT_ID')),
	CONSTRAINT "service_secrets_sealed" CHECK ("service_secrets"."sealed" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22,}$')
);
