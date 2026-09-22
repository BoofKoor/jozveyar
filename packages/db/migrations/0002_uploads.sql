-- آپلود مستقیم به استوریج (ADR-024).
--
-- `session_hash` بدون پیش‌فرض NOT NULL است. امن است چون تا این مهاجرت هیچ کدی
-- در `documents` نمی‌نوشت؛ سندی بدون مالک از اینجا به بعد ساختنی نیست.

ALTER TABLE "documents" ADD COLUMN "session_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "upload_id" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "part_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "uploaded_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "documents_session" ON "documents" USING btree ("session_hash","status");