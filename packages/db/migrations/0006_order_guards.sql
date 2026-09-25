-- محافظ‌های سفارش که drizzle نمی‌تواند در اسکیما بیان کند (برش ۳، ADR-034).
--
-- دست‌نویس، مثل 0001_guards و به همان دلیل: چیزی که خراب شدنش پول یا چیزی را که چاپ می‌شود عوض
-- می‌کند، باید در پایگاه داده غیرممکن باشد، نه اینکه در کد چک شود. هر خطا با نام محدودیت برمی‌گردد
-- (`check_violation` و `CONSTRAINT`)، تا کد و تست بدانند کدام محافظ رد کرد.

-- ── قیمت منجمد (قاعدهٔ ۶) ───────────────────────────────────────────────
--
-- قیمت سفارش هیچ‌وقت بازمحاسبه نمی‌شود. هر ستونی که قیمت یا کرایه را ساخته، و شناسه‌هایی که سفارش
-- با آن پیدا می‌شود، بعد از درج عوض‌شدنی نیست. نشانی، نام و کد پستی عوض‌شدنی می‌مانند (پشتیبانی
-- اشتباه تایپی را درست می‌کند)؛ استان نه، چون کرایه به منطقه‌اش بسته است. پرداخت هم برگشت ندارد:
-- `paid_at` و مهلت تحویل به پست که نشست، نمی‌روند، و سفارش پرداخت‌شده به «در انتظار» برنمی‌گردد.
CREATE FUNCTION orders_price_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.order_number, NEW.public_token, NEW.checkout_key, NEW.user_id, NEW.price_list_version,
      NEW.price_breakdown, NEW.quote_snapshot, NEW.subtotal_rials, NEW.discount_rials,
      NEW.shipping_rials, NEW.vat_rials, NEW.rounding_rials, NEW.total_rials, NEW.est_weight_grams,
      NEW.sla_days, NEW.shipping_method_id, NEW.shipping_zone_id, NEW.province_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.order_number, OLD.public_token, OLD.checkout_key, OLD.user_id, OLD.price_list_version,
      OLD.price_breakdown, OLD.quote_snapshot, OLD.subtotal_rials, OLD.discount_rials,
      OLD.shipping_rials, OLD.vat_rials, OLD.rounding_rials, OLD.total_rials, OLD.est_weight_grams,
      OLD.sla_days, OLD.shipping_method_id, OLD.shipping_zone_id, OLD.province_id, OLD.created_at)
  THEN
    RAISE EXCEPTION 'قیمت سفارش % منجمد است', OLD.order_number
      USING ERRCODE = 'check_violation', CONSTRAINT = 'orders_price_frozen';
  END IF;
  IF (OLD.paid_at IS NOT NULL AND NEW.paid_at IS DISTINCT FROM OLD.paid_at)
     OR (OLD.post_handoff_due_at IS NOT NULL AND NEW.post_handoff_due_at IS DISTINCT FROM OLD.post_handoff_due_at)
     OR (OLD.status = 'paid' AND NEW.status IN ('awaiting_payment', 'expired'))
  THEN
    RAISE EXCEPTION 'پرداخت سفارش % برگشت ندارد', OLD.order_number
      USING ERRCODE = 'check_violation', CONSTRAINT = 'orders_payment_final';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER orders_price_frozen BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_price_frozen();
--> statement-breakpoint

-- ── مشخصات جزوه منجمد ───────────────────────────────────────────────────
--
-- چیزی که چاپ می‌شود هم مثل قیمت: قلم (صفحه، نسخه، دورو، صحافی)، بخش‌ها و قاعده‌های رنگ بعد از
-- درج عوض نمی‌شوند. فقط ستون‌های PDF جزوه، که کارگر بعد از پرداخت پر می‌کند، آزادند. حذف (با حذف
-- سفارش) مانعی ندارد؛ حذف تنهای قاعده یا بخش را محافظ پوشش پایین می‌گیرد.
CREATE FUNCTION order_items_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.order_id, NEW.seq, NEW.page_count, NEW.copies, NEW.sides_mode, NEW.binding_type_id)
     IS DISTINCT FROM
     (OLD.order_id, OLD.seq, OLD.page_count, OLD.copies, OLD.sides_mode, OLD.binding_type_id)
  THEN
    RAISE EXCEPTION 'مشخصات جزوه منجمد است'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'order_items_frozen';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER order_items_frozen BEFORE UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION order_items_frozen();
