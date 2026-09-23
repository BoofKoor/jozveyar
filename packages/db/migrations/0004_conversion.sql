-- تبدیل Word، پاورپوینت و عکس به PDF در کارگر (برش ۲ب، ADR-028).
--
-- `ALTER TYPE … ADD VALUE` در پستگرس ۱۲ به بعد داخل تراکنش مجاز است، به شرطی که
-- مقدار تازه در همان تراکنش به کار نرود — و اینجا نمی‌رود. ستون‌ها همه nullable‌اند:
-- سندهای قبلی همه PDFاند، تبدیل ندارند، و همان `storage_key` خوانده می‌شود.

ALTER TYPE "public"."document_status" ADD VALUE 'converting' BEFORE 'analyzing';--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "pdf_storage_key" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "pdf_size_bytes" bigint;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "conversion" jsonb;