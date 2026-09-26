-- رویدادهای یک هدف (برش ۴٫۲): صفحهٔ جزئیات سفارش در پنل رویدادهای ادمینِ همان سفارش را می‌خواند (دانلود PDF
-- جزوه، «دوباره بساز»)، و `admin_events` با هر ورود و کار ادمین بزرگ می‌شود.
--
-- تولیدی (drizzle-kit).

CREATE INDEX "admin_events_target" ON "admin_events" USING btree ("target_type","target_id","at");