--> statement-breakpoint
CREATE FUNCTION order_spec_rows_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'بخش‌ها و قاعده‌های جزوه منجمدند'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'order_spec_frozen';
END $$;
--> statement-breakpoint
CREATE TRIGGER order_item_sections_frozen BEFORE UPDATE ON order_item_sections
  FOR EACH ROW EXECUTE FUNCTION order_spec_rows_frozen();
--> statement-breakpoint
CREATE TRIGGER print_rules_frozen BEFORE UPDATE ON print_rules
  FOR EACH ROW EXECUTE FUNCTION order_spec_rows_frozen();
--> statement-breakpoint

-- ── هر صفحه دقیقاً یک قاعده (ADR-002، ADR-030) ─────────────────────────
--
-- قاعده‌های یک قلم باید صفحه‌های ۱ تا جمع بخش‌ها را دقیقاً یک بار بپوشانند: صفحهٔ جاافتاده یعنی
-- صفحه‌ای که چاپ و قیمت نمی‌شود، و صفحهٔ دوبار پوشانده یعنی دو رنگ برای یک صفحه. جمع صفحه‌های
-- بخش‌ها هم باید همان `page_count` قلم باشد، که قیمت از آن آمده.
--
-- معوق، در پایان تراکنش: قلم، بخش‌ها و قاعده‌ها با هم درج می‌شوند و در میانهٔ کار طبیعی است که
-- ناقص باشند. یعنی سفارش **فقط** در یک تراکنش ساخته می‌شود.
CREATE FUNCTION order_item_pages_ok(item uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  total integer;
  sections_total bigint;
  covered bigint;
  distinct_pages bigint;
  outside bigint;
BEGIN
  SELECT page_count INTO total FROM order_items WHERE id = item;
  IF NOT FOUND THEN
    RETURN; -- قلم با سفارشش حذف شده
  END IF;

  SELECT coalesce(sum(page_count), 0) INTO sections_total FROM order_item_sections WHERE order_item_id = item;

  SELECT count(*), count(DISTINCT p), count(*) FILTER (WHERE p < 1 OR p > total)
    INTO covered, distinct_pages, outside
    FROM print_rules rule,
         jsonb_array_elements(rule.page_ranges) AS range_,
         generate_series((range_->>0)::int, (range_->>1)::int) AS p
   WHERE rule.order_item_id = item;

  IF sections_total <> total OR outside > 0 OR covered <> total OR distinct_pages <> total THEN
    RAISE EXCEPTION 'قاعده‌های جزوه صفحه‌های ۱ تا % را دقیقاً یک بار نمی‌پوشانند (بخش‌ها: %، پوشیده: %، یکتا: %، بیرون: %)',
      total, sections_total, covered, distinct_pages, outside
      USING ERRCODE = 'check_violation', CONSTRAINT = 'order_items_cover_pages';
  END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION order_item_pages_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'order_items' THEN
    PERFORM order_item_pages_ok(CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END);
  ELSE
    PERFORM order_item_pages_ok(CASE WHEN TG_OP = 'DELETE' THEN OLD.order_item_id ELSE NEW.order_item_id END);
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER order_items_cover_pages AFTER INSERT OR UPDATE ON order_items
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION order_item_pages_check();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER order_item_sections_cover_pages AFTER INSERT OR UPDATE OR DELETE ON order_item_sections
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION order_item_pages_check();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER print_rules_cover_pages AFTER INSERT OR UPDATE OR DELETE ON print_rules
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION order_item_pages_check();
