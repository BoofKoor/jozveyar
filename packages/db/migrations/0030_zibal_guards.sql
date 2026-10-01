-- محافظ‌های `payments` (برش ۷٫۲، ADR-050).
--
-- دست‌نویس، مثل 0028: درگاه واقعی پول جابه‌جا می‌کند، پس مبلغ، شناسه‌ها و گذار وضعیت هر تلاش باید در خود پایگاه داده درست بمانند، نه فقط در
-- کد. هر خطا با نام محدودیت برمی‌گردد (`check_violation` و `CONSTRAINT`).
--
--  - `payments_amount_is_total`: مبلغ هر تلاش در درج همان جمع منجمد سفارش است (قاعده‌های ۲ و ۶): مبلغ درگاه هرگز از جای دیگری نمی‌آید.
--  - `payments_frozen`: سفارش، درگاه، مبلغ، شناسهٔ تلاش، شناسهٔ سفارش درگاه، کلید برگشت و زمان ساختن پس از درج عوض نمی‌شوند؛ «نخستین برگشت»
--    فقط یک بار گذاشته می‌شود؛ و تلاش «موفق» یا «ناموفق» دیگر عوض نمی‌شود، جز آخرین وضعیت و پرسش درگاه (`gateway_*`)، که استعلام خودکار
--    پول پرداخت دوم را تا «ریورس‌شده» با آن می‌پاید.
--  - `payments_flow`: گذار فقط «در انتظار» ← «موفق» یا «ناموفق»، و این دو نهایی‌اند.
--
-- موجودها می‌مانند: یک موفق برای هر سفارش (`payments_one_success`)، موفق با کد پیگیری (`payments_success_has_ref`)، موفق یعنی برابر مبلغ
-- (`payments_success_amount`، 0029)، و پیامک پرداخت فقط در گذار «موفق» (`payments_sms`، 0028).

CREATE FUNCTION payments_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  total bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT total_rials INTO total FROM orders WHERE id = NEW.order_id;
    IF NEW.amount_rials IS DISTINCT FROM total THEN
      RAISE EXCEPTION 'مبلغ تلاش پرداخت % است، نه جمع سفارش %', NEW.amount_rials, total
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_amount_is_total';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.order_id, NEW.provider, NEW.amount_rials, NEW.authority, NEW.gateway_order_id, NEW.return_key, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.order_id, OLD.provider, OLD.amount_rials, OLD.authority, OLD.gateway_order_id, OLD.return_key, OLD.created_at)
     OR (OLD.returned_at IS NOT NULL AND NEW.returned_at IS DISTINCT FROM OLD.returned_at)
  THEN
    RAISE EXCEPTION 'تلاش پرداخت % عوض نمی‌شود', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_frozen';
  END IF;

  IF OLD.status <> 'pending' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'تلاش پرداخت % از % به % نمی‌رود', OLD.id, OLD.status, NEW.status
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_flow';
    END IF;
    IF (NEW.ref_id, NEW.card_mask, NEW.failure_code, NEW.raw, NEW.verified_at, NEW.verified_amount_rials, NEW.settled_via, NEW.returned_at)
         IS DISTINCT FROM (OLD.ref_id, OLD.card_mask, OLD.failure_code, OLD.raw, OLD.verified_at, OLD.verified_amount_rials, OLD.settled_via, OLD.returned_at)
    THEN
      RAISE EXCEPTION 'تلاش پرداخت % بسته شده و عوض نمی‌شود', OLD.id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_frozen';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payments_guard BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_guard();
