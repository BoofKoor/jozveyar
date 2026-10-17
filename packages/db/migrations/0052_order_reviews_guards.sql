-- محافظ نظر مشتری (برش ۱۲٫۳، ADR-064، سؤال ۲۱۳).
--
-- دست‌نویس، مثل 0050. خطا با نام محدودیت برمی‌گردد (`check_violation` و `CONSTRAINT`)، تا کد و تست بدانند کدام محافظ رد کرد و رابط کدام
-- پیام را بدهد.
--
--  - **فقط پس از رسیدن به پست** (`order_reviews_delivered`): نظر تازه فقط برای سفارش «تحویل پست شد»، با سطر سفارش `FOR SHARE` تا همان لحظه
--    وضعیتش برنگردد؛ و یکی برای هر سفارش (`order_reviews_order`، 0051).
--  - **تازه منتظر است** (`order_reviews_insert_state`): هیچ نظری بی تأیید مالک روی سایت نمی‌رود.
--  - **آنچه مشتری نوشت و دید عوض نمی‌شود** (`order_reviews_frozen`): نمره، متن، نام کوچک و شهری که زیر فرم دید، سفارش و زمان؛ تنها تغییر
--    وضعیت است، و «پاک» نمره و متن را برای همیشه برمی‌دارد (CHECK `order_reviews_content`، 0051).
--  - **گذار** (`order_reviews_flow`): منتظر ← روی سایت | پنهان | پاک؛ روی سایت ← پنهان | پاک؛ پنهان ← روی سایت | پاک. از «پاک» هیچ گذاری
--    نیست و هیچ وضعیتی به خودش نمی‌رود، پس پاک‌شده دیگر عوض نمی‌شود، زمان تصمیمش هم نه.
--  - **ردیف پاک نمی‌شود** (`order_reviews_append_only`)، جز با پاک شدن خود سفارش: در cascade سفارش دیگر پیدا نمی‌شود، مثل
--    `order_notes_append_only` (0043). «پاک کن» مالک ردیف را خالی نگه می‌دارد تا همان سفارش دوباره فرم نگیرد.

CREATE FUNCTION order_reviews_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  order_now order_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM orders WHERE id = OLD.order_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'نظر پاک نمی‌شود؛ «پاک کن» نمره و متنش را برمی‌دارد'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'order_reviews_append_only';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.decided_at IS NOT NULL OR NEW.decided_by IS NOT NULL THEN
      RAISE EXCEPTION 'نظر تازه منتظر تأیید است'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'order_reviews_insert_state';
    END IF;
    SELECT status INTO order_now FROM orders WHERE id = NEW.order_id FOR SHARE;
    IF order_now IS DISTINCT FROM 'handed_to_post' THEN
      RAISE EXCEPTION 'نظر فقط برای سفارش «تحویل پست شد»'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'order_reviews_delivered';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.order_id, NEW.created_at, NEW.public_name, NEW.public_place)
        IS DISTINCT FROM (OLD.id, OLD.order_id, OLD.created_at, OLD.public_name, OLD.public_place)
     OR (NEW.status <> 'deleted' AND (NEW.rating, NEW.body) IS DISTINCT FROM (OLD.rating, OLD.body))
  THEN
    RAISE EXCEPTION 'آنچه مشتری نوشت عوض نمی‌شود'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'order_reviews_frozen';
  END IF;
  IF (OLD.status, NEW.status) NOT IN (
    ('pending', 'approved'), ('pending', 'hidden'), ('pending', 'deleted'),
    ('approved', 'hidden'), ('approved', 'deleted'),
    ('hidden', 'approved'), ('hidden', 'deleted')
  ) THEN
    RAISE EXCEPTION 'گذار نظر از % به % نیست', OLD.status, NEW.status
      USING ERRCODE = 'check_violation', CONSTRAINT = 'order_reviews_flow';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER order_reviews_guard BEFORE INSERT OR UPDATE OR DELETE ON order_reviews
  FOR EACH ROW EXECUTE FUNCTION order_reviews_guard();
