# معماری جزوه‌یار

سند کامل معماری. دلیل هر تصمیم در `docs/DECISIONS.md`. تعرفه و فرمول قیمت در `docs/PRICING.md`.

**وضعیت:** معماری تأیید شد. برش ۰ تا ۶ ساخته، تست و مستقر شده، و مرحلهٔ طراحی رابط کاربری تمام است (`docs/UI.md`؛ قدم ۵ در ۷٫۴). برش ۶ (ارسال و رهگیری) تمام شد: برنامه (#51) و ۶٫۱ تا ۶٫۴ (#52 تا #55) ادغام و مستقر شدند. برش ۷ (پیامک و درگاه واقعی، و باز شدن مسیر خرید روی سایت زنده) ساخته شد: هر شش PR ادغام شد (#57 تا #66)، و روشن کردن `live` روی سایت زنده کار دستی و با صاحب پروژه است؛ برنامه و وضعیتش در بخش ۸، «برش ۷». خواسته‌های تازهٔ صاحب پروژه (۱۴۰۵/۰۷/۲۱): نقشهٔ راه برش‌های ۸ تا ۱۲ **تأیید شد** (همان روز، سؤال‌های ۱۷۸ تا ۲۱۴، همه طبق پیشنهاد؛ بخش ۸، «برش ۸ تا ۱۲»؛ ADR-053)، و برش ۸ با ۸٫۱ شروع شد: هشدار کیفیت اسکن و حاشیه فقط در پنل (#67، ادغام شد؛ بخش ۸، «۸٫۱»). طرح نمونهٔ میز سفارش برش ۸ (پیش از ۸٫۲) تأیید شد (۱۴۰۵/۰۷/۲۲، سؤال‌های ۲۱۵ تا ۲۲۵ همه طبق پیشنهاد؛ `docs/UI.md`، قدم ۱۱)، ۸٫۲، چند جزوه در یک سفارش، ادغام شد (#68؛ بخش ۸، «۸٫۲»)، ۸٫۳، کاتالوگ چاپ (اندازهٔ کاغذ، نرخ هر حالت، کاغذها و صحافی‌ها، و ویرایشگر کامل تعرفه)، ادغام شد (#69؛ بخش ۸، «۸٫۳»؛ ADR-054)، و ۸٫۴، حداقل سفارش، فرمت و حجم و صفحهٔ هر فایل از پنل و خاموش موقت گزینه‌ها، ادغام شد (#70؛ بخش ۸، «۸٫۴»؛ ADR-055). طرح نمونهٔ پنل برش ۹ (پیش از ۹٫۱) تأیید شد (۱۴۰۵/۰۷/۲۳، سؤال‌های ۲۲۷ تا ۲۳۴؛ `docs/UI.md`، قدم ۱۱)، ۹٫۱، فهرست جمع‌وجور با مشخصات فایل‌ها و «همهٔ فایل‌ها (zip)» هر سفارش، ادغام شد (#71؛ بخش ۸، «۹٫۱»؛ ADR-056)، ۹٫۲، قالب HTML برگه‌ها (بیجک و برگهٔ اول)، ادغام شد (#72؛ بخش ۸، «۹٫۲»؛ ADR-057)، ۹٫۳، یادداشت داخلی سفارش و ویرایش دستی بی تغییر قیمت، ادغام شد (#73؛ بخش ۸، «۹٫۳»؛ ADR-058)، و ۹٫۴، نقش حسابدار و عوض کردن نقش ادمین، ادغام شد (#74؛ بخش ۸، «۹٫۴»؛ ADR-059)؛ با آن برش ۹ تمام شد. برش ۱۰ با ۱۰٫۱ شروع شد: تخصیص با فاصله، «شلوغ» و «تعطیل» هر چاپخانه، و تخصیص دستی، ادغام شد (#75؛ بخش ۸، «۱۰٫۱»؛ ADR-060)، و ۱۰٫۲، گزارش تولید هر چاپخانه و خروجی اکسل و PDF گزارش‌ها، ادغام شد (#76؛ بخش ۸، «۱۰٫۲»؛ ADR-061)، و ۱۰٫۳، تسویهٔ چاپخانه‌ها با سهم درصدی منجمد هر سفارش و دفتر پرداخت، ادغام شد (#84؛ بخش ۸، «۱۰٫۳»؛ ADR-069)، و ۱۰٫۴، موجودی کاغذ همهٔ چاپخانه‌ها با کم شدن خودکار در «شروع چاپ» و هشدار کمبود، ساخته شد (این PR؛ بخش ۸، «۱۰٫۴»؛ ADR-070)، و با آن برش ۱۰ و نقشهٔ راه برش‌های ۸ تا ۱۲ تمام شد. طرح نمونهٔ ۱۱٫۱ (ویرایشگر متن‌های سایت و نوار اعلان) و طرح نمونهٔ ۱۲٫۱ («سفارش‌های من» و پشتیبانی، #77) تأیید شدند (۱۴۰۵/۰۷/۲۶، سؤال‌های ۲۸۲ تا ۲۹۴ و ۳۰۵ تا ۳۱۶ همه طبق پیشنهاد؛ `docs/UI.md`، قدم ۱۱، «پیش از ۱۱٫۱» و «پیش از ۱۲٫۱»). برش ۱۱ با ۱۱٫۴ شروع شد: کد تخفیف و تخفیف سفارش بزرگ، ادغام شد (#77؛ بخش ۸، «۱۱٫۴»؛ ADR-062)، ۱۱٫۱، متن‌های سایت و اطلاعات تماس از پنل، ادغام شد (#80؛ بخش ۸، «۱۱٫۱»؛ ADR-065)، و ۱۱٫۳، نوار اعلان بالای سربرگ سایت، ادغام شد (#81؛ بخش ۸، «۱۱٫۳»؛ ADR-066)، و ۱۱٫۲، لوگو و بنر صفحهٔ اصلی از پنل، ادغام شد (#82؛ بخش ۸، «۱۱٫۲»؛ ADR-067)، و با آن برش ۱۱ تمام شد. برش ۱۲ با ۱۲٫۲ شروع شد: مسدودی موبایل مشتری، ادغام شد (#78؛ بخش ۸، «۱۲٫۲»؛ ADR-063)، ۱۲٫۳، رضایت و نظر مشتری، ادغام شد (#79؛ بخش ۸، «۱۲٫۳»؛ ADR-064)، و ۱۲٫۱، «سفارش‌های من» و پیام به پشتیبانی، ادغام شد (#83؛ بخش ۸، «۱۲٫۱»؛ ADR-068)، و با آن برش ۱۲ تمام شد. پاسخ‌های صاحب پروژه (۱۴۰۵/۰۷/۲۶): فقط پست پیشتاز (۱۹۱)، پس ۸٫۵ ساخته نمی‌شود و برش ۸ تمام است؛ سهم چاپخانه درصدی از سفارش (۲۰۳، برای ۱۰٫۳)؛ و «بنر» تصویر (۲۰۶، برای ۱۱٫۲). پاسخ ۲۰۴ (۱۴۰۵/۰۷/۲۸): موجودی کاغذ همهٔ چاپخانه‌ها، برای ۱۰٫۴.

---

## ۱. استک

| لایه | انتخاب | جایگزین رد‌شده |
|---|---|---|
| چارچوب وب | Next.js 15 (App Router) | Django + HTMX — پنل ادمین آماده، ولی موتور قیمت دو بار پیاده می‌شد |
| زبان مشترک | TypeScript | — (تحمیل‌شده توسط ADR-001) |
| تحلیل مرورگر | `pdfjs-dist` در Web Worker | ندارد؛ تنها پارسر PDF بالغ در مرورگر |
| کارگر اسناد | Python + PyMuPDF + numpy + LibreOffice (بدون رابط گرافیکی)، روی ایمیج پایه‌ای که فقط CI می‌سازد (ADR-027). الگوریتم رنگ با بردارهای هم‌ارزی به مرورگر قفل است (ADR-025) | همه‌چیز در Node با `node-canvas` |
| پایگاه داده | PostgreSQL 17 | MySQL — محدودیت بازه‌ای ندارد |
| صف کار | جدول `jobs` با `FOR UPDATE SKIP LOCKED` | Celery / BullMQ / Redis Streams |
| کش و نرخ | سقف کد پیامکی در پستگرس (`otp_requests`، ADR-033). Redis در compose هست و فعلاً کاری ندارد | Redis برای سقف OTP — یک وابستگی بیشتر در کد (۱۴۰۵/۰۷/۰۴) |
| ذخیره‌سازی | S3 API؛ Garage محلی → پارس‌پک یا آروان (ADR-023) | دیسک محلی — آپلود از سرور رد می‌شد؛ MinIO — از Docker Hub حذف و بایگانی شد |
| ORM | Drizzle | Prisma — مهاجرت کم‌شفاف‌تر |
| استایل | Tailwind v4 با توکن‌های پالت | CSS Modules |
| احراز هویت | دست‌ساز (OTP + نشست کوکی) | NextAuth |
| پروکسی و TLS | Nginx + certbot | Caddy — گواهی خودکار، ولی صاحب پروژه Nginx را ترجیح داد (ADR-015) |
| تاریخ | `Intl` با تقویم `persian` | `date-fns-jalali` — وابستگی اضافه‌ای که Node 22 و همهٔ مرورگرهای هدف بی‌آن هم جواب می‌دهند |
| تست مرورگر | Playwright | — (کل تز محصول به رفتار مرورگر بند است؛ تست واحد نمی‌سنجدش) |

نسخه‌ها عمداً یک major عقب پین شده‌اند (Next 15.5.25 نه 16، pdfjs-dist 4.10.38
نه 6): معیار «پایدار و مستندات بالغ» است، نه جدیدترین.

---

## ۲. مسیر فایل و نقطهٔ تصمیم قیمت

```
      خروجی            موتور مشترک           تحلیل                 ورودی
 ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐   ┌─────────────┐
 │قیمت پیش‌نمایش│◄──┤              │◄──┤ مرورگر           │◄──┤ PDF         │
 │  ≤ 2 ثانیه   │   │  @jozveyar/  │   │ Web Worker       │   │ مسیر مرورگر │
 └──────────────┘   │   pricing    │   │ pdf.js، DPI پایین│   └─────────────┘
                    │              │   └────────┬─────────┘
                    │ TypeScript   │            ┆ همان آستانه‌ها
                    │   خالص       │            ┆ همان قرارداد
 ┌──────────────┐   │ یک کد،       │   ┌────────┴─────────┐   ┌─────────────┐
 │  قیمت قطعی   │◄──┤ دو زمان اجرا │◄──┤ کارگر Python     │◄──┤Word/PPT/عکس │
 │ منبع حقیقت   │   │              │   │LibreOffice+PyMuPDF│  │ مسیر سرور   │
 └──────────────┘   └──────────────┘   └──────────────────┘   └─────────────┘
```

دو مسیر ورودی جدا، یک قرارداد تحلیل (`PageAnalysis`)، یک موتور قیمت.
چون همان فایل TypeScript هر دو طرف اجرا می‌شود، واگرایی قیمت یک باگ ممکن نیست.

## ۳. توپولوژی استقرار

```
   ┌────────────┐  URL امضاشده   ┌──────────────────┐
   │  مرورگر    │◄──────────────►│ Nginx → web+admin│
   │  کاربر     │                │ Next.js، ۲ ساب‌دامین
   └─────┬──────┘                └────────┬─────────┘
         │ آپلود مستقیم، ۸MB تکه          │ سفارش و صف کار
         │ Nginx /jozveyar/ ← Garage      ▼
         │                       ┌──────────────────┐
         │                       │   PostgreSQL     │
         │                       │ سفارش، تحلیل، صف │
         │                       └────────┬─────────┘
         ▼                                │ poll هر ۲ ثانیه
   ┌────────────┐  خواندن/نوشتن  ┌────────┴─────────┐
   │آبجکت استوریج│◄─────────────►│  کارگر اسناد     │
   │   S3 API   │                │LibreOffice+PyMuPDF│
   └────────────┘                └──────────────────┘
```

**ادعای کلیدی:** بایت‌های فایل هیچ‌وقت از کانتینر `web` رد نمی‌شوند. مرورگر URL امضاشده
می‌گیرد و مستقیم به استوریج آپلود می‌کند؛ کارگر هم مستقیم از استوریج می‌خواند.
این همان چیزی است که شکاف «فایل بزرگ ← برو تلگرام» رقبا را می‌بندد، و آپلود قطع‌شده
از همان تکه ادامه می‌گیرد. ✅ ساخته شد — پروتکل و دلایلش در ADR-024؛ Nginx مسیر
`/jozveyar/` را هم‌مبدأ به Garage می‌دهد، پس نه ساب‌دامین لازم است نه CORS.

## ۴. چیدمان ریپو

```
jozveyar/
├─ apps/
│  ├─ web/              Next.js — سایت عمومی، فلوی سفارش، API
│  └─ admin/            Next.js — پنل ادمین (ساب‌دامین و کانتینر جدا)
├─ packages/
│  ├─ pricing/          موتور قیمت — TS خالص، بدون وابستگی
│  ├─ analysis/         تشخیص رنگ و صفحه — مشترک با کارگر
│  ├─ contracts/        اسکیمای zod و تایپ‌های مشترک
│  ├─ db/               اسکیمای drizzle + مهاجرت‌ها
│  ├─ storage/          آداپتور استوریج — SigV4 دست‌نویس، بدون SDK
│  ├─ geo/              استان‌ها، شهرها، منطقهٔ کرایه و جست‌وجوی شهر (برش ۳)
│  ├─ text/             نرمال‌سازی فارسی، ارقام، تاریخ شمسی، روز کاری
│  └─ ui/               کامپوننت و توکن‌های پالت
├─ services/
│  └─ docworker/        Python — LibreOffice، PyMuPDF (Dockerfile.base: ایمیج پایه، ADR-027)
├─ infra/
│  ├─ docker-compose.yml · docker-compose.prod.yml · garage.toml
│  ├─ nginx/ · deploy-bundle.sh · setup-storage.sh · garage-init.sh
└─ docs/
   ├─ ARCHITECTURE.md · PRICING.md · DECISIONS.md
```

---

## ۵. مدل داده

### جدول‌های محوری

```sql
-- تحلیل: «فایل چه هست». همیشه per-page، مستقل از حالت فعال محصول.
CREATE TABLE documents (
  id                uuid PRIMARY KEY,
  session_id        text NOT NULL,          -- ناشناس، قبل از هویت
  user_id           uuid REFERENCES users(id),
  source_kind       source_kind NOT NULL,   -- pdf | docx | pptx | image
  original_filename text NOT NULL,
  byte_size         bigint NOT NULL,
  sha256            bytea,
  storage_key_src   text,                   -- فایل خام
  storage_key_pdf   text,                   -- PDF یکدست‌شده (پس از تبدیل/ادغام)
  storage_key_print text,                   -- خروجی آمادهٔ چاپ
  status            document_status NOT NULL,
  page_count        integer,

  -- دو تحلیل، عمداً جدا: یکی برای مقایسه و کالیبراسیون
  analysis_client   jsonb,                  -- آنچه مرورگر دید
  analysis_server   jsonb,                  -- منبع حقیقت
  analysis_engine   text,                   -- نسخهٔ الگوریتم
  analysis_config   jsonb,                  -- آستانه‌هایی که این نتیجه را ساختند
  divergence        jsonb,                  -- اختلاف مرورگر و سرور

  -- تجمیع‌های غیرنرمال: قیمت و آمار بدون باز کردن jsonb
  color_page_count   integer,
  bw_page_count      integer,
  blank_page_count   integer,
  low_dpi_page_count integer,
  page_size_summary  jsonb,                 -- {"A4":140,"A5":7}
  warnings           jsonb,                 -- DPI پایین، حاشیهٔ کم، صفحهٔ خالی

  purge_after       timestamptz,            -- سیاست نگهداری (۱ تا ۲ روز)
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- جزوه: یک قلم سفارش، از یک یا چند سند، پشت‌سرهم و بی صفحهٔ سفید (ADR-030).
CREATE TABLE order_item_sections (
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  seq           smallint NOT NULL,          -- ترتیب صحافی
  document_id   uuid NOT NULL REFERENCES documents(id),
  page_count    integer NOT NULL,           -- شمارش سرور، نه عدد مرورگر
  PRIMARY KEY (order_item_id, seq)
);

-- انتخاب: «کاربر چه می‌خواهد» — روی جزوه، نه روی سند. حالت فعلی = یک سطر.
-- حالت ترکیبی = چند سطر.
CREATE TABLE print_rules (
  id            uuid PRIMARY KEY,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  seq           smallint NOT NULL,
  page_ranges   jsonb NOT NULL,             -- سراسری در جزوه: [[1,11],[13,14],[16,150]]
  color_mode    color_mode NOT NULL,        -- color | bw
  paper_type_id text NOT NULL,              -- با تعرفهٔ سفارش سنجیده، بی کلید خارجی (نسخه‌دار)
  UNIQUE (order_item_id, seq)
);
-- قاعده‌های یک جزوه باید ۱..جمع صفحه‌های بخش‌ها را دقیقاً و بدون همپوشانی
-- بپوشانند. در اپ و با تریگر معوق `order_items_cover_pages` در پایان تراکنش
-- (0006_order_guards). قلم، بخش‌ها و قاعده‌ها بعد از درج عوض نمی‌شوند.

-- سفارش (✅ جدول‌ها در ۳الف): قیمت برای همیشه منجمد می‌شود، هیچ‌وقت بازمحاسبه
-- نمی‌شود — تریگر `orders_price_frozen` عوض کردنش را رد می‌کند (ADR-034).
-- ✅ ۴٫۳ (ADR-039): پس از پرداخت paid ← printing ← handed_to_post، و cancelled از paid یا printing؛
-- برگرداندن فقط یک قدم. همان تریگر هر گذار دیگری را با `orders_status_flow` رد می‌کند (0011_order_status_guards).
CREATE TABLE orders (
  id                  uuid PRIMARY KEY,
  order_number        integer UNIQUE NOT NULL,  -- از 10001؛ همین در پیامک، درگاه و فایل پست
  public_token        uuid UNIQUE NOT NULL,     -- برای URL، غیرقابل شمارش
  checkout_key        uuid UNIQUE NOT NULL,     -- دو کلیک «پرداخت»، یک سفارش
  user_id             uuid NOT NULL REFERENCES users(id),
  status              order_status NOT NULL,    -- awaiting_payment | paid | expired | printing | handed_to_post | cancelled
  price_list_version  integer NOT NULL,
  price_breakdown     jsonb NOT NULL,           -- عکس کامل محاسبه
  quote_snapshot      jsonb,                    -- آنچه مرورگر نشان داده بود
  subtotal_rials      bigint NOT NULL,
  discount_rials      bigint NOT NULL DEFAULT 0,
  shipping_rials      bigint NOT NULL,
  vat_rials           bigint NOT NULL DEFAULT 0,
  rounding_rials      bigint NOT NULL DEFAULT 0,
  total_rials         bigint NOT NULL,          -- CHECK: جمع تکه‌ها
  est_weight_grams    integer NOT NULL,
  sla_days            smallint NOT NULL,
  paid_at             timestamptz,
  post_handoff_due_at timestamptz,              -- پایان روز کاری تعهد تحویل به پست (ADR-013)
  handed_to_post_at   timestamptz,              -- ۴٫۳: فقط و همیشه در handed_to_post (CHECK `orders_handed_at`)
  files_deleted_at    timestamptz,              -- ۵٫۱ (ADR-044): فایل‌های سفارش پاک شد؛ فقط سفارش بسته، و پس از آن وضعیت قفل
  shipping_method_id  text NOT NULL,            -- (نسخهٔ تعرفه، روش) ← shipping_methods
  shipping_zone_id    text NOT NULL,            -- منطقهٔ کرایه در لحظهٔ سفارش
  province_id         smallint NOT NULL,
  city_id             integer,                  -- null: شهر در فهرست نبود؛ (شهر، استان) ← cities
  recipient_name      text NOT NULL,
  recipient_phone     text NOT NULL,            -- همان موبایل تأییدشدهٔ پرداخت
  address_text        text NOT NULL,
  postal_code         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
-- ✅ `print_partner_id` (ADR-012، ۵٫۲، ADR-042): چاپخانهٔ امروز سفارش ← print_partners؛ با پرداخت پر می‌شود، فقط وقتی سفارش
-- paid است عوض می‌شود، فقط به چاپخانهٔ فعال، و خالی نمی‌شود (تریگر `orders_print_partner`)؛ سفارش پرداخت‌نشده ندارد
-- (CHECK `orders_partner_paid`). ایندکس (چاپخانه، وضعیت) برای ۵٫۳.

-- ✅ چاپخانه‌ها (۵٫۲، ADR-042، ADR-012): چاپخانه شهر دارد، حتی وقتی همه در تهران‌اند. پاک نمی‌شود، غیرفعال می‌شود، و با سفارش
-- باز نه (`print_partners_guard`؛ 0017_print_partners و 0018_print_partners_guards).
CREATE TABLE print_partners (
  id             uuid PRIMARY KEY,
  name           text NOT NULL UNIQUE,          -- فارسی‌نرمال، ۱ تا ۱۰۰ نویسه
  city_id        integer NOT NULL,              -- (شهر، استان) ← cities، مثل سفارش
  province_id    smallint NOT NULL,
  is_default     boolean NOT NULL DEFAULT false, -- حداکثر یکی (ایندکس یکتای جزئی)، و فقط فعال
  deactivated_at timestamptz,                   -- null: فعال؛ زمانش برای «از … سفارش تازه نمی‌گیرد»
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid                           -- ادمین؛ بی کلید خارجی، مثل price_lists.created_by
);

-- ✅ هر تخصیص و جابه‌جایی چاپخانهٔ یک سفارش (۵٫۲). زنجیره: هر ردیف از همان چاپخانه‌ای که ردیف قبلی به آن رسید، و در COMMIT
-- آخرین ردیف همان `orders.print_partner_id` (تریگرهای معوق)؛ عوض و پاک نمی‌شود، جز با خود سفارش.
CREATE TABLE order_assignments (
  id              bigserial PRIMARY KEY,
  order_id        uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_partner_id uuid REFERENCES print_partners(id),     -- null: اولین تخصیص
  to_partner_id   uuid NOT NULL REFERENCES print_partners(id),
  at              timestamptz NOT NULL,
  actor           text NOT NULL,                           -- system (هنگام پرداخت) | admin
  admin_user_id   uuid REFERENCES admin_users(id),         -- فقط و همیشه برای admin
  rule            text,                                    -- فقط system: city | province | default | oldest
  reason          text                                     -- فقط admin: ۱ تا ۵۰۰ نویسه
);

-- ✅ یادداشت داخلی سفارش (۹٫۳، ADR-058): مالک و متصدی می‌نویسند و همه را می‌بینند؛ چاپخانه فقط «چاپخانه هم ببیند» را، روی سفارش‌های
-- خودش و در خود کوئری. فقط افزودنی (`order_notes_append_only`، 0043؛ پاک شدن فقط با خود سفارش)؛ یک یادداشت برای هر فرم.
CREATE TABLE order_notes (
  id              bigserial PRIMARY KEY,
  order_id        uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  admin_user_id   uuid NOT NULL REFERENCES admin_users(id),
  body            text NOT NULL,           -- ۱ تا ۱٬۰۰۰ نویسه، هر خط فارسی‌نرمال، بی فاصله و خط تازه در لبه (order_notes_body)
  partner_visible boolean NOT NULL,        -- «چاپخانه هم ببیند»
  request_id      uuid NOT NULL,           -- شناسهٔ فرم، یکتا (order_notes_request): دو کلیک یک یادداشت
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ✅ فایل چاپ هر جلد هر جزوه (۵٫۱، ADR-043): A4 عمودی، جلدها با `sheetsPerVolume` ریز قیمت منجمد. ردیف ثبت‌شده عوض
-- نمی‌شود (`order_print_files_frozen`)، و جلدهای هر جزوه در COMMIT باید ۱..صفحهٔ آخر را پشت‌سرهم و به شمار `volumes` ریز
-- قیمت بپوشانند (تریگر معوق `order_print_files_cover`؛ 0016_print_files_guards).
CREATE TABLE order_print_files (
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  volume        smallint NOT NULL,
  first_page    integer NOT NULL,           -- شمارهٔ صفحهٔ سراسری جزوه، هر دو سر شامل
  last_page     integer NOT NULL,
  storage_key   text NOT NULL,              -- زیر orders/؛ همان PDF جزوه، اگر چیزی عوض نشد و یک جلد است
  size_bytes    bigint NOT NULL,
  sha256        text NOT NULL,
  changes       jsonb,                      -- resized [از، تا، پهنا، ارتفاع]، rotated و annotated [از، تا]؛ null یعنی بی تغییر
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_item_id, volume)
);

-- ✅ برگهٔ سفارش (۵٫۱، ADR-043)، یکی برای هر سفارش؛ با هر ساختن دوباره جایگزین می‌شود. پنل فقط برگه‌ای را می‌دهد که
-- `stamp`ش همان `order_ticket_stamp(orders)` امروز است (نام، موبایل، نشانی و کد پستی گیرنده). از ۹٫۲ (ADR-057) از قالب HTML: بیجک، بعد برگهٔ اول
-- هر جزوه، با `page_count` و شناسهٔ قالب هر نوع (`bijak_template_id`، `first_page_template_id`؛ خالی یعنی قالب پیش‌فرض).
CREATE TABLE order_tickets (
  order_id    uuid PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  storage_key text NOT NULL,                -- orders/<شماره>/ticket-<sha256 خود PDF>.pdf (تا ۹٫۱ اثر انگشت داده)
  size_bytes  bigint NOT NULL,
  sha256      text NOT NULL,
  preview_key text NOT NULL,                -- صفحهٔ اول، PNG برای پنل؛ صفحهٔ n ام کنارش (-n.png، ۹٫۲)
  stamp       text NOT NULL,
  built_at    timestamptz NOT NULL DEFAULT now()
);

-- ✅ ۶٫۱ (ADR-045، `0021_shipments.sql` و `0022_shipments_guards.sql`): هر فایل پستی که به پنل داده شد، با بایت‌های خامش (سقف
-- ۲ مگابایت). کارگر جدول‌هایش را می‌خواند (`read_post_file`) و پنل تفسیر و پیش‌نمایش می‌کند. همان فایل یک بار: ایندکس یکتای
-- جزئی `shipment_imports_one_file` روی sha256 برای «در حال خواندن»، «خوانده شد» و «ثبت شد». گذار وضعیت، ستون‌های منجمد و
-- پاک‌نشدنی با تریگر `shipment_imports_guard`.
CREATE TABLE shipment_imports (
  id               uuid PRIMARY KEY,
  carrier          text NOT NULL,           -- 'iran_post' (ShippingCarrier، ADR-008)
  filename         text NOT NULL,
  size_bytes       integer NOT NULL,        -- ۱ بایت تا ۲ مگابایت
  sha256           text NOT NULL,
  raw              bytea,                   -- فایل خام؛ N روز پس از ورود پاک (ADR-044)، دورانداخته همان لحظه
  status           text NOT NULL,           -- reading ← read | unreadable | discarded؛ read ← committed | discarded؛ committed ← reverted
  format           text,                    -- html | csv | xlsx، از محتوا
  tables           jsonb,                   -- جدول‌های خوانده‌شده، فقط رشته
  error_code       text,                    -- unreadable: xls_binary، no_table، too_large، bad_xlsx، too_many_rows، read_failed
  print_partner_id uuid REFERENCES print_partners(id),  -- واردکنندهٔ چاپخانه (۶٫۲): فقط سفارش‌های همین (ADR-046)
  created_by       uuid NOT NULL REFERENCES admin_users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  read_at          timestamptz,
  committed_by     uuid REFERENCES admin_users(id),
  committed_at     timestamptz,
  discarded_by     uuid REFERENCES admin_users(id),     -- null با discarded_at: کارگر، پیش‌نویسی که N روز ثبت نشد
  discarded_at     timestamptz,
  reverted_by      uuid REFERENCES admin_users(id),     -- برگرداندن: یک بار، مالک، با دلیل
  reverted_at      timestamptz,
  revert_reason    text,
  purged_at        timestamptz              -- raw و tables پاک شدند
);

-- ✅ ۶٫۱ (ADR-046): همهٔ سطرهای ورود ثبت‌شده، با حکم؛ فقط در «ثبت» نوشته می‌شوند (پیش‌نمایش از `tables` ساخته می‌شود).
-- عوض و پاک نمی‌شوند (`shipment_import_rows_frozen`)، جز متن سطری که مرسولهٔ ما نشد، N روز بعد. ✅ ۶٫۲ (ADR-046، تصمیم‌های ۷۵ و ۷۶،
-- `0023` و `0024`): صف جدول تصمیم ندارد. «همین است» و دادن دستی خودشان مرسوله‌اند (`shipments.matched_by`)، نامزدها هر بار زنده حساب
-- می‌شوند، و فقط «هیچ‌کدام» روی سطر می‌نشیند: یک بار، و فقط برای سطری که در صف است.
CREATE TABLE shipment_import_rows (
  import_id    uuid NOT NULL REFERENCES shipment_imports(id),
  row_no       integer NOT NULL,            -- شمارهٔ سطر پس از سرستون؛ اولی 1، مثل ستون «ردیف» فایل پست
  cells        jsonb,                       -- رشته‌های خام؛ سطری که مرسولهٔ ما نشد، N روز بعد پاک
  barcode      text,                        -- ۲۴ رقم، یا null: «خوانده نشد»
  order_number integer,                     -- فقط از «نام گ»، عدد انتهای رشته (ADR-010)
  name_g       text,
  destination  text,
  weight_grams integer,
  fare_rials   bigint,
  tax_rials    bigint,
  post_day     timestamptz,                 -- آغاز روز «تاریخ ثبت» به وقت تهران: روزی که پست بسته را گرفت (سؤال ۷۰)
  post_status  text,                        -- ستون «وضعیت»؛ فقط «فعال» ثبت‌شدنی (سؤال ۷۱)
  verdict      text NOT NULL,               -- matched | review | unmatched | duplicate | invalid | inactive | total
  reason       text,                        -- name_mismatch، cancelled، queued، manual_code، same_file، already…
  order_id     uuid REFERENCES orders(id) ON DELETE CASCADE,  -- سفارشی که سطر به آن نشست یا اشاره کرد
  dismissed_at timestamptz,                 -- «هیچ‌کدام» (۶٫۲)؛ فقط قطعی، صف یا پیدا نشد؛ متنش هم N روز بعد پاک
  dismissed_by uuid REFERENCES admin_users(id),
  PRIMARY KEY (import_id, row_no)
);

-- ✅ ۶٫۱ (ADR-045، ADR-046): مرسوله، یک بسته که به پست رسید. زنده فقط برای سفارش «تحویل پست شد» (تریگر معوق
-- `shipments_order_handed`، از هر دو سو)، و سفارشی که مرسولهٔ زنده دارد از «تحویل پست شد» بیرون نمی‌رود. بارکد یکتا میان زنده‌ها
-- (`shipments_live_barcode`)، و هر سطر حداکثر یک مرسولهٔ زنده. با سطرش می‌خواند (`shipments_row`)؛ فقط افزودنی؛ «کنار گذاشتن» یک
-- بار. `sms_message_id` با ۶٫۳ (ADR-047).
CREATE TABLE shipments (
  id             uuid PRIMARY KEY,
  order_id       uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  barcode        text NOT NULL,             -- CHECK: دقیقاً ۲۴ رقم
  import_id      uuid NOT NULL,             -- (import_id, row_no) ← shipment_import_rows
  row_no         integer NOT NULL,
  weight_grams   integer NOT NULL,
  fare_rials     bigint NOT NULL,           -- کرایه و مالیاتی که پست گرفت؛ گزارش حاشیه (ADR-048)
  tax_rials      bigint NOT NULL,
  post_day       timestamptz NOT NULL,      -- روز پست همان سطر
  matched_by     text NOT NULL,             -- rule (قطعی، «ثبت») | review («همین است»، ۶٫۲) | manual (دادن دستی، ۶٫۲)
  handed_order   boolean NOT NULL,          -- همین ثبت سفارش را «تحویل پست شد» کرد؛ برگرداندن فقط همین‌ها را برمی‌گرداند
  admin_user_id  uuid NOT NULL REFERENCES admin_users(id),   -- کسی که ثبت یا تأیید کرد
  created_at     timestamptz NOT NULL DEFAULT now(),
  voided_at      timestamptz,               -- کنار گذاشته: برگرداندن ورود، یا یک کد با دلیل (مالک، ۶٫۲)؛ سطرش به صف برمی‌گردد
  voided_by      uuid REFERENCES admin_users(id),
  void_reason    text,
  sms_message_id bigint REFERENCES sms_messages(id)  -- ✅ ۶٫۳: پیامک رهگیری همین کد؛ از ۶٫۳ هرگز خالی (`shipments_sms`)
);

-- ✅ ۶٫۳ (ADR-047، `0025` و `0026`): پیامک رهگیری هر مرسوله یک ردیف `sms_messages` است (`purpose` = `tracking`)، «منتظر» در همان تراکنش
-- مرسوله و فرستاده بعد از commit: `pending` ← `sending` ← `logged`|`sent`|`failed`، و `failed` (یا منتظر و در حال فرستادنی که ۵ دقیقه
-- ماند) ← `sending` با «دوباره بفرست». ستون‌های تازه: `params` (دو پارامتر قالب)، `attempts`، `attempted_at`، `sent_at`. همان کد برای همان
-- سفارش به همان ردیفی که «رفت» وصل می‌شود (سؤال ۶۷، `shipments_sms_once`)؛ کد کنارگذاشته «در حال فرستادن» نمی‌شود (`sms_messages_live`).

-- ✅ ۷٫۱ (ADR-049، `0027` و `0028`): پیامک پرداخت هم از صف، مثل رهگیری: ردیف «منتظر» `order_paid` در همان تراکنش پرداخت موفق، و
--   payments.sms_message_id bigint REFERENCES sms_messages(id)  -- شاخص یکتای `payments_sms`: یک پیامک برای هر پرداخت
-- تریگر `payments_sms`: تلاش تازه بی پیامک؛ گذار به «موفق» فقط با ردیف تازهٔ منتظر، بی تلاش، به موبایل گیرندهٔ همان سفارش؛ بعد منجمد.
-- `sms_messages.cost numeric` (CHECK `sms_messages_cost`: دست‌کم صفر؛ فقط با «رفت»، به واحد اعتبار sms.ir)؛ کد تأیید با پنل واقعی بی متن و
-- پارامتر (`sms_messages_otp_secret`)؛ «در حال فرستادن» پیامک پرداخت فقط با پرداخت موفق سفارشی لغونشده (`sms_messages_live`)؛ نمایهٔ
-- `otp_requests_session` برای سقف هر مرورگر.

-- ✅ ۷٫۲ (ADR-050، `0029` و `0030`): `payments` (از ۳الف) محافظ‌های خودش را می‌گیرد، و ستون‌های تازه:
--   return_key            text    -- کلید برگشت تصادفی ۱۲۸ بیتی همین تلاش (سؤال ۱۴۵)؛ یکتا، CHECK `payments_return_key` (۳۲ هگز)
--   gateway_order_id      text    -- شناسهٔ تلاش نزد درگاه («10027-3f9c2a1b»)؛ یکتا برای هر درگاه، برای زیبال اجباری
--   verified_amount_rials bigint  -- مبلغی که درگاه تأیید کرد؛ CHECK `payments_success_amount`: موفق یعنی برابر amount_rials
--   gateway_status        smallint    -- آخرین وضعیتی که درگاه گفت (کدهای زیبال)
--   gateway_error         text        -- چرا آخرین پرسش جواب روشن نگرفت، فقط برچسب (`rejected:115`)؛ CHECK `payments_gateway_error`
--   gateway_checked_at    timestamptz -- آخرین پرسش از درگاه
--   returned_at           timestamptz -- نخستین برگشت مرورگر مشتری؛ یک بار
--   settled_via           text        -- آنچه تلاش را بست: callback | auto | panel؛ CHECK `payments_settled_via`
-- تریگر `payments_guard`: مبلغ در درج برابر orders.total_rials (`payments_amount_is_total`)؛ سفارش، درگاه، مبلغ، شناسه‌ها، کلید و زمان ساختن
-- منجمد و نخستین برگشت یک بار (`payments_frozen`)؛ فقط pending ← succeeded | failed، و هر دو نهایی (`payments_flow`)؛ تلاش بسته جز
-- `gateway_*` منجمد. نمایهٔ `payments_pending` برای استعلام خودکار.

-- ✅ ۷٫۳ (ADR-051، `0031` تولیدی و `0032` دست‌نویس): بازپرداخت سفارش لغوشده. فقط افزودنی؛ فقط پرداخت موفقِ سفارش «لغو شد»؛ جمع
-- بازپرداخت‌های در جریان و موفق هر پرداخت ≤ مبلغ آن؛ یکی در جریان برای هر پرداخت؛ و سفارشی که بازپرداخت زنده دارد از «لغو شد» برنمی‌گردد.
CREATE TYPE refund_status AS ENUM ('pending', 'succeeded', 'failed');
CREATE TABLE refunds (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- با درخواست درگاه می‌رود، تا پاسخ گم‌شده با استعلام پیدا شود (سؤال ۱۵۴)
  order_id           uuid NOT NULL REFERENCES orders(id),
  payment_id         uuid NOT NULL REFERENCES payments(id),   -- فقط پرداخت موفقِ همان سفارش
  amount_rials       bigint NOT NULL,                         -- نسخهٔ اول: کل مبلغ پرداخت؛ CHECK `refunds_amount_positive`
  fee_rials          bigint,                                  -- کارمزد درگاه از کیف پول ما (سؤال ۱۵۵)؛ فقط راه درگاه
  method             text NOT NULL,                           -- gateway | manual؛ CHECK `refunds_method` شکل هر راه
  status             refund_status NOT NULL DEFAULT 'pending',-- pending ← succeeded | failed؛ دستی همان لحظه succeeded
  gateway_ref        text,                                    -- شناسهٔ بازپرداخت نزد درگاه؛ یک بار
  reference          text,                                    -- کد پیگیری بانک یا درگاه
  refunded_on        timestamptz,                             -- دستی: روز برگشت (آغاز روز تهران)
  note               text,                                    -- دستی: «چطور برگشت»، فقط پنل، تا ۲۰۰ نویسه
  gateway_status     smallint,                                -- آخرین وضعیتی که درگاه گفت
  gateway_error      text,                                    -- برچسب بی متن (`unavailable`، `rejected:N`)
  gateway_checked_at timestamptz,
  failure_reason     text,                                    -- balance | ip | token | unconfigured | not_found | other
  settled_via        text,                                    -- آنچه بست: request | auto | panel
  admin_user_id      uuid NOT NULL REFERENCES admin_users(id),-- مالک، با کد تازه
  raw                jsonb,                                   -- پاسخ درگاه، بی کلید
  created_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz                              -- CHECK `refunds_finished`: فقط نهایی، و `failed` فقط با علت
);
-- شاخص یکتای `refunds_one_pending` (payment_id، فقط pending)؛ `refunds_pending` برای استعلام خودکار. بی ستون `reason` برنامه (سؤال ۱۵۶):
-- دلیلش همان دلیل لغو است. تریگر `refunds_guard`: `refunds_cancelled_only`، `refunds_paid_only`، `refunds_within_payment` (درج سطر سفارش را
-- `FOR SHARE` و پرداخت را `FOR UPDATE` می‌گیرد)، `refunds_insert_state` (راه درگاه پیش از درخواست و بی پاسخ)، `refunds_flow`، `refunds_frozen`
-- و `refunds_append_only`؛ و بند تازهٔ `orders_status_flow` در `orders_price_frozen`.
```

### بقیهٔ جدول‌ها

| حوزه | جدول‌ها | نکتهٔ طراحی |
|---|---|---|
| تعرفه | `price_lists` `paper_types` `binding_types` `binding_rate_bands` `shipping_methods` `shipping_rates` | ✅ ساخته شد. نسخه‌دار با `version` و دقیقاً یکی فعال. بازه‌های صحافی و وزن با `EXCLUDE` — دیتابیس اجازهٔ همپوشانی نمی‌دهد. `print_rates` و `pricing_settings` جدول جدا نشدند؛ دلیل در ADR-021. `discount_tiers` هنوز ساخته نشده. ✅ ۴٫۵ (ADR-040): `activated_at`، `created_by` و `based_on`؛ نسخه‌ای که یک بار فعال شد با تریگرهای `price_lists_frozen` و `price_list_rows_frozen` عوض و پاک نمی‌شود، جز `is_active` (`0013_price_list_guards.sql`)، و CHECK `price_lists_active_activated`: نسخهٔ فعال زمان فعال شدن دارد |
| سند | `documents` `document_analyses` `document_pages` | ✅ ساخته شد. سند = فایل آپلودشده، قبل از اینکه سفارشی باشد. مالکش هش کوکی نشست ناشناس است (`session_hash`) و شناسهٔ آپلود چندتکه کنارش می‌ماند. تحلیل مرورگر و سرور **هر دو** ذخیره می‌شوند تا واگرایی قابل اندازه‌گیری باشد. `document_pages` اعداد خام رنگ را نگه می‌دارد، نه فقط بولین |
| سفارش | `order_items` `order_item_sections` `order_status_events` `payments` | ✅ جدول‌ها و محافظ‌ها در ۳الف (ADR-034). `order_items` یک ردیف به‌ازای هر **جزوه**، نه هر سند؛ `order_item_sections` سندها را به ترتیب صحافی نگه می‌دارد و PDF ادغام‌شده از همان ساخته می‌شود (ADR-030)، با کار `prepare_order` (`jobs.order_id`). `payments` هر تلاش پرداخت، و حداکثر یک پرداخت موفق برای هر سفارش. ✅ سرور در ۳ب: ساختن در یک تراکنش، برگشت از درگاه زیر قفل پرداخت و سفارش، و `prepare_order` کارگر (پایین، «۳ب»). ✅ ۴٫۳: `order_status_events.admin_user_id` برای گذار ادمین (CHECK `order_status_events_admin`: actor ادمین یعنی شناسهٔ ادمین)، و دلیل لغو و برگرداندن در `note`. ✅ ۵٫۱ (ADR-043): `order_print_files`، فایل چاپ هر جلد، و `order_tickets`، برگهٔ سفارش با کار جدای `prepare_ticket`؛ ADR-044: فایل‌های سفارش N روز پس از پست یا لغو پاک می‌شوند و `orders.files_deleted_at` ردش را نگه می‌دارد. ✅ ۷٫۲ (بالا؛ ADR-050): کلید برگشت، آنچه از درگاه دانستیم و محافظ‌های `payments` (`0029`، `0030`). ✅ ۷٫۳ (بالا؛ ADR-051): `refunds` و محافظ‌هایش (`0031`، `0032`). ✅ ۹٫۳ (بالا؛ ADR-058): `order_notes`، یادداشت داخلی فقط افزودنی (`0042`، `0043`) |
| ارسال | `shipping_methods` `shipping_zones` `provinces` `cities` `shipping_rates` `shipments` | روش‌ها فلگ فعال/غیرفعال دارند. نرخ = (روش × منطقه × بازهٔ وزن). ✅ منطقه‌ها، استان‌ها و شهرها در ۳الف، از `@jozveyar/geo` (۳۱ استان، ۱۳۲۳ شهر)؛ منطقه مال استان است: استان تهران `tehran`، بقیه `other`. `shipments`: ✅ ۶٫۱ (بالا، ADR-045)، هر بسته با بارکد، وزن، کرایه و مالیات واقعی |
| رهگیری | `shipment_imports` `shipment_import_rows` | هر آپلود یک تراکنش قابل بازگشت. سطر کم‌اطمینان بدون تأیید ادمین پیامک نمی‌شود. ✅ ۶٫۱ (بالا؛ ADR-045، ADR-046): پیش‌نمایش پیش از «ثبت»، «قطعی» با شماره، نام، مقصد، وضعیت و روز، «ثبت» زیر قفل با همان حکم‌ها، و برگرداندن کل ورود با یک کلیک (مالک). ✅ ۶٫۲ (ADR-046، «اجرا در ۶٫۲»): صف تأیید با مالک و متصدی (نامزدها، «همین است»، «هیچ‌کدام»، دادن دستی)، کنار گذاشتن یک کد، و ورود چاپخانه فقط برای سفارش‌های خودش |
| دسترسی | `admin_users` `admin_invites` `admin_sessions` `admin_login_attempts` `roles` `permissions` `role_permissions` `admin_user_roles` `admin_events` `print_partners` `order_assignments` | نقش‌محور + محدودسازی سطر با `scope` (ADR-007). ✅ در ۴٫۱ (ADR-037، ADR-038): ادمین با رمز argon2id و رمز برنامهٔ تأیید مهروموم‌شده، پیوند ثبت یک‌باره، نشست و تلاش ورود فقط با هش؛ نقش‌ها از کد؛ رویداد فقط افزودنی، ادمین پاک‌نشدنی و پیوند مصرف‌شده دست‌نخوردنی با تریگر (`0008_admin_guards.sql`)؛ در ۴٫۲ نمایهٔ رویدادهای یک هدف، برای رویدادهای هر سفارش (`0009_admin_events_target.sql`). `scope` تا برش ۵ فقط `NULL`. ✅ در ۵٫۲ (ADR-042): `print_partners`، `order_assignments` و `orders.print_partner_id` با محافظ‌هایشان (`0017`، `0018`)، و مجوزهای `orders.assign` و `partners.manage`. ✅ در ۵٫۳ (ADR-042): `scope` jsonb جایش را به ستون نوع‌دار `admin_user_roles.print_partner_id` با کلید خارجی داد (CHECK `admin_user_roles_partner`: نقش چاپخانه یعنی دقیقاً یک چاپخانه؛ EXCLUDE `admin_user_roles_partner_alone`: کاربر چاپخانه فقط همین نقش)، نقش سوم `print_partner` و مجوزهای `orders.cancel` و `orders.money` (`0019`، `0020`). برش ۶ (ADR-046، ADR-048): ✅ ۶٫۱ مجوزهای `shipments.import` (مالک و متصدی) و `shipments.revert` (مالک)؛ ✅ ۶٫۲ `shipments.review` (مالک و متصدی) و `shipments.import` چاپخانه در محدودهٔ خودش؛ ✅ ۶٫۴ `reports.read` (فقط مالک). ✅ ۷٫۳: `orders.refund` (فقط مالک، کار حساس؛ ADR-051). ✅ ۹٫۳: `orders.notes` (مالک و متصدی؛ ADR-058). ✅ ۹٫۴ (ADR-059): نقش چهارم `accountant` (حسابدار) با `orders.read`، `orders.money`، `orders.refund`، `orders.notes` و `reports.read`، بی مهاجرت (نقش‌ها از کد)؛ «عوض کردن نقش» ادمین موجود با کد تازه، زیر همان قفل ادمین‌ها، با رویداد `admins.role` |
| هویت | `users` `otp_requests` `sessions` | ✅ جدول‌ها در ۳الف، سرویس کد و نشست در ۳ب (ADR-033). موبایل نرمال‌شده. محدودیت نرخ روی شماره، IP و کل سایت، از شمردن `otp_requests` زیر یک قفل مشورتی. کد و IP فقط HMAC |
| عملیات | `jobs` `sms_messages` `settings` `service_secrets` | پیامک توسعه در دیتابیس می‌نشیند (✅ `sms_messages` در ۳الف، پیامک کنسولی در ۳ب). `settings` کلید/مقدار تایپ‌شده با zod (✅ `SETTING_SCHEMAS` در قرارداد، ۳ب؛ مقدار خراب به پیش‌فرض برمی‌گردد و لاگ می‌شود؛ ✅ از ۴٫۶ از پنل، زیر قفل و با رویداد). ✅ ۴٫۶ (ADR-041): `service_secrets` کلیدهای سرویس‌ها که مالک از پنل گذاشته، مهروموم با `SECRETS_KEY` و جای ردیف؛ CHECK نام (فقط سه کلید) و شکل مهروموم (`0014_service_secrets.sql`)؛ مقدار پنل بر `.env` مقدم. برش ۶: ✅ کار `read_post_file` کارگر (۶٫۱، ADR-045، `jobs.shipment_import_id`)؛ ✅ پیامک رهگیری از پنل با `purpose` تازهٔ `tracking` (۶٫۳، ADR-047؛ ردیف منتظر در تراکنش مرسوله، فرستادن بعد از commit)؛ ✅ تنظیم `report.weight_bands` (۶٫۴، ADR-048): بازه‌های وزن گزارش ارسال، پیش‌فرض `'tariff'`. ✅ ۷٫۱ (ADR-049): پیامک پرداخت هم از صف و `sms_messages.cost`، دو کلید تازهٔ قالب در `service_secrets` (CHECK با پنج نام، `0027`)، و تنظیم‌های `otp.site_daily_limit` و `sms.credit_alert_days`. برنامهٔ برش ۷: `checkout_previews` (ADR-052) و `checkout.audience` |
| سئو و آمار | `landing_pages` `landing_templates` `flow_events` | `flow_events` قیف و نرخ رها کردن سبد را می‌سازد |

### تنظیمات کلیدی در `settings`

```
order.sla_days                          = 2       # روز کاری تا تحویل به پست؛ ✅ پیش‌فرضش را seedReferenceData می‌نشاند؛ از ۴٫۴ صفحهٔ اصلی و مسیر خرید هم؛ از ۴٫۶ از پنل
calendar.holidays                       = [...]   # تعطیلی‌های رسمی ۱۴۰۵ و ۱۴۰۶، `{ date: '1405/10/02', title }`؛ ✅ همان‌طور؛ از ۴٫۶ از پنل
calendar.official_through               = 1405    # تعطیلی‌ها تا پایان این سال با تقویم رسمی تطبیق داده شده‌اند؛ ✅ ۴٫۶ (هشدار قمری پنل)
otp.site_hourly_limit                   = 300     # سقف کد پیامکی کل سایت در ساعت (ADR-033)؛ ✅ از ۳ب؛ از ۴٫۶ از پنل
otp.site_daily_limit                    = 2000    # ✅ ۷٫۱ (ADR-049): ترمز آخر کد پیامکی کل سایت در ۲۴ ساعت گذشته (لغزان)، ۱ تا ۱٬۰۰۰٬۰۰۰؛ از پنل
sms.credit_alert_days                   = 7       # ✅ ۷٫۱ (ADR-049، سؤال ۱۳۷): هشدار پیشخوان وقتی اعتبار sms.ir کمتر از این‌قدر روز مصرف است، ۱ تا ۹۰؛ از پنل
checkout.audience                       = preview # برنامهٔ برش ۷ (ADR-052): مخاطب مسیر خرید در live: paused | preview | everyone؛ فقط مالک
order.files_retention_days              = 30      # فایل‌های سفارش چند روز پس از «تحویل پست شد» یا «لغو شد» پاک می‌شوند (ADR-044)؛ ✅ ۵٫۱، ۷ تا ۳۶۵، از پنل؛ ✅ ۶٫۱ فایل خام پست هم (ADR-045)، و ۶٫۲ متن سطر «هیچ‌کدام»
file.formats                            = { word: true, slides: true, image: true }   # ✅ ۸٫۴ (ADR-055): خانواده‌های پذیرفته؛ PDF همیشه؛ فقط مالک، از پنل
file.max_mb                             = 1536    # ✅ ۸٫۴: سقف حجم هر فایل، ۱ تا ۱٬۵۳۶ مگابایت (همان ۱٬۶۱۰٬۶۱۲٬۷۳۶ بایت `file.max_bytes` پیشین، که هرگز در settings ننشسته بود)
file.max_pages                          = 1500    # ✅ ۸٫۴: سقف صفحهٔ هر فایل، ۱ تا ۱٬۵۰۰؛ مرورگر و سرور مسیر خرید
catalog.paused                          = { sizes: [], papers: [], bindings: [] }   # ✅ ۸٫۴ (سؤال ۱۸۸): گزینه‌های تعرفهٔ فعال که موقتاً در دسترس نیستند؛ مالک و متصدی، از «تعرفه»
file.retention_days                     = 2       # از ۸٫۴ صفحهٔ اصلی هم («فایلت پیش ما نمی‌ماند» و سؤال‌ها)
features.per_page_color                 = false   # فلگ فعال‌سازی حالت ترکیبی
features.pdf_merge                      = true
detection.color_chroma_min              = ?       # روی دادهٔ واقعی تنظیم می‌شود
detection.color_pixel_ratio_min         = ?
detection.sample_dpi                    = 40
```

---

## ۶. تشخیص رنگ

الگوریتم مشترک در `packages/analysis`، عیناً در مرورگر و کارگر:

1. **اول ساختار، بعد پیکسل.** صفحهٔ `DeviceGray` قطعاً سیاه‌سفید است — ارزان و دقیق
   برای PDF زادهٔ دیجیتال. رندر فقط برای اسکن‌ها لازم می‌شود.
2. رندر با DPI پایین (~۴۰)، بزرگ‌ترین بُعد ≈ ۴۰۰ پیکسل.
3. برآورد رنگ کاغذ = میانگین ۱۰٪ روشن‌ترین پیکسل‌ها، نه مُد و نه سفیدترین پیکسل. هیستوگرام
   و انتخاب پیکسل‌ها هر دو با روشنایی گردشده (ADR-009، اصلاح).
4. **تعادل سفیدی روی همان** — ته‌رنگ زرد یکدست خنثی می‌شود، هایلایت واقعی نمی‌شود. فقط
   وقتی ته‌رنگ از خاکستری میانی روشن‌تر است: زمینهٔ تیره (اسلاید، صفحهٔ سیاه) کاغذ نیست و
   همان‌طور که هست سنجیده می‌شود.
5. `chroma = max(r,g,b) − min(r,g,b)`؛ تقریباً سفید و تقریباً سیاه نادیده گرفته می‌شوند.
6. دو آستانه از `settings`: حداقل کروما، حداقل نسبت پیکسل رنگی.
7. **اعداد خام ذخیره می‌شوند** (`colorRatio`, `chromaP95`, `paperCast`) تا آستانه بعداً
   بدون داشتن فایل قابل تنظیم باشد.

### شکل `PageAnalysis`

```json
{ "engine": "pymupdf-1.24", "pages": [
  { "n": 1, "w": 595, "h": 842, "rot": 0,
    "color": false, "colorRatio": 0.004, "chromaP95": 0.06,
    "paperCast": [252, 248, 231], "blank": false,
    "dpi": 300, "minMarginMm": 12.4 }
]}
```

### کارایی روی موبایل ضعیف

- **پیش‌رونده:** ۸ صفحهٔ اول فوری، قیمت با نشانگر «در حال بررسی»، بقیه در پس‌زمینه.
- **نمونه‌برداری:** بالای ۲۰۰ صفحه، یکی از هر k صفحه برای پیش‌فاکتور. سرور ۱۰۰٪.
- **حافظه:** هیچ‌وقت بیش از دو بیت‌مپ زنده؛ `page.cleanup()` بعد از هر صفحه.
- **بن‌بست ممنوع:** کم آوردن مرورگر ← افتادن بی‌صدا به مسیر سرور.
- **سنجهٔ پذیرش:** زیر ۲ ثانیه تا اولین قیمت برای PDF اسکن‌شدهٔ ۱۵۰ صفحه‌ای روی
  اندروید میان‌رده. با throttling ۴× کروم تست می‌شود (دستگاه قدیمی در دسترس نیست).

---

## ۷. ورود فایل پست و رهگیری

فایل پست **جدول HTML با پسوند `.xls`** است. فرمت از محتوا تشخیص داده می‌شود: جدول HTML (UTF-8 یا
windows-1256)، `.csv` و `.xlsx`. `.xls` واقعی (BIFF) پیام روشن می‌گیرد: «همان فایلی را بده که از پست گرفتی»
(برنامهٔ برش ۶، سؤال ۴۸، ADR-045).

ستون‌های مفید: `بارکد` (کد رهگیری ۲۴ رقمی)، `نام گ` (نام خانوادگی + کد سفارش)،
`مقصد`، `وزن`، `کرایه پستی`، `مالیات`. ستون `آدرس گ` همیشه خالی است. «شماره مرجع» و «شماره ثبت» سطح دسته‌اند.

### خط لوله (برنامهٔ برش ۶؛ ADR-045 و ADR-046)

1. کارگر فایل را می‌خواند: بایت ← جدول رشته‌ها. تفسیر با پنل.
2. سلول و سرستون را فارسی‌نرمال کن: ي→ی، ك→ک، ارقام فارسی و عربی به لاتین، نیم‌فاصله. در windows-1256
   سرستون هم «باركد» است.
3. ردیف «جمع کل» را دور بریز (بارکدش عددی نیست)، ولی جمعش را با جمع سطرها بسنج.
4. بارکد فقط رشتهٔ دقیقاً ۲۴ رقمی؛ عددی که صفحه‌گسترده گرد کرده «خوانده نشد» است.
5. کد سفارش را **فقط** از `نام گ` با الگوی عدد در انتهای رشته بردار. **قطعی** فقط وقتی نام گیرنده، مقصد،
   وضعیت و تاریخ سفارش هم می‌خوانند: فایل چاپخانه بسته‌های مشتری‌های دیگرش را هم دارد.
6. قطعی نیست ولی نامزد دارد ← نمره‌دهی با نام خانوادگی + شهر + بازهٔ وزن + تاریخ ← صف «نیازمند تأیید» (مالک و
   متصدی). بی نامزد ← «پیدا نشد». ✅ ۶٫۲: تا سه نامزد با پنج معیار و نمره، انتخاب از پیش فقط برای تنها نامزد قوی، و دادن دستی از
   صف و «پیدا نشد» (ADR-046، «اجرا در ۶٫۲»).
7. پیش‌نمایش ← «ثبت» یا تأیید ← مرسوله با کد رهگیری، «تحویل پست شد» اگر نخورده، پیامک رهگیری، و نمایش در
   صفحهٔ سفارش مشتری و پنل.
8. فایل خام و همهٔ سطرها می‌مانند تا یک ورود اشتباه با یک کلیک برگردد (مالک)؛ فایل خام و متن سطرهای دیگران N روز
   بعد پاک می‌شوند (ADR-044).

**هیچ‌وقت در همهٔ ستون‌ها نگرد.** جزئیات و دلیل در ADR-010.

---

## ۸. مسیر ساخت

هر برش قابل دیپلوی و قابل نشان دادن است. برش بعدی شروع نمی‌شود تا برش قبلی
روی سرور بالا و قابل استفاده باشد.

| # | برش | محتوا |
|---|---|---|
| 0 | ✅ اسکلت قابل دیپلوی | Docker Compose، Nginx، Dockerfile چندمرحله‌ای، `deploy.sh`، `setup-tls.sh`، سلامت سرویس |
| 1 | ✅ **لحظهٔ جادو** | فایل بینداز ← مرورگر می‌خواند ← قیمت زنده با تعرفهٔ واقعی ← تنظیمات. بدون دیتابیس و حساب. + پایه‌های سئو (رندر ایستا، متا، نقشهٔ سایت، JSON-LD). ۱۲۳ تست واحد + ۱۵ تست سرتاسری |
| 2 | سرور منبع حقیقت | ✅ اسکیمای سند و تعرفه، ✅ آپلود presigned و chunked (Garage)، ✅ تحلیل کامل کارگر پایتون و هم‌ترازی قیمت (ADR-025)؛ ۲ب: ✅ ایمیج پایه با LibreOffice و فونت‌ها (ADR-027)، ✅ تبدیل Word/PPT/عکس با پیش‌فاکتور فوری (ADR-028)، ✅ هشدارها با شمارهٔ صفحه، DPI از جای تصویر و فونت جایگزین (ADR-029)، ✅ چند فایل در یک جزوه، یک صحافی (ADR-030) |
| 3 | ✅ سفارش کامل با پرداخت جعلی | ۳الف تا ۳د مستقر (#34 تا #38، پایین). شهر و آدرس، نرخ ارسال، OTP، ساخت سفارش، درگاه نمونه (فقط بیرون از سایت زنده، ADR-035)، صفحهٔ تأیید |
| 4 | ✅ پنل ادمین نسخهٔ ۱ | TOTP روی ساب‌دامین جدا، فهرست و جزئیات سفارش، دانلود فایل، تغییر وضعیت، ویرایش تعرفه، ساعت SLA؛ و به خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۰۴) کلیدها و تنظیمات سرویس‌های بیرونی (پیامک، درگاه) که امروز در `.env`اند، دیدنی و تغییرپذیر از پنل. شش PR، #40 تا #46، همه ادغام و مستقر (پایین، «برش ۴») |
| 5 | ✅ چاپخانه و خروجی چاپ | نقش چاپخانه با دسترسی محدود، تخصیص سفارش، تولید PDF آمادهٔ چاپ. سه PR، #48 تا #50، همه ادغام و مستقر (پایین، «برش ۵») |
| 6 | ✅ ارسال و رهگیری | ورود فایل پست، تطبیق، صف تأیید، نمایش رهگیری، گزارش حاشیهٔ ارسال. چهار PR پس از طرح نمونه، #52 تا #55، همه ادغام و مستقر (پایین، «برش ۶») |
| 7 | ✅ پیامک و درگاه واقعی — ۷٫۱ مستقر (#57)، ۷٫۲ مستقر (#59، #60)، ۷٫۳ مستقر (#61)، ۷٫۴ ادغام شد (#62)، ۷٫۵ ادغام شد (#63)، ۷٫۶ ادغام شد (#66) | آداپتور sms.ir و زیبال پشت همان اینترفیس‌ها (پنل پیامک sms.ir از ۱۴۰۵/۰۷/۰۸، نه کاوه‌نگار)، استعلام و بازپرداخت، صفحه‌های ثابت (قدم ۵)، و باز شدن مسیر خرید روی سایت زنده (`live`). شش PR پس از طرح نمونه (پایین، «برش ۷»)؛ روشن کردن `live` کار دستی و با صاحب پروژه |
| 8 | کاتالوگ چاپ و قیمت — برنامه تأیید شد (۱۴۰۵/۰۷/۲۱؛ پایین، «برش ۸ تا ۱۲»)، ۸٫۱ ادغام شد (#67)، طرح ۸٫۲ تأیید شد (۱۴۰۵/۰۷/۲۲، سؤال‌های ۲۱۵ تا ۲۲۵)، ۸٫۲ ادغام شد (#68)، ۸٫۳ ادغام شد (#69؛ «کاور» صحافی‌ای که مالک می‌افزاید)، ۸٫۴ ادغام شد (#70)؛ ۸٫۵ نیست (۱۹۱: فقط پست پیشتاز، ۱۴۰۵/۰۷/۲۶)، پس برش ۸ تمام شد | هشدارها فقط در پنل، چند جزوه در یک سفارش، اندازهٔ کاغذ و نرخ یکرو و دورو، صحافی‌ها و نوع کاغذ با روشن و خاموش، ویرایشگر کامل تعرفه، حداقل سفارش و فرمت و حجم از پنل، روش‌های ارسال؛ پیش از باز شدن مسیر خرید |
| 9 | پنل عملیات — برنامه تأیید شد، طرح ۹٫۱ تأیید شد (۱۴۰۵/۰۷/۲۳، سؤال‌های ۲۲۷ تا ۲۳۴)، ۹٫۱ ادغام شد (#71؛ پایین، «۹٫۱»)، ۹٫۲ ادغام شد (#72؛ پایین، «۹٫۲»)، ۹٫۳ ادغام شد (#73؛ پایین، «۹٫۳»)، ۹٫۴ ادغام شد (#74؛ پایین، «۹٫۴»)؛ با آن برش ۹ تمام شد | فهرست جمع‌وجور با مشخصات فایل‌ها، زیپ هر سفارش، قالب HTML برگهٔ اول و بیجک، یادداشت داخلی و ویرایش دستی، نقش حسابدار |
| 10 | چاپخانه‌ها — برنامه تأیید شد، ۱۰٫۱ ادغام شد (#75)، ۱۰٫۲ ادغام شد (#76)، ۱۰٫۳ ادغام شد (#84؛ پاسخ ۲۰۳، درصدی از سفارش؛ پایین، «۱۰٫۳»)، ۱۰٫۴ ساخته شد (این PR؛ پاسخ ۲۰۴، همهٔ چاپخانه‌ها؛ پایین، «۱۰٫۴») | تخصیص با فاصله و حالت دستی، تعطیل و شلوغ، گزارش تولید هر چاپخانه با خروجی اکسل و PDF، تسویه، موجودی کاغذ |
| 11 | محتوا و بازاریابی — برنامه تأیید شد، طرح ۱۱٫۱ تأیید شد (۱۴۰۵/۰۷/۲۶، سؤال‌های ۲۸۲ تا ۲۹۴)، ۱۱٫۴ ادغام شد (#77)، ۱۱٫۱ ادغام شد (#80)، ۱۱٫۳ ادغام شد (#81)، ۱۱٫۲ ادغام شد (#82)؛ تمام | متن‌ها و اطلاعات تماس از پنل، لوگو و بنر، نوار اعلان، کد تخفیف و تخفیف سفارش بزرگ |
| 12 | مشتری و پشتیبانی — برنامه تأیید شد، طرح ۱۲٫۱ تأیید شد (۱۴۰۵/۰۷/۲۶، سؤال‌های ۳۰۵ تا ۳۱۶)، ۱۲٫۲ ادغام شد (#78؛ پایین، «۱۲٫۲»)، ۱۲٫۳ ادغام شد (#79؛ پایین، «۱۲٫۳»)، ۱۲٫۱ ادغام شد (#83؛ پایین، «۱۲٫۱»)؛ تمام | «سفارش‌های من» و تیکت، مسدودسازی، رضایت و نظر (سفارش‌های قبلی از برش ۸ قدیم) |
| 13–15 | برنامه تأیید شد | ۱۳ خدمات جانبی (تراکت، پوستر)؛ ۱۴ آمار و قیف (باقی برش ۸ قدیم: سفارش مجدد، پیگیری زنده، داشبورد قیف و درآمد)؛ ۱۵ موتور سئو (برش ۹ قدیم: CMS لندینگ، صفحات استانی؛ انتقال به پارس‌پک پیش از ۷٫۲ انجام شد، ۱۴۰۵/۰۷/۰۸، سؤال ۱۱۳) |

### برش ۳: برنامه و وضعیت

برنامه تأیید شد (۱۴۰۵/۰۷/۰۴). رابطش طرح تأییدشدهٔ `docs/ui/mockups/checkout.html` است (`docs/UI.md`،
بخش ۶). تصمیم‌ها: ADR-033 (کد پیامکی و نشست)، ADR-034 (سفارش با «پرداخت»، مسیر خرید در همان صفحه، و
محافظ‌های پایگاه داده)، ADR-035 (حالت مسیر خرید؛ درگاه نمونه هرگز روی سایت زنده) و ADR-036 (برگشت بعد از رفرش).

| PR | دامنه | وضعیت |
|---|---|---|
| ۳الف | داده: جدول‌های هویت، سفارش، پرداخت و پیامک، با محافظ‌هایشان؛ استان‌ها و شهرها (`@jozveyar/geo`)؛ روز کاری و مهلت تحویل به پست (`@jozveyar/text`)؛ دادهٔ پایه هنگام بالا آمدن سرور. روی سایت چیزی عوض نمی‌شود | #34، ادغام و مستقر شد |
| ۳ب | سرور: کد پیامکی با پیامک کنسولی، نشست، ساخت سفارش، درگاه نمونه و برگشت از آن، کار `prepare_order` کارگر، `CHECKOUT_MODE`. روی سایت زنده خاموش | #35، ادغام و مستقر شد (پایین) |
| ۳ج | رابط: اجزای تازهٔ کیت و دو آیکون، قدم‌ها طبق طرح، درگاه نمونه، صفحهٔ سفارش، حالت `off` سایت زنده؛ مرحلهٔ تازهٔ CI: تست سرتاسری با پستگرس، Garage و کارگر واقعی | #36، ادغام و مستقر شد (پایین) |
| ۳د | برگشت بعد از رفرش: اگر گوشی صفحه را از نو بار کند، جزوه و نشانی برمی‌گردند (ADR-036) | #38، ادغام و مستقر شد (پایین) |

تصمیم‌های ۱۴۰۵/۰۷/۰۴، همه طبق پیشنهاد:
- سؤال ۹: «تهران» در کرایهٔ ارسال یعنی **استان** تهران؛ منطقه مال استان است. سؤال ۱۰: «کد با تماس صوتی»
  تا برش ۷ ساخته نمی‌شود، و آنجا فقط اگر پنل پیامک داشته باشد.
- سایت زنده تا برش ۷ در حالت `off`: «ادامه» بسته، با «ثبت سفارش آنلاین به‌زودی» (ADR-035).
- شمارهٔ سفارش از 10001، دور از کدهای دستی 6004 تا 6098 فایل پست.
- روز کاری تحویل به پست: شنبه تا چهارشنبه. پنجشنبه، جمعه و تعطیلی رسمی نه، و روز پرداخت شمرده نمی‌شود
  (پرداخت شنبه، تحویل به پست تا دوشنبه). تعطیلی‌ها در `settings`.
- کد پیامکی ۵ رقمی، ۲ دقیقه اعتبار، ۳ فرصت، ارسال دوباره پس از ۹۰ ثانیه؛ سقف ۵ کد در ساعت برای هر شماره،
  ۲۰ برای هر IP، و سقف ساعتی کل سایت (ADR-033).
- سقف کد پیامکی در پستگرس، نه Redis.
- متن کارت شهر: «کرایهٔ پست پیشتاز در استان تهران X و بقیهٔ کشور Y تومان».
- ۳د در همین برش.

**پیش از باز شدن مسیر خرید روی سایت زنده** (با برش ۷): صفحهٔ قوانین (قدم ۵ مرحلهٔ طراحی، `docs/UI.md`)،
و تطبیق تعطیلی‌های قمری ۱۴۰۶ در `settings` با تقویم رسمی منتشرشده. درگاه واقعی زیبال است: کد پذیرنده رسید
(۱۴۰۵/۰۷/۰۴) و در `PAYMENT_MERCHANT_ID` همان `.env` سرور می‌نشیند، نه مخزن. برگشت زیبال پارامترهای خودش را دارد، نه
`Authority` و `Status` شکل زرین‌پال که `/pay/callback` ۳ب می‌خواند؛ آداپتور و برگشتش در برش ۷. پنل پیامک کاوه‌نگار
است: کلید API رسید (۱۴۰۵/۰۷/۰۴) و در `SMS_API_KEY` همان `.env` می‌نشیند؛ آداپتور کاوه‌نگار و قالب کد پیامکی
(`SMS_OTP_TEMPLATE`، قالبی که در پنل کاوه‌نگار ساخته و تأیید می‌شود) در برش ۷. هر دو کلید بعداً از پنل ادمین هم
تغییرپذیرند (خواستهٔ ۱۴۰۵/۰۷/۰۴، برنامه‌اش در برش ۴). از ۱۴۰۵/۰۷/۰۸ پنل پیامک sms.ir است، نه کاوه‌نگار؛ برنامهٔ همهٔ این‌ها در «برش ۷»، پایین.

#### ۳ب: سرور (ادغام و مستقر شد، #35)

همهٔ مسیرهای خرید پشت `CHECKOUT_MODE`اند (`apps/web/lib/server/checkoutMode.ts`): در `off`، که پیش‌فرض است، ۴۰۴
مثل هر نشانی ناموجود. `mock` روی jozveyar.com هم `off` است (از `Host`، `X-Forwarded-Host` و نشانی درخواست)، و `live`
تا درگاه و پنل پیامک واقعی برش ۷ هم. مسیر خرید `SESSION_SECRET` (دست‌کم ۳۲ نویسه) و پایگاه داده هم می‌خواهد. سرور
هنگام بالا آمدن یک خط می‌نویسد: «✓ مسیر خرید: off».

| مسیر | کار |
|---|---|
| `GET /api/checkout` | حالت، و موبایل تأییدشدهٔ همین مرورگر؛ تنها مسیر خریدی که در `off` هم جواب می‌دهد |
| `POST /api/checkout/quote` | قیمت سرور برای شهر و مرور: شمارش سرور، تعرفهٔ فعال پایگاه داده، کرایهٔ منطقهٔ استان، و کرایهٔ هر دو منطقه برای کارت شهر |
| `POST /api/checkout/otp` و `…/otp/verify` | کد پیامکی و نشست `jy_auth` (ADR-033) |
| `DELETE /api/checkout/auth` | «عوض کن»: نشست باطل |
| `POST /api/checkout/orders` | «پرداخت»: سفارش در یک تراکنش و شروع پرداخت (ADR-034) |
| `POST /api/checkout/orders/<توکن>/pay` | «دوباره پرداخت کن» |
| `GET`/`POST /api/checkout/mock-gateway/<Authority>` | دادهٔ صفحهٔ درگاه نمونه و ثبت تصمیمش (ADR-035)؛ خود صفحه (`/pay/mock/<Authority>`) در ۳ج |
| `GET /pay/callback?Authority=…&Status=…` | برگشت از درگاه، شکل زرین‌پال؛ سنجش سمت سرور، بعد ۳۰۳ به `/order/<توکن>` (صفحه‌اش در ۳ج) |
| `GET /api/orders/<توکن>` | صفحهٔ سفارش به JSON؛ پشت حالت خرید نیست |

- **آداپتورها** (ADR-008): `PaymentGateway` (`start`، `verify`) با درگاه نمونه، و `SmsProvider` با پیامک کنسولی
  (ردیف `sms_messages` با متن کامل، و یک خط لاگ).
- **قیمت و سفارش:** از مرورگر فقط شناسهٔ سندها و انتخاب‌ها می‌آید؛ قاعدهٔ رنگ را سرور می‌سازد. سند مال همان `jy_sid`،
  `ready`، و فایلش دست‌کم یک ساعت دیگر زنده؛ هشدار `quote()` یعنی سفارش نه؛ عدد دیگر = ۴۰۹ با عدد تازه.
- **پرداخت:** هر تلاش یک ردیف `payments`، و نیم ساعت اعتبار (از ۷٫۲ ده دقیقه، سؤال ۱۴۴). برگشت زیر قفل ردیف پرداخت و سفارش؛ موفق در یک
  تراکنش: `paid`، تاریخ، مهلت تحویل به پست (`postHandoffDue` با `sla_days` سفارش و `calendar.holidays`)، رویداد و کار
  `prepare_order`؛ بعد پیامک شمارهٔ سفارش. سفارش پرداخت‌شده یا منقضی سنجیده نمی‌شود. فایلی که دیگر زنده نیست،
  سفارش در انتظار را `expired` می‌کند.
- **کارگر:** `prepare_order` بخش‌ها را به ترتیب از `coalesce(pdf_storage_key, storage_key)` در
  `orders/<شماره>/jozve-<قلم>.pdf` می‌گذارد و `print_pdf_*` را پر می‌کند؛ هر بخش و جمعشان با شمارش سرور سنجیده
  می‌شود. جزوهٔ تک‌فایلی عیناً همان فایل است. «انصراف» آپلود فایلی را که در سفارش است پاک نمی‌کند (`in_order`).
- جزئیات تصمیم‌های اجرا و سنجش‌ها در ADR-033 تا ۰۳۵، بخش «اجرا در ۳ب».

#### ۳ج: رابط (ادغام و مستقر شد، #36)

طرح تأییدشدهٔ `docs/ui/mockups/checkout.html`، روی سرور ۳ب. روی سایت زنده (`off`) فقط «ادامه» عوض می‌شود: «ثبت سفارش
آنلاین به‌زودی».

| جا | کار |
|---|---|
| `components/OrderDesk.tsx`، `OrderSummary.tsx` | «ادامه»ی «جزوه و قیمت»: حالت خرید (`GET /api/checkout`، وقتی قیمت نهایی شد)، آمادگی جزوه روی سرور (`lib/checkout/gate.ts`)، تاریخچهٔ مرورگر، و بار تکهٔ مسیر خرید |
| `components/checkout/Checkout.tsx` | تکهٔ جدای JS با دادهٔ شهرها: قدم‌های شهر، نشانی، موبایل، کد و مرور؛ کار بعدی یک دکمه در خلاصه و نوار (`<button form>`) |
| `lib/checkout/store.ts`، `api.ts`، `format.ts`، `steps.ts` | حالت و کارهای مسیر خرید بی React، با تست واحد؛ کلید «پرداخت»، ۴۰۹ و همهٔ کدهای شکست |
| `lib/recipient.ts` | سنجش گیرنده، یکی برای مرورگر و سرور (`checkRecipient`)؛ از ۴٫۳ در `@jozveyar/text/input`، برای پنل هم |
| `components/checkout/parts.tsx`، `recap.tsx` | قدم‌ها، جمع و ریز قیمت (در راه اولین قیمت)؛ و مرور (فقط مسیر خرید و صفحهٔ سفارش) |
| `app/pay/mock/[authority]/page.tsx` | درگاه نمونه، بی پوستهٔ سایت؛ بیرون از `mock` ۴۰۴ |
| `app/order/[token]/page.tsx` | صفحهٔ سفارش، کامپوننت سرور و `noindex`: پرداخت‌شده، در انتظار با «دوباره پرداخت کن»، منقضی، غریبه |
| `@jozveyar/text` | چند ماژول بی اثر جانبی؛ نرمال‌سازی ورودی و موبایل در `@jozveyar/text/input` |
| CI، مرحلهٔ «مسیر خرید، سرتاسری» | همان build با `CHECKOUT_MODE=mock`، پایگاه دادهٔ تازهٔ `jy_e2e`، Garage و ایمیج کارگر: `checkout.spec.ts` و `upload.spec.ts` |

- تصمیم‌های رابط، سنجش‌ها و فرق‌ها با طرح در `docs/UI.md`، بخش «۳ج»؛ تصمیم‌های اجرا در ADR-033 تا ۰۳۵، بخش «اجرا در ۳ج».

#### ۳د: برگشت بعد از رفرش (ادغام و مستقر شد، #38)

گوشی صفحه را از نو بار می‌کند (رفرش، یا مرورگری که زبانه را وقت رفتن به برنامهٔ پیامک بست) و همان جزوه، همان تنظیمات
چاپ و همان قدم مسیر خرید برمی‌گردد (ADR-036). پیش‌نویس در sessionStorage همین زبانه است؛ عدد صفحه و رنگ از خود سرور.

| جا | کار |
|---|---|
| `lib/draft.ts`، `lib/restore.ts`، `lib/draftKey.ts` | نوشتن پیش‌نویس (با رابط پس از فایل)، و خواندن و سنجش دست‌نویس و وضعیت هر سند از `GET /api/uploads/<id>` (فقط با پیش‌نویس) |
| `app/page.tsx`، `globals.css`، `home.css` | اسکریپت چندبایتی درون HTML: `data-restoring` پیش از رسم؛ حالت سفارش و «در حال برگرداندن جزوه…» از اولین رسم |
| `components/Restore.tsx` | تکهٔ جدای JS، فقط با پیش‌نویس: پیش‌نویس، سندها، قدم (`history.state`)، و «جزوهٔ قبلی دیگر روی سرور نیست» |
| `lib/jozveController.ts`، `lib/upload/client.ts` | `restore` (بخش‌های برگشته، بی کارگر و بی آپلود)، `replace` با `keep` برای همان فایل، `followUpload` |
| `lib/jozveView.ts`، `lib/checkout/gate.ts` | فایل منتظر همان فایل (`waiting`، `matchAwaited`)؛ «ادامه» فقط وقتی همهٔ فایل‌های جزوه روی سرور و شمرده‌اند |
| `lib/checkout/store.ts`، `Checkout.tsx` | `draft()` و `hydrate()`: جا (با فهرست شهرها)، گیرنده، موبایل، شمارش معکوس کد، کلید «پرداخت» و توکن سفارش |
| `components/checkout/ForgetDraft.tsx` | صفحهٔ سفارش پرداخت‌شده پیش‌نویس همان سفارش را پاک می‌کند |
| CI، مرحلهٔ «مسیر خرید، سرتاسری» | `restore.spec.ts` هم، کنار `checkout.spec.ts` و `upload.spec.ts` |

- تصمیم‌های رابط، سنجش‌ها و شاهدها در `docs/UI.md`، بخش «۳د».

### برش ۴: برنامه و وضعیت

برنامه تأیید شد (۱۴۰۵/۰۷/۰۴، سؤال‌های ۱۲ تا ۲۳)، و بعد طرح نمونهٔ پنل (`docs/ui/mockups/admin.html`، سؤال‌های ۲۴ تا ۲۸؛
`docs/UI.md`، «طرح پنل ادمین»). تصمیم‌ها: ADR-037 (اپ، زیردامنه، مسیر محرمانه و ورود)، ADR-038 (نقش‌ها، کار حساس و
رویدادها)، ADR-039 (چرخهٔ سفارش پس از پرداخت و ساعت تحویل به پست)، ADR-040 (تعرفه از پایگاه داده و ویرایشش با نسخهٔ
تازه) و ADR-041 (کلیدهای سرویس‌ها). نام‌ها ۴٫۱ تا ۴٫۶اند، چون «۴الف» و «۴ب» مال قدم ۴ مرحلهٔ طراحی‌اند.

| PR | دامنه | وضعیت |
|---|---|---|
| ۴٫۱ | پایه و ورود: اپ `apps/admin`، زیردامنه و مسیر محرمانه، ورود با رمز و برنامهٔ تأیید، پیوند ثبت یک‌باره و دستور سرور، نقش‌ها، ادمین‌ها و رویدادها؛ Nginx، TLS، استقرار و مرحلهٔ CI «پنل، سرتاسری» | #40، ادغام و مستقر شد (پایین) |
| ۴٫۲ | سفارش‌ها: پیشخوان با ساعت تحویل به پست، فهرست با جست‌وجو و فیلتر، جزئیات، دانلود PDF جزوه، وضعیت و «دوباره بساز» `prepare_order` | #41، ادغام و مستقر شد (پایین) |
| ۴٫۳ | وضعیت سفارش: شروع چاپ ← تحویل پست شد، لغو با دلیل، برگرداندن یک قدم (مالک)، ویرایش نام و نشانی و کد پستی؛ صفحهٔ سفارش مشتری با وضعیت‌های تازه | #42، ادغام و مستقر شد (پایین) |
| ۴٫۴ | تعرفه از پایگاه داده در سایت: ISR ۶۰ ثانیه و تعرفهٔ فعال به JSON درون HTML؛ جدول تعرفه، سؤال‌ها و «۲ روز کاری» از پایگاه داده و `settings` | #44، ادغام و مستقر شد (پایین) |
| ۴٫۵ | ویرایش تعرفه: پیش‌نویس از نسخهٔ فعال، سنجش، پیش‌نمایش با `quote()`، فعال‌سازی با کد تازه، برگشت با فعال کردن نسخهٔ قبل؛ نسخهٔ فعال‌شده تغییرناپذیر | #45، ادغام و مستقر شد (پایین) |
| ۴٫۶ | تنظیمات و کلیدها: تعطیلی‌ها (با تطبیق قمری ۱۴۰۶)، سقف ساعتی کد پیامکی، روز کاری تحویل؛ کلیدهای سرویس‌ها مهروموم‌شده (ADR-041) | #46، ادغام و مستقر شد (پایین) |

تصمیم‌های ۱۴۰۵/۰۷/۰۴، همه طبق پیشنهاد:
- سؤال ۱۲: عدد قفل‌شدهٔ باندل اولیه ۱۰۷٫۶ کیلوبایت؛ سقف تست همان ۱۱۱.
- سؤال ۱۳: شش PR به همین ترتیب، و طرح نمونه پیش از ۴٫۱.
- سؤال ۱۴: زیردامنهٔ `admin.jozveyar.com` (نامش در لاگ‌های CT عمومی است؛ راز مسیر است). سؤال ۱۵: مسیر همان
  `ADMIN_BASE_PATH` موجود در `.env` سرور.
- سؤال ۱۶: اولین ادمین و بازیابی با دستور سرور و پیوند یک‌باره ۱۵ دقیقه‌ای؛ بی کد پشتیبان. سؤال ۱۷: دو نقش، مالک و
  متصدی؛ مالک متصدی را از پنل با پیوند یک‌باره اضافه می‌کند.
- سؤال ۱۸: وضعیت‌ها، لغو و ویرایش نشانی (نه موبایل)؛ بی پیامک در تغییر وضعیت (پیامک رهگیری با برش ۶).
- سؤال ۱۹: تعرفه از پایگاه داده با ISR ۶۰ ثانیه. سؤال ۲۰: ویرایش فقط با نسخهٔ تازه، فعال‌سازی با کد تازه، برگشت با
  فعال کردن نسخهٔ قبل.
- سؤال ۲۱: کلیدها با AES-256-GCM در پایگاه داده و کلید اصلی فقط در `.env`؛ پنل بر `.env` مقدم؛ فقط مالک با کد تازه؛
  فقط ۴ نویسهٔ آخر؛ رویداد بی مقدار؛ `SMS_API_KEY`، `SMS_OTP_TEMPLATE`، `PAYMENT_MERCHANT_ID`؛ آزمایش پیش از ذخیره و
  خواندن آداپتورها در برش ۷.
- سؤال ۲۲: پرداخت بی برگشت و سفارش رهاشده فقط جدا نشان داده می‌شوند؛ استعلام درگاه برش ۷. سؤال ۲۳: `deploy-bundle.sh`
  خط‌های بالا آمدن را نشان می‌دهد، در همین ۴٫۱.
- سؤال ۲۴: سربرگ سفید با زبانه‌ها، صفحهٔ green-50 با کارت‌های سفید؛ گوشی سه زبانه و «بیشتر». سؤال ۲۵: یک دکمهٔ اصلی،
  «شروع چاپ» بعد «تحویل پست شد»؛ لغو با دلیل و هشدار برگشت پول دستی. سؤال ۲۶: برگرداندن وضعیت اشتباه فقط با مالک، یک
  قدم، با دلیل. سؤال ۲۷: متن‌های مشتری؛ دلیل لغو فقط در پنل. سؤال ۲۸: سه جزء تازهٔ کیت (`jy-btn--danger`،
  `jy-badge--neutral`، آیکون دانلود).
- ۱۴۰۵/۰۷/۰۵: تصمیم‌های کوچک «اجرا در ۴٫۴» تا «اجرا در ۴٫۶» (ADR-040، ADR-041 و ADR-038) طبق پیشنهادها تأیید شد؛ برش ۴ با ادغام و
  استقرار #46 تمام شد.

**کار دستی صاحب پروژه:** رکورد DNS `admin` (همان IP)؛ بعد از استقرار ۴٫۱ یک بار `./infra/setup-tls.sh <ایمیل>` و بعد
`./infra/admin-invite.sh <نام کاربری>`؛ از ۴٫۶ نسخهٔ پشتیبان `.env`.

**فیکس Nginx** (#43، ادغام و مستقر شد؛ بیرون از شش PR، `fix(infra)`، ۱۴۰۵/۰۷/۰۵): تا این روز Nginx زنده پیکربندی پیش از ۴٫۱ را داشت و پیوند پنل به
صفحهٔ «پیدا نشد» سایت می‌رفت. علت و رفع در ADR-037، «افزوده».

#### ۴٫۱: پایه و ورود (#40، ادغام و مستقر شد)

| جا | کار |
|---|---|
| `packages/db`: `schema.ts`، `0007_admin.sql`، `0008_admin_guards.sql` | جدول‌های پنل و سه تریگر محافظ (بالا، بخش ۵) |
| `packages/db/src/admin.ts` | `AdminStore`: فرصت سنجش و گام کد اتمی، نشست، پیوند در تراکنش و زیر قفل، «آخرین مالک»، رویدادها؛ و `seedAdminRoles` در `seedReferenceData` |
| `packages/db/src/sealed.ts` | مهروموم AES-256-GCM با `SECRETS_KEY` و جای ردیف (AAD) |
| `apps/admin/lib/server/` | `totp.ts` (RFC 6238)، `password.ts` (argon2id)، `auth.ts` (سرویس ورود و ادمین‌ها، بی نکست، با پیاده‌سازی حافظه‌ای در `testing.ts`)، `config.ts`، `cookie.ts`، `qr.ts`، `context.ts` |
| `apps/admin/middleware.ts`، `lib/gate.ts`، `lib/security.ts` | دروازهٔ مسیر محرمانه، CSP با nonce و سرآیندها، نوشتن فقط از خود پنل |
| `apps/admin/app/[gate]/…` | ورود، پیوند ثبت با QR، پوسته و زبانه‌ها، پیشخوان (صف سفارش با ۴٫۲)، ادمین‌ها (افزودن، کد ورود تازه، غیرفعال، لغو دعوت)، رویدادها |
| `apps/admin/scripts/cli.ts`، `infra/admin-invite.sh` | دستور سرور؛ esbuild به `dist/cli.mjs`، بی argon2 |
| `packages/ui` | `jy-btn--danger`، `jy-badge--neutral` و آیکون دانلود (سؤال ۲۸) |
| `infra/`: compose، Nginx، `setup-tls.sh`، `deploy-bundle.sh`، `bootstrap.sh` | سرویس `admin`، بلوک زیردامنه، `--expand`، بستهٔ پنل و سه مقدار `.env`، خط‌های بالا آمدن، بارگذاری دوبارهٔ Nginx |
| CI | بیلد پنل، مرحلهٔ «پنل، سرتاسری» (`jy_admin`، وب روی ۳۱۰۱ برای مهاجرت و نقش‌ها، پنل روی ۳۲۰۰)، و بستهٔ `jozveyar-admin` در انتشار |

- تصمیم‌های اجرا و سنجش‌ها در ADR-037 و ADR-038، بخش «اجرا در ۴٫۱»؛ رابط و فرق‌ها با طرح در `docs/UI.md`، «۴٫۱».

#### ۴٫۲: سفارش‌ها (#41، ادغام و مستقر شد)

| جا | کار |
|---|---|
| `packages/db/src/panel.ts` | `PanelOrderStore`: شمار کاشی‌های مهلت با مرزهای روز، هشدارها، فهرست و شمار چیپ‌ها با یک شرط برای هر سطل، جست‌وجو، جزئیات (قلم‌ها، بخش‌ها، قاعده‌ها، پرداخت‌ها، رویدادها)، فایل PDF هر جزوه، و «دوباره بساز» در یک تراکنش با رویداد |
| `packages/db`: `orders.ts`، `reference.ts`، `admin.ts`، `0009_admin_events_target.sql` | حاشیهٔ فایل (یک ساعت) و مهلت تلاش پرداخت (نیم ساعت) و `readSetting` از سایت به اینجا، تا پنل همان قاعده را بخواند؛ `adminEventRow`؛ نمایهٔ رویدادهای یک هدف |
| `packages/storage`: `getObject` | خواندن جریانی یک فایل از نشانی داخلی، با سقف زمان فقط تا سرآیندها؛ تنها خواندن بایت در کل کد (ADR-037) |
| `packages/text`: `tehranDayStart` | آغاز روز تهران، و روزهای بعدش |
| `apps/admin/lib/orders.ts` | منطق خالص نمایش: سطل و صفحه و جست‌وجو از نشانی، مرزهای روز، متن کاشی‌ها و نشان مهلت، حالت ردیف، مشخصات جزوه، خطوط مبلغ از `price_breakdown` منجمد، پرداخت‌ها، PDF و رویدادها |
| `apps/admin/lib/server/orders.ts` | سرویس بی نکست: مجوز در سرور (`orders.read`، `files.download`)، پیشخوان، فهرست، جزئیات، دانلود با رویداد، «دوباره بساز» |
| `apps/admin/app/[gate]/(panel)/…` | پیشخوان (کاشی‌ها، هشدارها، صف تحویل)، `orders` (جست‌وجو، چیپ‌ها، فهرست)، `orders/[number]` (جزئیات) و `orders/[number]/pdf/[item]` (دانلود جریانی) |
| `apps/admin/components/` | `OrderRows`، `OrderBadges`، `Segments` |
| CI، مرحلهٔ «پنل، سرتاسری» | `orders.spec.ts` هم: استوریج، و کارگر دوم (`docworker-admin`) روی `jy_admin` که PDF جزوه را واقعاً می‌سازد |

- وضعیت فقط دیدنی است؛ «شروع چاپ»، «تحویل پست شد»، لغو و ویرایش نشانی با ۴٫۳.
- تصمیم‌های اجرا و سنجش‌ها در ADR-037، ADR-038 و ADR-039، بخش «اجرا در ۴٫۲»؛ رابط و فرق‌ها با طرح در `docs/UI.md`، «۴٫۲».

#### ۴٫۳: وضعیت سفارش (#42، ادغام و مستقر شد)

| جا | کار |
|---|---|
| `packages/db`: `schema.ts`، `0010_order_status.sql`، `0011_order_status_guards.sql` | سه وضعیت تازه (`printing`، `handed_to_post`، `cancelled`)، `handed_to_post_at`، `order_status_events.admin_user_id` و سه CHECK؛ تریگر `orders_price_frozen` حالا گذارها را هم می‌سنجد (`orders_status_flow`). مقدار تازهٔ enum در همان اجرای مهاجرت در هیچ DDL نیامده (پایین) |
| `packages/db/src/panel.ts` | `changeStatus`: به‌روزرسانی شرطی از وضعیتی که ادمین دید، رویداد سفارش و رویداد ادمین در یک تراکنش؛ `editRecipient` زیر قفل سطر با فیلدهای عوض‌شده و مقدار قبلی در رویداد؛ `stats` برای سطر آمار پیشخوان؛ سطل‌های «تحویل پست شد» و «لغو شد»، و «باز» = در صف چاپ و در حال چاپ |
| `packages/db`: `orders.ts`، `admin.ts` | `PAID_STATUSES` و `isPaidStatus` (سایت و پنل)؛ مجوز تازهٔ `orders.revert` فقط برای مالک |
| `packages/text/src/input.ts` | `checkRecipient` از `apps/web/lib/recipient.ts` به اینجا آمد، تا مسیر خرید و ویرایش پنل یک قاعده داشته باشند (ADR-034، افزوده) |
| `apps/admin/lib/orders.ts`، `lib/server/orders.ts` | گذارها (`transitionOf`)، برگرداندن یک قدم (لغو به همان وضعیت پیش از لغو)، مجوز در سرور (`orders.status`، `orders.revert`، `orders.address`)، دلیل ۱ تا ۵۰۰ نویسه، «شروع چاپ» فقط با PDF همهٔ جزوه‌ها، و کلیک هم‌زمان: یک گذار، و دومی اگر به همان مقصد است موفق |
| `apps/admin/app/[gate]/…`، `components/` | ستون کنار با یک دکمهٔ اصلی، و لغو و برگرداندن و ویرایش در همان صفحه با `?do=` (بی JS)؛ `ReasonForm`، `RecipientForm`، `StatusButton`؛ چیپ‌ها، ستون آخر هر سطل، سطر آمار پیشخوان و متن رویدادها |
| `apps/web`: `app/order/[token]`، `lib/server/checkout.ts` | صفحهٔ سفارش مشتری با «در حال چاپ»، «به پست رسید» (روز و «در مهلت») و «لغو شد … برمی‌گردد»؛ پرداخت دوباره برای هیچ وضعیت پس از پرداخت |
| `services/docworker/docworker/orders.py` | `prepare_order` برای «در حال چاپ» هم؛ لغوشده یا به پست رسیده `order_closed` |
| CI، مرحلهٔ «پنل، سرتاسری» | `status.spec.ts` هم، با همان پایگاه داده و کارگر `orders.spec.ts` |

- مهاجرت enum: Drizzle همهٔ مهاجرت‌های مانده را در **یک تراکنش** اجرا می‌کند و پستگرس مقدار تازه‌ای را که `ALTER TYPE …
  ADD VALUE` افزوده در همان تراکنش نمی‌پذیرد («unsafe use of new value»)؛ پس `0010` و `0011` مقدار تازه را در DDL
  نمی‌آورند (CHECKها با `status::text` یا مقدارهای قدیم)، و فقط بدنهٔ تابع plpgsql، که هنگام اجرا حل می‌شود، آن‌ها را دارد.
  هر سه راه سنجیده شد: پایگاه دادهٔ تازه، ارتقا از `0009`، و ارتقا با دادهٔ موجود.
- تصمیم‌های اجرا و سنجش‌ها در ADR-038 و ADR-039، بخش «اجرا در ۴٫۳»؛ رابط و فرق‌ها با طرح در `docs/UI.md`، «۴٫۳».

#### ۴٫۴: تعرفه از پایگاه داده در سایت (#44، ادغام و مستقر شد)

| جا | کار |
|---|---|
| `apps/web/app/page.tsx` | `revalidate = 60` (ISR)؛ تعرفه و روز کاری را یک بار می‌خواند و به جدول تعرفه، سؤال‌ها (و JSON-LD)، «سه قدم»، قهرمان و JSON درون HTML (`<script id="jy-tariff" type="application/json">`) می‌دهد |
| `apps/web/lib/server/tariff.ts` | `siteTariff`: تعرفهٔ فعال و `order.sla_days` از همان `OrderStore` مسیر خرید؛ در build و بی `DATABASE_URL` تعرفهٔ پایه؛ خطای پایگاه داده بالا می‌رود تا ISR صفحهٔ قبلی را نگه دارد |
| `apps/web/lib/tariff.ts` | `tariffJson` (هر `<` گریخته)، `parseTariff` و `pageTariff` برای رابط پس از فایل؛ نبود یا خراب: تعرفهٔ پایه |
| `components/Tariff.tsx`، `Faq.tsx`، `HowItWorks.tsx` | عددها از props، نه `SEED_PRICE_LIST`؛ سؤال «ارسال» و «سه قدم» با `slaDays` |
| `components/OrderDesk.tsx`، `checkout/Checkout.tsx` | `quote()`، کاشی‌ها، خلاصه، برگرداندن بعد از رفرش و مسیر خرید با تعرفهٔ صفحه؛ «تحویل به پست تا N روز کاری» مسیر خرید از `slaDays` صفحه، نه ثابت ۲ |
| CI، مرحلهٔ «مسیر خرید، سرتاسری» | `tariff.spec.ts` آخر و جدا: تعرفهٔ فعال دیگر و ۳ روز کاری در پایگاه داده، ISR، پیش‌فاکتور برابر سرور، رفرش، و ۴۰۹ «تعرفه به‌روز شده» با سفارش منجمد |

- باندل اولیه همان ۱۰۷٬۶۳۳ بایت است؛ خواندن JSON فقط در تکهٔ رابط پس از فایل است. HTML صفحهٔ اصلی (gzip) حدود ۱ کیلوبایت
  بزرگ‌تر شد (۸٬۴۸۶ ← ۹٬۴۹۲ بایت)، چون JSON یک بار در خود اسکریپت و یک بار در دادهٔ RSC می‌آید؛ هنوز در رفت‌وبرگشت اول TCP.
- تصمیم‌های اجرا و سنجش‌ها در ADR-040، «اجرا در ۴٫۴»؛ زمان‌ها در `docs/UI.md`، «۴٫۴».

#### ۴٫۵: ویرایش تعرفه (#45، ادغام و مستقر شد)

| جا | کار |
|---|---|
| `packages/db`: `schema.ts`، `0012_price_list_versions.sql` (تولیدی)، `0013_price_list_guards.sql` (دست‌نویس) | `activated_at`، `created_by` و `based_on` روی `price_lists`، و نمایهٔ `orders_price_list`؛ `activated_at` نسخهٔ فعال و هر نسخه‌ای که سفارش دارد (پایگاه دادهٔ موجود)، CHECK `price_lists_active_activated`، و دو تریگر: `price_lists_frozen` (سرِ نسخهٔ فعال‌شده جز `is_active` عوض و پاک نمی‌شود، و فعال شدن زمانش را یک بار می‌نویسد) و `price_list_rows_frozen` روی پنج جدول ردیف، با `FOR SHARE` روی سرِ نسخه |
| `packages/db/src/tariff.ts`، `seed.ts` | `TariffStore`: نسخه‌ها با شمار سفارش، فعال شدن‌ها (`activated_at` و رویدادها)، پیش‌نویس (یکی در هر زمان، شمارهٔ بعدی زیر قفل مشورتی)، ذخیره و پاک کردن با `verify`، و فعال کردن نسبت به نسخهٔ فعالی که ادمین دید؛ هر کار با رویدادش در همان تراکنش. `seedPriceList` سرِ نسخه را اول غیرفعال می‌نشاند، بعد ردیف‌ها، بعد فعال می‌کند |
| `apps/admin/lib/tariff.ts` | منطق خالص، مشترک ویرایشگر مرورگری و سرور: فرم تومانی و تبدیل به ریال با ورودی فارسی‌نرمال، سنجش با پیام دقیق طرح (شکاف، همپوشانی، آغاز و پایان بازه‌ها بر حسب برگ)، هشدار ده برابر، `checkPriceList`، پیش‌نمایش چهار جزوه با `quote()`، فهرست تغییرها، و دوره‌های فعال بودن |
| `apps/admin/lib/server/tariff.ts` | سرویس بی نکست: مجوز در سرور (`tariff.read`، `tariff.edit`)، سنجش دوبارهٔ فرم، اثر انگشت محتوا («همان که دیده شد»)، و کد تازه (`stepUp`) فقط پس از هر سنجشی که بی کد جواب دارد |
| `apps/admin/app/[gate]/(panel)/tariff/…`، `components/` | `tariff` (نسخه‌ها و نسخهٔ فعال)، `tariff/[version]` (ویرایشگر پیش‌نویس، یا نسخهٔ قبل فقط‌خواندنی)، `tariff/[version]/activate` (تغییرها و کد تازه)؛ `TariffCards`، `TariffEditor`، `TariffActivateForm`؛ زبانهٔ «تعرفه» برای هر دو نقش، رویدادهای `tariff.*` و چیپ «تعرفه» |
| CI، مرحلهٔ «پنل، سرتاسری» | `tariff.spec.ts` آخر: صفحهٔ اصلی همان وب ۳۱۰۱ پس از فعال کردن (`E2E_WEB_BASE_URL`)، و نسخهٔ ۱ دوباره فعال در پایان |

- ارتقای پایگاه دادهٔ موجود (سرور زنده): نسخهٔ ۱ فعال است، پس با همین استقرار `activated_at` می‌گیرد و دیگر عوض نمی‌شود؛
  بی پر کردن `activated_at`، CHECK تازه روی پایگاه دادهٔ موجود می‌افتاد. سه راه سنجیده شد (پایین، ADR-040).
- باندل اولیهٔ سایت همان ۱۰۷٬۶۳۳ بایت؛ ویرایشگر با موتور قیمت تکهٔ صفحهٔ پیش‌نویس پنل است (۹٫۹ کیلوبایت).
- تصمیم‌های اجرا و سنجش‌ها در ADR-040، «اجرا در ۴٫۵»؛ رابط و فرق‌ها با طرح در `docs/UI.md`، «۴٫۵».

#### ۴٫۶: تنظیمات و کلیدها (#46، ادغام و مستقر شد)

| جا | کار |
|---|---|
| `packages/db`: `schema.ts`، `0014_service_secrets.sql` (تولیدی) | جدول `service_secrets` با CHECK نام (فقط `SMS_API_KEY`، `SMS_OTP_TEMPLATE`، `PAYMENT_MERCHANT_ID`) و CHECK شکل مهروموم؛ `updated_by` بی کلید خارجی |
| `packages/db/src/settings.ts` | `SettingsStore`: خواندن، و تغییر زیر قفل مشورتی و قفل ردیف با `decide` («بنویس»، «همان»، «رد») و رویداد در همان تراکنش؛ ردیفی که نیست با اولین نوشتن |
| `packages/db/src/secrets.ts` | `SecretStore` (فهرست، خواندن، نوشتن و پاک کردن زیر قفل با `verify` و رویداد بی مقدار)؛ `SERVICE_KEYS`، جای مهروموم `service_secrets:<نام>`؛ و `resolveServiceKey`/`readServiceKey`: پنل بر `.env` مقدم، «خوانده نشد» نه `.env` و نه خالی، با هر استفاده (آداپتورهای برش ۷) |
| `packages/contracts`، `packages/db/src/reference.ts` | تنظیم تازهٔ `calendar.official_through` (پیش‌فرض ۱۴۰۵) در `SETTING_SCHEMAS` و `DEFAULT_SETTINGS`؛ دادهٔ پایه می‌نشاندش |
| `apps/admin/lib/settings.ts` | منطق خالص: عدد و تاریخ فارسی‌نرمال، روز واقعی تقویم (با `Intl`، کبیسه)، تعطیلی تازه فقط آینده و تا پایان سال بعد، نمای تعطیلی‌ها (پنج روز نزدیک، «همه را ببین»، گذشته، هشدار قمری و سال بعد)، مقدار کلید، و فقط ۴ نویسهٔ آخر |
| `apps/admin/lib/server/settings.ts` | سرویس بی نکست: مجوز در سرور (`settings.edit`، `secrets.edit`)، همان `SETTING_SCHEMAS`، «همان که دیده شد»، تعطیلی روی فهرست امروز، و کلید با کد تازه (`stepUp`) فقط پس از هر سنجشی که بی کد جواب دارد؛ مقدار کلید جز مهروموم هیچ‌جا |
| `apps/admin/app/[gate]/(panel)/settings`، `components/` | صفحهٔ «تنظیمات» طبق `m-settings` و `m-key-edit`: `NumberSettingForm` (شمارنده و فیلد)، `HolidayAddForm`، `KeyForm` (تغییر و «برگرداندن به .env» با `?key=` و `?revert=`، بی JS)؛ زبانهٔ «تنظیمات» مالک، چیپ رویداد «تنظیمات و کلیدها» و متن «فقط مالک» طرح |
| `apps/admin/instrumentation.ts` | خط بالا آمدن «✓ پنل ادمین: کلیدهای سرویس‌ها — …» (نام و منبع، هرگز مقدار)، و «⚠» برای کلیدی که خوانده نشد |
| CI، مرحلهٔ «پنل، سرتاسری» | `settings.spec.ts` هم؛ `SMS_API_KEY` تصادفی برای پنل و `E2E_KEY_PROBE` برای مقدار پنل، و پس از اجرا هیچ‌کدام در لاگ پنل و وب |

- آداپتورهای پیامک و درگاه واقعی و «آزمایش پیش از ذخیره» با برش ۷ (سؤال ۲۱)؛ امروز `SMS_PROVIDER=console` و `PAYMENT_PROVIDER=mock`، پس
  کسی کلیدها را نمی‌خواند جز خود پنل برای نشان دادن منبع و ۴ نویسهٔ آخر.
- **کار دستی صاحب پروژه از ۴٫۶:** نسخهٔ پشتیبان `.env` (بی `SECRETS_KEY` کلیدهای ذخیره‌شدهٔ پنل خوانده نمی‌شوند)؛ و تطبیق تعطیلی‌های
  قمری ۱۴۰۶ با تقویم رسمی منتشرشده، از خود پنل، پیش از باز شدن مسیر خرید روی سایت زنده.
- باندل اولیهٔ سایت همان ۱۰۷٬۶۳۳ بایت؛ کد مرورگری سایت عوض نشد.
- تصمیم‌های اجرا و سنجش‌ها در ADR-041 و ADR-038، «اجرا در ۴٫۶»؛ رابط و فرق‌ها با طرح در `docs/UI.md`، «۴٫۶».

### برش ۵: برنامه و وضعیت

برنامه تأیید شد (۱۴۰۵/۰۷/۰۵، سؤال‌های ۲۹ تا ۳۸، همه طبق پیشنهاد). رابطش طرح نمونه‌ای است که پیش از ۵٫۱ ساخته و تأیید شد
(۱۴۰۵/۰۷/۰۵، سؤال‌های ۳۹ تا ۴۶، همه طبق پیشنهاد): حالت‌های تازهٔ `docs/ui/mockups/admin.html` (`docs/UI.md`، بخش ۸). تصمیم‌ها: ADR-042 (چاپخانه‌ها، تخصیص و نقش
چاپخانه با محدوده)، ADR-043 (فایل آمادهٔ چاپ و برگهٔ سفارش) و ADR-044 (نگهداری فایل‌های سفارش). نام‌ها ۵٫۱ تا ۵٫۳، مثل برش ۴.

| PR | دامنه | وضعیت |
|---|---|---|
| سند | همین برنامه: ADR-042 تا ۰۴۴، سؤال‌های ۲۹ تا ۳۸، و «ادغام و مستقر شد» #46 | #47، ادغام شد |
| ۵٫۱ | خروجی چاپ: کارگر فایل چاپ هر جلد را می‌سازد (A4 عمودی، چرخش صفحهٔ افقی، حاشیه‌نویسی‌ها، جلدها با ریز قیمت منجمد، بی بازنویسی وقتی فرقی نیست) و برگهٔ سفارش با برچسب پست (`prepare_ticket`)؛ در جزئیات سفارش پنل کارت فایل چاپ و برگه، با دانلود جریانی و رویداد؛ «شروع چاپ» فقط با فایل چاپ؛ نگهداری فایل‌های سفارش و عددش در «تنظیمات» | #48، ادغام و مستقر شد (پایین) |
| ۵٫۲ | چاپخانه‌ها و تخصیص: `print_partners`، `orders.print_partner_id`، `order_assignments` و محافظ‌ها؛ «چاپخانهٔ جزوه‌یار» در دادهٔ پایه؛ تخصیص خودکار در پرداخت؛ جابه‌جایی با دلیل (`orders.assign`)؛ زبانهٔ «چاپخانه‌ها» (`partners.manage`)؛ هشدار «بی چاپخانه»؛ چاپخانه روی برگه | #49، ادغام و مستقر شد (پایین) |
| ۵٫۳ | نقش چاپخانه: نقش سوم و محدوده (`admin_user_roles.print_partner_id`)، مجوزهای تازهٔ `orders.cancel` و `orders.money`، محدودهٔ اجباری در هر کوئری پنل، پنل از چشم چاپخانه (بی مبلغ، بی لغو)، و افزودن کاربر چاپخانه در «ادمین‌ها» | #50، ادغام و مستقر شد (پایین) |

تصمیم‌های ۱۴۰۵/۰۷/۰۵، همه طبق پیشنهاد:
- سؤال ۲۹: مدل برای چند چاپخانه (ADR-012)؛ اولین ردیف «چاپخانهٔ جزوه‌یار» در تهران، پیش‌فرض.
- سؤال ۳۰: نقش سوم «چاپخانه» در همین پنل، با همان ورود؛ فقط سفارش‌های خودش و بی مبلغ، با نام، نشانی، کد پستی و موبایل گیرنده
  برای برچسب پست؛ بیرون از محدوده ۴۰۴.
- سؤال ۳۱: تخصیص خودکار در پرداخت: همان شهر، وگرنه همان استان، وگرنه پیش‌فرض. جابه‌جایی با مالک و متصدی، فقط در «در صف چاپ»،
  با دلیل و بی کد تازه. بی چاپخانهٔ فعال: «بی چاپخانه» با هشدار، نه بن‌بست.
- سؤال ۳۲: فایل آمادهٔ چاپ: A4 عمودی مثل «Fit»، چرخش صفحهٔ افقی، حاشیه‌نویسی‌ها، یک فایل برای هر جلد؛ بی تغییر همان PDF جزوه. نه
  جابه‌جایی برای حاشیهٔ صحافی، نه سیاه‌سفید کردن فایل.
- سؤال ۳۳: برگهٔ سفارش A4 جدا از فایل جزوه، PDF کارگر، با برچسب پست: نام گیرنده و شمارهٔ سفارش کنارش.
- سؤال ۳۴: وضعیت تازه‌ای نیست؛ چاپخانه «شروع چاپ» و «تحویل پست شد» را می‌زند؛ لغو با مالک و متصدی، برگرداندن با مالک.
- سؤال ۳۵: زبانهٔ «چاپخانه‌ها» فقط مالک؛ کاربر چاپخانه از «ادمین‌ها»، با پیوند یک‌باره و کد تازه.
- سؤال ۳۶: فایل‌های سفارش ۳۰ روز پس از «تحویل پست شد» یا «لغو شد» پاک می‌شوند؛ عددش در «تنظیمات».
- سؤال ۳۷: طرح نمونه پیش از ۵٫۱، بیرون از گیت.
- سؤال ۳۸: سه PR به همین ترتیب، و یک PR سند پیش از آنها (همین).
- ۱۴۰۵/۰۷/۰۶: تصمیم‌های کوچک «اجرا در ۵٫۲» و «اجرا در ۵٫۳» (ADR-042) طبق پیشنهادها تأیید شد؛ برش ۵ با ادغام و استقرار #50 تمام
  شد.

**جریان کار:** پرداخت ← تخصیص خودکار، و کارهای `prepare_order` (PDF جزوه و فایل چاپ) و `prepare_ticket` (برگه) ← پیشخوان
چاپخانه ← دانلود فایل‌ها ← «شروع چاپ» ← چاپ، صحافی و بسته‌بندی با برچسب ← «تحویل پست شد». جابه‌جایی فقط پیش از «شروع چاپ».

**سنجش‌ها** (هر محافظ با شاهد):
- ۵٫۱: کارگر روی PDF واقعی (A5، A4 افقی، هایلایت، ۱۶۵۰ صفحهٔ دورو در دو جلد ۸۲۶ و ۸۲۴ صفحه‌ای، و A4 یک‌جلدی بایت‌به‌بایت)، شمار
  صفحهٔ هر فایل برابر قیمت، و برگهٔ فارسی؛ پستگرس (فایل‌ها، و نگهداری فقط برای سفارش بسته)؛ سرتاسری پنل (دانلود هر جلد با همان
  sha256 کارگر، برگه، «شروع چاپ» بسته بی فایل چاپ، «فایل‌ها پاک شد»).
- ۵٫۲: پستگرس (حداکثر یک پیش‌فرض، سه سطح تخصیص و بی چاپخانه، جابه‌جایی فقط در صف و از چاپخانهٔ دیده‌شده، جابه‌جایی و «شروع چاپ»
  هم‌زمان فقط یکی، تاریخچه فقط افزودنی)؛ سایت (پرداخت تخصیص می‌دهد)؛ سرتاسری پنل (زبانهٔ «چاپخانه‌ها»، جابه‌جایی و هشدار).
- ۵٫۳: پستگرس (CHECK محدوده)؛ واحد (هر تابع ذخیره‌گاه با محدوده)؛ سرتاسری با دو چاپخانه و دو کاربر: هر کدام فقط سفارش خودش، ۴۰۴
  برای دیگری در صفحه، دانلود و هر کار، بی مبلغ و بی لغو؛ و مالک و متصدی مثل امروز.

**بیرون از برش ۵:** تسویه و گزارش کار چاپخانه؛ پیامک به چاپخانه (برش ۷)؛ کرایهٔ ارزان‌تر برای چاپ محلی (تعرفه)؛ فایل پست هر
چاپخانه و تطبیقش (برش ۶)؛ سیاه‌سفید کردن فایل و حالت ترکیبی رنگ.

**دست نمی‌خورد:** تز محصول، قیمت منجمد، صفحهٔ سفارش مشتری، و باندل اولیهٔ سایت؛ کد مرورگری سایت عوض نمی‌شود، و از سایت فقط
تراکنش پرداخت سرور، برای تخصیص (۵٫۲). ایمیج پایهٔ کارگر هم عوض نمی‌شود (فقط PyMuPDF).

**کار دستی صاحب پروژه:** پس از ۵٫۲، اگر نام دیگری می‌خواهی، نام «چاپخانهٔ جزوه‌یار» از زبانهٔ «چاپخانه‌ها»؛ پس از ۵٫۳، کاربر هر
چاپخانهٔ طرف قرارداد از «ادمین‌ها»؛ و با پایان همکاری با یک چاپخانه، غیرفعال کردن کاربرانش و `ADMIN_BASE_PATH` تازه.

#### ۵٫۱: خروجی چاپ (#48، ادغام و مستقر شد)

| جا | کار |
|---|---|
| `packages/db`: `schema.ts`، `0015_print_files.sql` (تولیدی)، `0016_print_files_guards.sql` (دست‌نویس) | `order_print_files`، `order_tickets` و `orders.files_deleted_at`؛ تریگرهای `order_print_files_frozen` و معوق `order_print_files_cover` (جلدها با ریز قیمت منجمد)؛ `order_ticket_stamp(orders)`؛ `orders_files_deleted` در `orders_price_frozen` و CHECK `orders_files_deleted_closed`؛ ارتقا: `prepare_order` سفارش‌های باز دوباره، و `prepare_ticket` برایشان |
| `packages/db/src/orders.ts`، `panel.ts`، `reference.ts`؛ `packages/contracts` | `settlePayment` هر دو کار را می‌گذارد؛ پنل فایل چاپ هر جلد، برگه با «تازه» یا نه، کار برگه و «فایل‌ها پاک شد» را می‌خواند؛ ویرایش گیرنده کار برگه را در همان تراکنش؛ `requeue` هر دو کار؛ تنظیم `order.files_retention_days` (۷ تا ۳۶۵، پیش‌فرض ۳۰) |
| `services/docworker`: `orders.py`، `printfile.py`، `ticket.py`، `retention.py`، `jalali.py`، `__main__.py` | `prepare_order` با فایل چاپ هر جلد، `prepare_ticket` (PDF و پیش‌نمایش PNG با وزیرمتن)، پاک کردن فایل‌های سفارش بسته بین کارها (`DOCWORKER_RETENTION_SECONDS`، فقط نود کارهای سفارش)، و تاریخ شمسی با بردارهای هم‌ارزی `packages/text/parity/jalali.json` |
| `apps/admin/lib/orders.ts`، `lib/server/orders.ts`، `lib/server/download.ts` | نمای فایل چاپ، «چه عوض شد»، برگه و «فایل‌ها پاک شد»؛ `printReady`؛ دانلود هر جلد، PDF اصلی و برگه، جریانی با رویداد؛ «دوباره بساز» هر کار |
| `apps/admin/app/[gate]/(panel)/orders/[number]/…` | کارت هر جزوه با فایل چاپ و برگه (در سفارش چندجزوه‌ای کارت جدای برگه)؛ `print/[item]/[volume]`، `pdf/[item]`، `ticket` (صفحه با پیش‌نمایش)، `ticket/pdf` و `ticket/preview` |
| `apps/admin/app/[gate]/(panel)/settings` | کارت «فایل‌های سفارش» با شمارنده (`NumberSettingForm`) |
| `apps/web/lib/server/testing.ts` و تست‌ها | ذخیره‌گاه حافظه‌ای و تست‌های مسیر خرید هر دو کار پرداخت را می‌بینند؛ کد مرورگری سایت دست نخورد |
| CI | ایمیج کارگر ماژول‌های تازه و وزیرمتن را بار می‌کند؛ «پنل، سرتاسری» با `print.spec.ts` و دور پاک کردن ۲ ثانیه‌ای کارگر (`DOCWORKER_RETENTION_SECONDS=2`) |

- باندل اولیهٔ سایت همان ۱۰۷٬۶۳۳ بایت؛ ایمیج پایهٔ کارگر عوض نشد (فقط PyMuPDF و وزیرمتنِ همان).
- **پس از استقرار، خودکار:** مهاجرت `0016` کار `prepare_order` سفارش‌های باز را دوباره در صف می‌گذارد و `prepare_ticket` را برایشان، پس
  کارگر فایل چاپ و برگهٔ سفارش‌های پیش از ۵٫۱ را هم می‌سازد. سفارش پیش از ۵٫۱ که بسته است، فایل چاپ و برگه نمی‌گیرد؛ PDF جزوه‌اش
  همان است.
- تصمیم‌های اجرا و سنجش‌ها در ADR-043 و ADR-044، «اجرا در ۵٫۱»؛ رابط و فرق‌ها با طرح در `docs/UI.md`، «۵٫۱».

#### ۵٫۲: چاپخانه‌ها و تخصیص (#49، ادغام و مستقر شد)

| جا | کار |
|---|---|
| `packages/db`: `schema.ts`، `0017_print_partners.sql` (تولیدی)، `0018_print_partners_guards.sql` (دست‌نویس) | `print_partners`، `order_assignments` و `orders.print_partner_id`؛ ایندکس یکتای «یک پیش‌فرض» و CHECKهای نام، پیش‌فرض فعال، کننده و «جابه‌جا می‌کند»؛ تریگرهای `orders_print_partner` (خالی نه، فقط در صف، فقط فعال با `FOR SHARE`)، `order_assignments_chain`، معوق `orders_partner_recorded` و `order_assignments_recorded`، `order_assignments_append_only` و `print_partners_guard`؛ `order_ticket_stamp` با چاپخانه؛ ارتقا: برگهٔ سفارش‌های باز دوباره |
| `packages/db/src/assignment.ts`، `orders.ts`، `panel.ts`، `partners.ts`، `reference.ts`، `admin.ts` | `choosePartner` و `assignAtPayment` در تراکنش `settlePayment`؛ پنل: کارت چاپخانه، تاریخچهٔ تخصیص، گزینه‌ها، `assignPartner`، «شروع چاپ» از چاپخانهٔ دیده‌شده و هشدار `unassigned`؛ ذخیره‌گاه زبانهٔ «چاپخانه‌ها» زیر قفل مشورتی، ویرایشی که کار برگه را دوباره در صف می‌گذارد؛ «چاپخانهٔ جزوه‌یار» در دادهٔ پایه؛ مجوزهای `orders.assign` (مالک و متصدی) و `partners.manage` (مالک) |
| `services/docworker/docworker/ticket.py` | «چاپ نور، مشهد · پرداخت …» زیر مهلت برگه |
| `apps/admin/lib/partners.ts`، `lib/server/partners.ts`، `lib/orders.ts`، `lib/server/orders.ts`، `lib/events.ts` | شهر از فهرست سایت (`pickCity`)، متن‌های کارت و تاریخچه؛ سرویس زبانه؛ جابه‌جایی و دروازهٔ «شروع چاپ»؛ ستون «بی چاپخانه» و علت برگهٔ در حال به‌روز شدن؛ رویدادها و چیپ «چاپخانه‌ها» |
| `apps/admin/app/[gate]/(panel)/…` | کارت «چاپخانه» و فرم جابه‌جایی (`?do=assign`) در سفارش، هشدار پیشخوان، زبانهٔ «چاپخانه‌ها» (`partners`، `partners/new`، `partners/[id]`) |
| `apps/web/lib/server/testing.ts` و تست‌ها | ذخیره‌گاه حافظه‌ای با همان `choosePartner`؛ کد مرورگری سایت دست نخورد |
| CI | «پنل، سرتاسری» با `partners.spec.ts` |

- باندل اولیهٔ سایت همان ۱۰۷٬۶۳۳ بایت؛ کرایهٔ مشتری و ایمیج پایهٔ کارگر دست نخوردند.
- **پس از استقرار، خودکار:** دادهٔ پایه «چاپخانهٔ جزوه‌یار» را در تهران و پیش‌فرض می‌نشاند (لاگ وب: «اولین چاپخانه: …»)، و مهاجرت
  `0018` برگهٔ سفارش‌های باز را دوباره می‌سازد. سفارش باز پیش از ۵٫۲ بی چاپخانه می‌ماند و هشدار می‌گیرد؛ سایت زنده (`off`) سفارشی
  ندارد.
- تصمیم‌های اجرا و سنجش‌ها در ADR-042، «اجرا در ۵٫۲»؛ رابط و فرق‌ها با طرح در `docs/UI.md`، «۵٫۲».

#### ۵٫۳: نقش چاپخانه و محدوده (#50، ادغام و مستقر شد)

| جا | کار |
|---|---|
| `packages/db`: `schema.ts`، `0019_admin_role_partner.sql` (تولیدی)، `0020_admin_role_partner_guards.sql` (دست‌نویس) | `admin_user_roles.print_partner_id` با کلید خارجی به جای `scope`؛ CHECK `admin_user_roles_partner` (نقش چاپخانه یعنی دقیقاً یک چاپخانه، نقش‌های دیگر هیچ) و EXCLUDE `admin_user_roles_partner_alone` (کاربر چاپخانه فقط همین نقش) |
| `packages/db/src/panel.ts` | `PanelScope` («همه» یا یک چاپخانه) اولین آرگومان اجباری هر تابع ذخیره‌گاه سفارش‌های پنل، شرطش در خود کوئری، در UPDATE نوشتن‌ها و خواندن پیگیری‌شان هم؛ «دوباره بساز» با `FOR SHARE` در محدوده (`not_found`) |
| `packages/db/src/admin.ts`، `partners.ts` | نقش `print_partner` و مجوزهای `orders.cancel` و `orders.money` (مالک و متصدی)؛ پیوند کاربر چاپخانه فقط با چاپخانهٔ فعال زیر `FOR SHARE`؛ چاپخانهٔ نشست و فهرست ادمین‌ها؛ `partnerChoices`؛ کاربرهای هر چاپخانه در فهرست «چاپخانه‌ها» |
| `apps/admin/lib/server/auth.ts`، `lib/server/orders.ts`، `lib/orders.ts` | `scopeOf(session)`؛ فرم «افزودن ادمین» با نقش و چاپخانه، و دستور سرور بی نقش چاپخانه؛ ۴۰۳ پیش از خواندن برای کاری که نقش ندارد، ۴۰۴ بیرون از محدوده؛ بی مبلغ (`withoutMoney`) و از چشم چاپخانه (`partnerView`) در سرویس؛ چهار چیپ چاپخانه |
| `apps/admin/app/[gate]/(panel)/…`، `components/…` | پیشخوان و فهرست بی ستون مبلغ؛ جزئیات بی کارت چاپخانه، مبلغ، پرداخت‌ها، لغو و ویرایش؛ «این سفارش چاپ نمی‌شود؛ …»؛ «این بخش برای چاپخانه باز نیست» (`NoAccess`)؛ «این سفارش پیدا نشد» با ۴۰۴ واقعی (`orders/[number]/not-found.tsx`)؛ «افزودن ادمین» با سه نقش و «کدام چاپخانه»؛ نقش و چاپخانه در «ادمین‌ها»، پیوند ثبت و سربرگ؛ کاربرها در «چاپخانه‌ها» |
| CI | «پنل، سرتاسری» با `scope.spec.ts` |

- باندل اولیهٔ سایت همان ۱۰۷٬۶۳۳ بایت؛ سایت و کارگر دست نخوردند.
- **پس از استقرار، خودکار:** مهاجرت `0019` ستون `scope` را، که فقط null بود، برمی‌دارد؛ دادهٔ پایهٔ وب نقش «چاپخانه» و مجوزهای
  `orders.cancel` و `orders.money` را می‌نشاند. مالک و متصدی همان‌اند که بودند.
- **کار دستی صاحب پروژه:** کاربر هر چاپخانهٔ طرف قرارداد از «ادمین‌ها» (نقش «چاپخانه»، پیوند یک‌باره و کد تازه). با پایان همکاری با یک
  چاپخانه، کاربرانش غیرفعال (غیرفعال کردن خود چاپخانه کاربر را نمی‌بندد)، و `ADMIN_BASE_PATH` تازه.
- تصمیم‌های اجرا و سنجش‌ها در ADR-042، «اجرا در ۵٫۳»؛ رابط و فرق‌ها با طرح در `docs/UI.md`، «۵٫۳».

### برش ۶: برنامه و وضعیت

برنامه تأیید شد (۱۴۰۵/۰۷/۰۶، سؤال‌های ۴۷ تا ۶۰، همه طبق پیشنهاد). رابطش طرح نمونه‌ای است که پیش از ۶٫۱ ساخته و تأیید شد
(۱۴۰۵/۰۷/۰۶، سؤال‌های ۶۱ تا ۶۹): حالت‌های تازهٔ `docs/ui/mockups/admin.html` (`docs/UI.md`، بخش ۹). تصمیم‌ها: ADR-045 (ورود فایل پست:
پیش‌نمایش و «ثبت»، خواندن در کارگر، و برگرداندن)، ADR-046 (تطبیق، صف تأیید، «کد رهگیری یعنی تحویل پست شد» و فایل چاپخانه)، ADR-047
(رهگیری برای مشتری: پیامک و صفحهٔ سفارش) و ADR-048 (گزارش حاشیهٔ ارسال). نام‌ها ۶٫۱ تا ۶٫۴، مثل برش ۵.

| PR | دامنه | وضعیت |
|---|---|---|
| سند | همین برنامه: ADR-045 تا ۰۴۸، سؤال‌های ۴۷ تا ۶۰، و «ادغام و مستقر شد» #50 | #51، ادغام و مستقر شد |
| ۶٫۱ | ورود فایل پست: `shipment_imports`، `shipment_import_rows` و `shipments` با محافظ‌ها؛ کار `read_post_file` کارگر (HTML، CSV، XLSX)؛ آداپتور «پست ایران» و تفسیر جدول؛ زبانهٔ «ارسال» (بارگذاری، پیش‌نمایش، «ثبت»، ورودها، برگرداندن)؛ «قطعی» و «تحویل پست شد»؛ کارت «بستهٔ پستی» سفارش و جست‌وجو با بارکد | #52، ادغام و مستقر شد (پایین) |
| ۶٫۲ | صف تأیید و فایل چاپخانه: نمره و نامزدها، «همین است»، «هیچ‌کدام» و دادن دستی (مالک و متصدی)، کنار گذاشتن یک مرسوله، بارگذاری با کاربر چاپخانه در محدودهٔ خودش، هشدار پیشخوان «کد رهگیری ندارد» پس از دو روز کاری (سؤال ۶۰: بی ورود دستی بارکد) | #53، ادغام و مستقر شد (پایین) |
| ۶٫۳ | رهگیری برای مشتری: پیامک رهگیری (کنسولی تا برش ۷؛ آداپتور پیامک مشترک وب و پنل)، و کد رهگیری با پیوند پست در صفحهٔ سفارش | #54، ادغام و مستقر شد (پایین) |
| ۶٫۴ | گزارش حاشیهٔ ارسال (مالک): ماه، منطقه و چاپخانه؛ کرایهٔ منجمد در برابر کرایه و مالیات واقعی؛ وزن واقعی در برابر برآورد | #55، ادغام و مستقر شد (پایین)؛ با آن برش ۶ تمام شد |

تصمیم‌های ۱۴۰۵/۰۷/۰۶، همه طبق پیشنهاد:
- سؤال ۴۷: سه جدول؛ فایل خام در خود پایگاه داده، سقف ۲ مگابایت؛ پیش‌نمایش پیش از «ثبت»؛ بارکد ۲۴ رقمی یکتا میان مرسوله‌های زنده،
  همان فایل یک بار، «تکراری» برای فایل‌های هم‌پوشان، چند مرسوله برای یک سفارش؛ فایل خام و سطرهای «پیدا نشد» N روز بعد پاک.
- سؤال ۴۸: خواندن در کارگر با کتابخانهٔ استاندارد پایتون (جدول HTML، CSV، XLSX)، بی وابستگی تازه و بی ایمیج پایهٔ تازه؛ تفسیر در
  TypeScript پنل؛ `.xls` واقعی پیام روشن (فرق با بخش ۷ تا امروز)؛ بارکد فقط رشتهٔ ۲۴ رقمی؛ پست پشت `ShippingCarrier`.
- سؤال ۴۹: «قطعی» = شمارهٔ «نام گ» از 10001 + سفارش در محدوده + «در حال چاپ» یا «تحویل پست شد» + نام گیرنده + مقصد ناسازگار نه +
  تاریخ پیش از پرداخت نه؛ سخت‌تر از بخش ۷ تا امروز.
- سؤال ۵۰: صف تأیید با تا سه نامزد (پرداخت در ۴۵ روز اخیر) و نمرهٔ نام، شهر، وزن و تاریخ؛ بی نامزد «پیدا نشد»، بیرون از صف و با دادن
  دستی؛ کدهای دستی قدیم «پیدا نشد»؛ «در صف چاپ» فقط با تأیید؛ لغوشده و پرداخت‌نشده نه.
- سؤال ۵۱: بارگذاری با هر سه نقش (چاپخانه فقط سفارش‌های خودش، بی نشت)؛ صف با مالک و متصدی؛ برگرداندن و گزارش با مالک؛ چهار مجوز
  تازه و چیپ «ارسال».
- سؤال ۵۲: ثبت، «در حال چاپ» را «تحویل پست شد» می‌کند، با روز فایل؛ مرسولهٔ زنده فقط در «تحویل پست شد»، و سفارش با کد رهگیری با
  برگرداندن وضعیت بیرون نمی‌رود (شرط تازه روی ADR-039).
- سؤال ۵۳: برگرداندن کل ورود با یک کلیک (مالک، دلیل، بی کد تازه)، و کنار گذاشتن یک مرسوله؛ پیامکی که رفت فهرست می‌شود.
- سؤال ۵۴: یک پیامک برای هر مرسوله، پس از ثبت یا تأیید و بعد از commit؛ کنسولی تا برش ۷؛ متن از دو پارامتر، آمادهٔ قالب کاوه‌نگار؛
  آداپتور پیامک مشترک وب و پنل؛ «دوباره بفرست» برای پیامکی که نرفت.
- سؤال ۵۵: ترتیب همان، ۶ بعد ۷؛ کارهای دستی ۷ که زمان می‌برند از همین حالا.
- سؤال ۵۶: کد و پیوند پست در صفحهٔ سفارش فقط برای صاحب سفارش؛ در پنل کارت «ارسال»، جست‌وجو با بارکد و هشدار پیشخوان.
- سؤال ۵۷: گزارش ماهانهٔ مالک به تفکیک منطقه و چاپخانه، با وزن واقعی در برابر برآورد؛ بی خروجی فایل.
- سؤال ۵۸: چهار PR به همین ترتیب، طرح نمونه پیش از ۶٫۱ (بیرون از گیت)، و این PR سند پیش از همه.
- سؤال ۵۹: نمونهٔ واقعی فایل پست پیش از ۶٫۱، بیرون از مخزن و فقط برای ساختار؛ fixtureها ساختگی با همان ساختار.
- سؤال ۶۰ (شرطی): فایل همان روز یا فردای تحویل ← بی ورود دستی، و هشدار «کد رهگیری ندارد» پس از دو روز کاری؛ دوره‌ای ← ورود دستی
  بارکد در ۶٫۲. پاسخ با نمونهٔ فایل.

پاسخ‌ها و تصمیم‌های پس از برنامه (۱۴۰۵/۰۷/۰۶):
- سؤال ۵۹: نمونهٔ واقعی رسید (`FileName-1954.xls`)، بیرون از مخزن ماند و فقط ساختارش خوانده شد (ADR-045، «اجرا در ۶٫۱»).
- سؤال ۶۰: فایل پست حداکثر تا همان دو روز کاری تحویل به پست می‌رسد. پس ورود دستی بارکد نیست، و هشدار «کد رهگیری ندارد» پس از
  دو روز کاری (۶٫۲).
- سؤال‌های ۶۱ تا ۶۹ (طرح نمونهٔ قدم ۹): طبق پیشنهادها، جز ۶۵: «ثبت» و «دور بینداز» ثابت زیر شمارها، نه نوار چسبان (`docs/UI.md`،
  بخش ۹).
- سؤال ۷۰: «تاریخ ثبت» هر سطر روزی است که پست بسته را گرفت؛ وظیفهٔ ما تحویل به پست و فرستادن کد رهگیری است. پس «تحویل پست شد» با
  همان روز.
- سؤال ۷۱: فقط سطر «فعال» ثبت می‌شود؛ بقیه «غیرفعال در پست».
- سؤال ۷۲: کرایه + مالیات که با «هزینه کل» نخواند فقط هشدار است؛ «بیمه» خوانده نمی‌شود.
- سؤال ۷۳: پیامک رهگیری ما در هر حال می‌رود، حتی اگر پست خودش پیامک بدهد (۶٫۳).
- سؤال ۷۴ (بسته شد ۱۴۰۵/۰۷/۰۸، طبق پیشنهاد): فقط پیوند «رهگیری در سایت پست» (۶٫۱ در پنل، ۶٫۳ برای مشتری). وضعیت بسته درون صفحه نه
  در ۶٫۳ و نه در برش ۷؛ اگر روزی لازم شد، کار کوچک جدا پس از انتقال به هاست ایران (برش ۹)، یا زودتر فقط با یک آزمایش دستی از داخل ایران،
  پشت آداپتور «پست ایران»، با نگه‌داشتن نتیجه و برگشت به پیوند.

تصمیم‌های اجرای ۶٫۲ (۱۴۰۵/۰۷/۰۷، سؤال‌های ۷۵ تا ۸۸، همه طبق پیشنهاد؛ جزئیات در ADR-046، «اجرا در ۶٫۲»):
- ۷۵ و ۷۶: صف جدول تصمیم ندارد؛ «همین است» و دادن دستی خودشان مرسوله‌اند، فقط «هیچ‌کدام» دو ستون یک‌بارنوشتنی روی سطر است، و نامزدها
  هر بار زنده حساب می‌شوند و زیر قفل «همین است» دوباره.
- ۷۷ و ۷۸: تا سه نامزد (سفارش همان شماره، حتی «در صف چاپ»؛ و «در حال چاپ» یا «تحویل پست شد» بی کد با نام خانوادگی‌ای که می‌خواند و
  پرداخت در ۴۵ روزِ پیش از روز پست)؛ پنج معیار با نمرهٔ ۳، ۲، ۲، ۱ و ۱؛ انتخاب از پیش فقط برای تنها نامزد قوی با بیشترین نمره.
- ۷۹ و ۸۰: «هیچ‌کدام» بی برگشت (راه درست کردنش دادن دستی)؛ کد کنارگذاشته سطر را به صف برمی‌گرداند؛ برگرداندن ورود همهٔ کدهایش را کنار
  می‌گذارد؛ کنار گذاشتن یک کد سفارش را فقط وقتی به «در حال چاپ» برمی‌گرداند که همین کد «تحویل پست شد»ش کرده بود، کد دیگری ندارد و
  فایل‌هایش پاک نشده.
- ۸۱: چاپخانه کرایه و مالیات نمی‌بیند. ۸۲: «کد رهگیری ندارد» دو روز کاری پس از تحویل، ثابت کد، فقط ۴۵ روز اخیر. ۸۳: دادن دستی دو قدم.
  ۸۴: تأیید «در صف چاپ» «شروع چاپ» و «تحویل پست شد» را با هم می‌زند. ۸۵: بارکد زنده برای سفارش دیگر «همین است» را می‌بندد. ۸۶:
  قدیمی‌ترین اول. ۸۷: چهار رویداد با چیپ «ارسال». ۸۸: متن سطر «هیچ‌کدام» پس از روزهای نگهداری پاک.

تصمیم‌های اجرای ۶٫۳ (۱۴۰۵/۰۷/۰۸، سؤال‌های ۸۹ تا ۹۸ و ۷۴، همه طبق پیشنهاد؛ جزئیات در ADR-047، «اجرا در ۶٫۳»):
- ۸۹ و ۹۰: پکیج تازهٔ `packages/sms` (آداپتور، کنسولی، متن‌ها، فرستادن منتظرها)؛ پنل تا برش ۷ همیشه کنسولی. پنل پیامک واقعی sms.ir است
  (صاحب پروژه، ۱۴۰۵/۰۷/۰۸).
- ۹۱: ردیف «منتظر» در همان تراکنش، فرستادن بلافاصله بعد از commit در همان درخواست (تا ۴ هم‌زمان)، دوبارهٔ خودکار نه؛ منتظر یا در حال
  فرستادنی که ۵ دقیقه ماند «نرفت» یا «معلوم نیست».
- ۹۲: قطعی، تأیید و دستی، ورود چاپخانه هم، بستهٔ دوم جدا؛ سؤال ۶۷ با وصل به همان ردیف؛ کنارگذاشته هرگز؛ سقف تازه نه (سقف هزینه با برش ۷).
- ۹۳: پیامک اصلاحی نه. ۹۴: «دوباره بفرست» مالک و متصدی، کارت و صفحهٔ ورود، رویداد `shipments.sms_resend`. ۹۵: صفحهٔ مشتری با کد فقط برای
  صاحب، meta `no-referrer`. ۹۶: ردیف «پیامک» و برگشت متن‌های طرح. ۹۷: هشدار پیشخوان پیامک نرفته. ۹۸: داده و محافظ‌ها (`0025`، `0026`).
- ۱۴۰۵/۰۷/۰۸: ۶٫۳ (#54) ادغام و مستقر شد، و تصمیم‌های کوچک «اجرا در ۶٫۳» (ADR-047) طبق همان PR تأیید شد.

تصمیم‌های اجرای ۶٫۴ (۱۴۰۵/۰۷/۰۸، ۹۹ تا ۱۰۷ پیش از ساختن و ۱۰۸ تا ۱۱۱ در ساختن، همه طبق پیشنهاد؛ جزئیات در ADR-048، «اجرا در ۶٫۴»):
- ۹۹: فقط ماه‌هایی که داده دارند، تازه‌ترین اول؛ ماه جاری «تا امروز»؛ ماه در نشانی (`?month=1405-07`).
- ۱۰۰: سفارش چندبسته‌ای = جمع کرایه و مالیات همهٔ بسته‌های زنده‌اش، در برابر کرایهٔ منجمد مشتری؛ کد کنارگذاشته نه.
- ۱۰۱: بازه‌های وزن گزارش از پنل تنظیم‌پذیرند: تنظیم تازهٔ `report.weight_bands` در `SETTING_SCHEMAS`، فقط مالک، با رویداد `settings.*` و «همان
  که دیده شد» زیر قفل (مثل ۴٫۶)؛ روی خود صفحهٔ گزارش با «بازه‌ها را عوض کن»؛ پیش‌فرض بازه‌های وزن کرایهٔ تعرفهٔ فعال؛ بی اثر روی قیمت و
  تعرفه (قاعدهٔ ۶)؛ مرزها صعودی و مثبت، با پیام روشن سر جای خطا.
- ۱۰۲: ردیف بی سفارش (چاپخانه یا منطقه) پنهان. ۱۰۳: «بی کد رهگیری» پیوند به فهرست همان سفارش‌ها. ۱۰۴: جمع به ریال (`bigint`)، نمایش تومان
  گردشده، درصد با یک رقم اعشار. ۱۰۵: کوئری زنده، بی جدول تازه؛ مجوز تازهٔ `reports.read` فقط مالک (نقش‌ها از کد).
- ۱۰۶: دکمهٔ «گزارش ارسال» در «ارسال» و پیوند «کرایه‌ای که پست واقعاً گرفت» در «تعرفه»، هر دو فقط مالک؛ نشانی مستقیم «فقط مالک» پیش از هر
  خواندن. ۱۰۷: برچسب «قالب کد پیامکی کاوه‌نگار» ← «… sms.ir» (فقط متن).
- ۱۰۸: «بی کد رهگیری» به «سفارش‌ها» با `?untracked=1405-07`. ۱۰۹: «برگرداندن به بازه‌های تعرفه». ۱۱۰: یک فیلد برای هر مرز. ۱۱۱: sms.ir برای هر
  چهار متن کلیدهای پیامک «تنظیمات».
- ۱۴۰۵/۰۷/۰۸: ۶٫۴ (#55) ادغام و مستقر شد، و با آن برش ۶ تمام شد.

**جریان کار:** «تحویل پست شد» ← متصدی یا چاپخانه فایل پست را می‌گیرد ← بارگذاری در «ارسال» ← کارگر می‌خواند ← پیش‌نمایش با حکم هر
سطر ← «ثبت» ← قطعی‌ها: مرسوله، «تحویل پست شد» اگر نخورده، پیامک رهگیری، و کد در صفحهٔ سفارش ← بقیه: صف تأیید (مالک و متصدی) یا
«پیدا نشد» ← گزارش ماهانهٔ مالک.

**سنجیده پیش از برنامه** (بیرون از مخزن، فایل ساختگی؛ جزئیات در ADR-045): جدول HTML با پسوند `.xls` با `html.parser` پایتون، هم
UTF-8 و هم windows-1256؛ سرستون‌های «باركد» و «كرايه پستي» در windows-1256 و یکدست شدنشان با `normalizeFa`؛
`extractOrderCodeFromRecipient` روی کد پنج‌رقمی، «ي» و «ك» عربی و ارقام فارسی؛ بارکد ۲۴ رقمی که عدد شود خراب است؛ XLSX با کتابخانهٔ
استاندارد؛ و Calc که در ایمیج پایه نیست. tracking.post.ir از این محیط باز نشد.

**سنجش‌ها** (هر محافظ با شاهد، مثل برش ۵):
- ۶٫۱:
  - کارگر روی fixtureهای ساختگی: HTML با UTF-8، BOM و windows-1256؛ CSV با سه جداکننده؛ XLSX؛ `.xls` واقعی (رد با کد)؛ فایل بزرگ و
    zip بمب (رد)؛ جدول ناپیدا.
  - واحد: سرستون یکدست‌شده؛ فقط «نام گ» (شاهد: جست‌وجو در همهٔ ستون‌ها وزن ۴ رقمی را کد می‌گیرد)؛ «جمع کل» و جمعش؛ بارکد عددی یا
    علمی؛ سطر تکراری در همان فایل؛ و هر شرط «قطعی» با شاهد خودش.
  - پستگرس: بارکد یکتا میان زنده‌ها؛ همان فایل یک بار؛ مرسولهٔ زنده فقط در «تحویل پست شد»، از هر دو سو؛ فقط افزودنی؛ برگرداندن یک
    بار؛ ورود چاپخانه فقط سفارش خودش؛ دو «ثبت» هم‌زمان یکی؛ و «ثبت» هم‌زمان با تغییر وضعیت.
  - سرتاسری پنل با کارگر واقعی: بارگذاری، پیش‌نمایش، «ثبت» و «تحویل پست شد» با کد؛ همان فایل دوباره؛ فایل هم‌پوشان؛ برگرداندن.
- ✅ ۶٫۲ (پایین، «۶٫۲»): نمره و نامزدها روی سفارش‌های نمونه؛ تأیید، رد، دادن دستی و کنار گذاشتن؛ لغوشده و «در صف چاپ»؛ سرتاسری با دو
  چاپخانه و دو کاربر (مثل `scope.spec.ts`): هر کدام فقط سفارش خودش، و سفارش دیگری «پیدا نشد» بی نشت.
- ✅ ۶٫۳ (پایین، «۶٫۳»): یک پیامک برای هر مرسوله، هیچ برای صف و برگشته (شاهد)، دو بار نه؛ صفحهٔ سفارش: کد فقط برای صاحب سفارش، پیوند با
  `noreferrer`؛ `site.spec.ts` همان؛ باندل اولیه همان ۱۰۷٬۶۳۳ بایت.
- ✅ ۶٫۴ (پایین، «۶٫۴»): عددهای گزارش روی سفارش‌ها و مرسوله‌های نمونه (چندبسته‌ای، کنارگذاشته، بی کد، لغوشده، بی چاپخانه)، با مرز نیمه‌شب
  تهران در آخر ماه؛ بازه‌ها با «همان که دیده شد»؛ فقط مالک، متصدی و چاپخانه نه دکمه و نه صفحه.

**بیرون از برش ۶:** وضعیت بسته پس از پست (API پست)؛ حامل دیگر (تیپاکس، پیک محلی)؛ تسویهٔ کرایه با چاپخانه؛ `.xls` واقعی؛ خروجی فایل
گزارش؛ پیامک به چاپخانه (برش ۷)؛ ورود دستی بارکد، مگر با پاسخ سؤال ۶۰.

**دست نمی‌خورد:** تز محصول؛ قیمت و کرایهٔ منجمد (گزارش فقط می‌خواند)؛ باندل اولیهٔ سایت (۱۰۷٬۶۳۳ بایت در ۵ اسکریپت): از سایت فقط
صفحهٔ سفارش (کامپوننت سرور) و جای آداپتور پیامک عوض می‌شود؛ و ایمیج پایهٔ کارگر (فقط کتابخانهٔ استاندارد پایتون).

**کار دستی صاحب پروژه:**
- ~~پیش از ۶٫۱: یک فایل پست واقعی و اینکه فایل پست را کی می‌گیری (سؤال‌های ۵۹ و ۶۰)~~: رسید (۱۴۰۵/۰۷/۰۶).
- پیوند رهگیری با یک بارکد واقعی، روی گوشی خودت: از این محیط tracking.post.ir باز نشد. از ۶٫۱ دکمهٔ «رهگیری در سایت پست» کارت
  «بستهٔ پستی» پنل همان پیوند است.
- از همین حالا، برای برش ۷ (سؤال ۵۵): سه قالب در پنل sms.ir (کد تأیید، پرداخت، رهگیری؛ ADR-047)، و اطلاعات تماس قدم ۵.

#### ۶٫۱: ورود فایل پست (#52، ادغام و مستقر شد)

| جا | کار |
|---|---|
| `packages/db`: `schema.ts`، `0021_shipments.sql` (تولیدی)، `0022_shipments_guards.sql` (دست‌نویس) | `shipment_imports`، `shipment_import_rows`، `shipments` و `jobs.shipment_import_id`؛ ایندکس‌های یکتای جزئی `shipment_imports_one_file`، `shipments_live_barcode` و `shipments_live_row`، و CHECKهای شکل؛ تریگرهای `shipment_imports_guard` (گذار وضعیت، ستون‌های منجمد، پاک‌نشدنی)، معوق `shipment_imports_revert_voids`، `shipment_import_rows_committed` و `_frozen`، `shipments_insert` (فقط از ورود ثبت‌شده، با سطرش، و ورود چاپخانه فقط سفارش همان چاپخانه)، `shipments_frozen`، و معوق `shipments_order_handed` از هر دو سو |
| `packages/db/src/postfile.ts` | آداپتور «پست ایران» (`ShippingCarrier`: سرستون‌ها، ستون‌های لازم، «فعال»، پیوند رهگیری) و تفسیر خالص جدول: `readPostSheet`، `totalsAgree`، `judgeRows` (حکم و دلیل هر سطر)، `judgedFingerprint` و `handedAtOf`؛ fixtureهای ساختگی به شکل فایل واقعی (`postfile.fixtures.ts`) |
| `packages/db/src/shipments.ts`، `admin.ts`، `panel.ts` | ذخیره‌گاه «ارسال»: بارگذاری با کار خواندن و رویداد در یک تراکنش، فهرست، صفحهٔ ورود (پیش‌نمایش یا ثبت‌شده)، «ثبت» زیر قفل با همان حکم‌ها، «دور بینداز» و برگرداندن؛ مجوزهای `shipments.import` (مالک و متصدی) و `shipments.revert` (مالک)؛ مرسوله‌ها در جزئیات سفارش، جست‌وجو با بارکد، و `handedByFile` در خط فهرست سفارش‌ها |
| `packages/text` | `parseJalaliNumeric` («1405/07/12» ← روز تهران) |
| `services/docworker`: `postfile.py`، `shipments.py`، `queue.py`، `retention.py`، `__main__.py` | کار `read_post_file`: فرمت از محتوا (HTML با BOM، `charset`، UTF-8 یا windows-1256؛ CSV با سه جداکننده؛ XLSX با سقف بازشده)، `.xls` واقعی و فایل خراب «خوانده نشد» با کد، نه کار شکست‌خورده؛ پاک کردن فایل پست N روز پس از ورود (پیش‌نویس کهنه، بایت خام و جدول‌ها، متن سطرهای دیگران) در همان دور نگهداری |
| `apps/admin/lib/shipments.ts`، `lib/server/shipments.ts`، `lib/orders.ts`، `lib/events.ts`، `lib/format.ts` | نمای ورودها، کاشی‌ها، گروه‌های سطر و دلیل هر حکم؛ سرویس با `Result`؛ «بستهٔ پستی» و رویدادهای سفارش؛ جست‌وجوی بارکد؛ روز پست بی ساعت (`dayText`)؛ رویدادهای `shipments.*` و چیپ «ارسال» |
| `apps/admin/app/[gate]/(panel)/shipments/…`، `orders/[number]`، `components/…` | زبانهٔ «ارسال» پس از «سفارش‌ها»، صفحهٔ ورود (در حال خواندن، خوانده نشد، پیش‌نمایش، ثبت شد، دور انداخته، برگشت)، صفحهٔ برگرداندن، کارت «بستهٔ پستی»؛ کیت تازهٔ `jy-barcode` (`packages/ui`) |
| `infra/nginx`، `apps/admin/next.config.ts` | سقف بدنهٔ پنل ۳ مگابایت، برای فایل پست تا ۲ مگابایت |
| CI | ایمیج کارگر `docworker.postfile` و `docworker.shipments` را بار می‌کند؛ «پنل، سرتاسری» با `shipments.spec.ts` |

- باندل اولیهٔ سایت همان ۱۰۷٬۶۳۳ بایت؛ ایمیج پایهٔ کارگر عوض نشد (فقط کتابخانهٔ استاندارد پایتون).
- **پس از استقرار، خودکار:** مهاجرت‌های `0021` و `0022` جدول‌ها را می‌سازند، و دادهٔ پایهٔ وب مجوزهای `shipments.import` و
  `shipments.revert` را می‌نشاند. سفارش‌های موجود دست نمی‌خورند؛ پیکربندی تازهٔ Nginx را `deploy-bundle.sh` خودش به کار می‌اندازد
  (`nginx-apply.sh`).
- **کار دستی صاحب پروژه:** با اولین فایل پست واقعی، پیش‌نمایش را پیش از «ثبت» بسنج، و دکمهٔ «رهگیری در سایت پست» را روی گوشی.
- تصمیم‌های اجرا و سنجش‌ها در ADR-045 و ADR-046، «اجرا در ۶٫۱»، و ADR-047 برای کارت و جست‌وجو؛ رابط و فرق‌ها با طرح در `docs/UI.md`،
  «۶٫۱».

#### ۶٫۲: صف تأیید و فایل چاپخانه (#53، ادغام و مستقر شد)

| جا | کار |
|---|---|
| `packages/db`: `schema.ts`، `0023_review_queue.sql` (تولیدی)، `0024_review_queue_guards.sql` (دست‌نویس) | `shipment_import_rows.dismissed_at` و `dismissed_by` با CHECK `shipment_import_rows_dismissed` و ایندکس جزئی `shipment_import_rows_review`؛ بازنویسی `shipment_import_rows_frozen` («هیچ‌کدام» یک بار و فقط سطر در صف، `shipment_import_rows_dismiss`؛ متن «هیچ‌کدام» هم پاک‌شدنی) و `shipments_insert` (`rule` فقط اولین کد سطر قطعی، `review` فقط از صف یا سطری که کدش کنار رفت، `manual` از قطعی، صف یا پیدا نشد) |
| `packages/db/src/candidates.ts` (تازه)، `postfile.ts` | نامزدها، پنج معیار، نمره، «قوی» و انتخاب از پیش، و دروازه‌های «همین است» (لغوشده، پیش از پرداخت، «در صف چاپ» بی چاپخانه یا فایل چاپ)؛ خالص، همان در «ثبت»، صف و زیر قفل. `judgeRows`: سطر بی شماره با نامزد صف تأیید است |
| `packages/db/src/shipments.ts`، `panel.ts`، `admin.ts` | ذخیره‌گاه: صف (قدیمی‌ترین اول، با نامزدها)، یک سطر، سفارش برای دادن دستی، «همین است» و دادن دستی (مرسوله، «تحویل پست شد» و «شروع چاپ» اگر لازم، و رویداد در یک تراکنش، از همان که ادمین دید)، «هیچ‌کدام»، و کنار گذاشتن یک کد (`voidKept`)؛ همه با `PanelScope` و محدودهٔ واردکننده. پیشخوان: شمار صف و تحویل‌های بی کد (`TRACKING_GRACE_WORKDAYS`، `TRACKING_ALERT_DAYS`). مجوز `shipments.review` و `shipments.import` چاپخانه |
| `services/docworker/docworker/retention.py` | متن سطر «هیچ‌کدام» هم پس از روزهای نگهداری پاک می‌شود؛ سطری که کد گرفت هرگز |
| `apps/admin/lib/shipments.ts`، `lib/server/shipments.ts`، `lib/server/orders.ts`، `lib/orders.ts`، `lib/events.ts`، `lib/messages.ts` | کارت صف (چرا، معیارها، نامزدها، دروازه‌ها)، حال امروز هر سطر و کاشی‌ها (`tileTexts`)؛ سرویس با `Result` و فرم‌های سنجیده؛ کرایه برای چاپخانه حذف در خود سرویس (`withoutFares`)؛ هشدار «کد رهگیری ندارد» با روز کاری و تعطیلی‌ها؛ کنار گذاشتن در صفحهٔ سفارش؛ رویدادهای `shipments.approve`، `.assign`، `.dismiss` و `.void` |
| `apps/admin/app/[gate]/(panel)/shipments/review`، `shipments/[id]/rows/[row]`، `shipments/…`، `orders/[number]`، صفحهٔ پیشخوان، `actions.ts`؛ `components/ReviewCard.tsx`، `VoidShipmentForm.tsx`، `ImportRows.tsx` | صف تأیید، صفحهٔ سطر (نامزدها یا دادن دستی دومرحله‌ای)، «به سفارشی بده» از صفحهٔ ورود، «کنار گذاشتن این کد…» (مالک)، فایل پست چاپخانه، و دو هشدار پیشخوان |
| CI | «پنل، سرتاسری» با `review.spec.ts` |

- باندل اولیهٔ سایت همان ۱۰۷٬۶۳۳ بایت در ۵ اسکریپت (سایت دست نخورد)؛ ایمیج پایهٔ کارگر عوض نشد؛ قیمت و کرایهٔ منجمد دست نخوردند.
- **پس از استقرار، خودکار:** مهاجرت‌های `0023` و `0024` ستون‌ها و تریگرها را می‌سازند، و دادهٔ پایهٔ وب مجوز `shipments.review` و
  `shipments.import` چاپخانه را می‌نشاند. ورودهای ثبت‌شدهٔ ۶٫۱ همان می‌مانند: سطر بی شمارهٔ آن‌ها «پیدا نشد» است و با «به سفارشی بده»
  دادنی.
- **کار دستی صاحب پروژه:** با اولین فایل پست واقعی که سطر صف دارد، نامزدها و «همین است» را ببین؛ و کاربر هر چاپخانه‌ای که فایل خودش
  را می‌دهد، از «ادمین‌ها».
- تصمیم‌های اجرا و سنجش‌ها در ADR-046، «اجرا در ۶٫۲»، و ADR-047 برای هشدار؛ رابط و فرق‌ها با طرح در `docs/UI.md`، «۶٫۲». تصمیم‌های کوچکش
  طبق همان PR تأیید شد.

#### ۶٫۳: رهگیری برای مشتری (#54، ادغام و مستقر شد)

| جا | کار |
|---|---|
| `packages/sms` (تازه) | `SmsTransport` و پیامک کنسولی، `loggedSms` (کد و پرداخت، همان ردیف‌ها)، `otpText`، `orderPaidText` و `trackingText` (دو پارامتر)، `smsState` و `SMS_STUCK_MS`، و `deliverQueued` (برداشتن، فرستادن، ثبت نتیجه؛ تا ۴ هم‌زمان) |
| `packages/db`: `schema.ts`، `0025_tracking_sms.sql` (تولیدی)، `0026_tracking_sms_guards.sql` (دست‌نویس) | `sms_messages.params`، `attempts`، `attempted_at`، `sent_at` و CHECKهای هدف و وضعیت؛ `shipments.sms_message_id`؛ تریگرهای `sms_messages_guard` (گذار، زنده، منجمد) و `shipments_sms` (پیامک تازه و به موبایل سفارش، و سؤال ۶۷)، و بازنویسی `shipments_frozen` |
| `packages/db/src/sms.ts`، `shipments.ts`، `panel.ts`، `orders.ts` | ردیف منتظر (`queuedTrackingSms`) در «ثبت» و «همین است» و دادن دستی (`trackingSmsFor`، با ۶۷)، `createSmsOutbox`، `smsBefore` پیش‌نمایش، پیامک هر مرسوله در ورود و جزئیات سفارش، `shipmentSms` و `recordSmsResend`، هشدار `smsFailed`، و کدهای زندهٔ صفحهٔ مشتری (`parcels`) |
| `apps/web`: `lib/server/checkout.ts`، `app/order/[token]/page.tsx`، `app/checkout.css`؛ `packages/contracts` | آداپتور از `@jozveyar/sms`؛ `OrderView.trackingSent` و `details.parcels`؛ گام «کد رهگیری پست» با کد و پیوند پست، جملهٔ غریبه، meta `no-referrer` |
| `apps/admin`: `lib/server/shipments.ts`، `lib/sms.ts`، `lib/orders.ts`، `lib/events.ts`، `context.ts`، `instrumentation.ts`؛ صفحه‌های سفارش، ورود، برگرداندن، پیشخوان، ارسال و صف؛ `components/ResendSmsForm.tsx`، `ImportRows.tsx` | فرستادن بعد از commit، «دوباره بفرست»، ردیف «پیامک»، شمار و یادداشت پیامک در ورود، فهرست پیامک‌گرفته‌ها، هشدار پیشخوان، رویدادها، و برگشت متن‌های پیامک طرح |
| CI | «پنل، سرتاسری» با `sms.spec.ts` (همان مرحله، بی تغییر در گردش کار) |

- باندل اولیهٔ سایت همان ۱۰۷٬۶۳۳ بایت در ۵ اسکریپت؛ ایمیج پایهٔ کارگر عوض نشد؛ قیمت و کرایهٔ منجمد دست نخوردند؛ پیامک کد و پرداخت همان ردیف‌ها.
- **پس از استقرار، خودکار:** مهاجرت‌های `0025` و `0026`. روی سایت زنده سفارشی نیست (مسیر خرید `off`)، پس مرسوله و پیامکی هم نیست؛ لاگ پنل
  می‌گوید «پیامک رهگیری کنسولی، تا برش ۷».
- **کار دستی صاحب پروژه:** قالب رهگیری در sms.ir با دو پارامتر (شمارهٔ سفارش و بارکد)، برای برش ۷.
- تصمیم‌های اجرا و سنجش‌ها در ADR-047، «اجرا در ۶٫۳»؛ رابط و فرق‌ها با طرح در `docs/UI.md`، «۶٫۳». تصمیم‌های کوچکش طبق همان PR تأیید شد.

#### ۶٫۴: گزارش حاشیهٔ ارسال (#55، ادغام و مستقر شد؛ با آن برش ۶ تمام شد)

| جا | کار |
|---|---|
| `packages/contracts`، `packages/db/src/reference.ts` | تنظیم تازهٔ `report.weight_bands` در `SETTING_SCHEMAS` (مرزها به گرم، صعودی، ۱ تا ۱۰۰٬۰۰۰، تا ۸ مرز؛ یا `'tariff'`) و پیش‌فرضش `'tariff'` در `DEFAULT_SETTINGS`؛ دادهٔ پایه می‌نشاندش |
| `packages/db/src/admin.ts` | مجوز `reports.read`، فقط مالک |
| `packages/db/src/report.ts` (تازه) | `ShippingReportStore`، کوئری زنده با محدوده: سفارش‌های «تحویل پست شد» یک بازه با کرایهٔ منجمد و جمع کرایه، مالیات و وزن مرسوله‌های زنده (`bigint`)، کمینه و بیشینهٔ «تحویل پست شد»، شمار هر ماه (`width_bucket`)، و مرزهای وزن کرایهٔ تعرفهٔ فعال؛ و `bandsDecision` («همان که دیده شد» تنظیم بازه‌ها زیر قفل، خالص) |
| `packages/db/src/panel.ts` | `PanelSearch` تازهٔ `untracked`: «تحویل پست شد»های یک بازه بی مرسولهٔ زنده (تصمیم ۱۰۸) |
| `apps/admin/lib/report.ts` (تازه) | منطق خالص: ماه شمسی تهران و مرزش، ماه‌های میان دو لحظه، چیپ‌ها، گرد کردن `bigint` (نیم از صفر دور)، نشانه و درصد، جمع‌ها به تفکیک منطقه و چاپخانه، بازه‌ها و برچسبشان، و سنجش فرم هر فیلد |
| `apps/admin/lib/server/report.ts` (تازه)، `settings.ts`، `orders.ts`، `context.ts` | سرویس گزارش (۴۰۳ پیش از هر خواندن، ماه‌های داده‌دار، منبع بازه‌ها)؛ `saveReportBands` و `resetReportBands` (فقط مالک، زیر قفل، رویداد `settings.update`)؛ فیلتر `?untracked=` فهرست سفارش‌ها |
| `apps/admin/app/[gate]/(panel)/shipments/report`، `components/BandsForm.tsx`، `actions.ts`، `admin.css` | صفحهٔ «گزارش ارسال» طبق `m-ship-report`: چیپ ماه، کاشی‌ها، سه جدول و کارت‌های گوشی، «بازه‌ها را عوض کن» (`?bands=edit`، بی JS) و «برگرداندن به بازه‌های تعرفه» |
| `apps/admin/app/[gate]/(panel)/shipments`، `tariff`، `orders`؛ `components/TariffCards.tsx`، `NoAccess.tsx`؛ `lib/events.ts`، `lib/settings.ts` | دکمهٔ «گزارش ارسال»، پیوند «کرایه‌ای که پست واقعاً گرفت»، یادداشت فیلتر «بی کد رهگیری»، متن «فقط مالک» طرح، رویداد بازه‌ها، و برچسب‌های sms.ir |
| CI | «پنل، سرتاسری» با `report.spec.ts` (همان مرحله، بی تغییر در گردش کار؛ فقط توضیح) |

- باندل اولیهٔ سایت همان ۱۰۷٬۶۳۳ بایت در ۵ اسکریپت؛ سایت و ایمیج پایهٔ کارگر دست نخوردند؛ قیمت، کرایهٔ منجمد و تعرفه دست نخوردند.
- **پس از استقرار، خودکار:** دادهٔ پایهٔ وب مجوز `reports.read` را به مالک و تنظیم `report.weight_bands` را با `'tariff'` می‌نشاند (لاگ وب: «تنظیم‌های
  تازه: report.weight_bands»). مهاجرت تازه‌ای نیست. روی سایت زنده سفارشی نیست (مسیر خرید `off`)، پس گزارش «هنوز سفارشی به پست نرسیده است».
- تصمیم‌های اجرا و سنجش‌ها در ADR-048، «اجرا در ۶٫۴»؛ رابط و فرق‌ها با طرح در `docs/UI.md`، «۶٫۴».

### برش ۷: برنامه و وضعیت

**برنامه تأیید شد** (۱۴۰۵/۰۷/۰۸، سؤال‌های ۱۱۲ تا ۱۲۸ پایین، همه طبق پیشنهاد). پیامک واقعی sms.ir، درگاه زیبال، بازپرداخت، و
باز شدن مسیر خرید روی سایت زنده. رابطش طرح نمونه‌ای است که حالا ساخته و تأیید می‌شود، مثل قدم‌های ۸ و ۹: حالت‌های تازهٔ
`checkout.html` و `admin.html` (`docs/UI.md`، بخش ۱۰). تصمیم‌ها: ADR-049 (پیامک sms.ir، قالب‌ها و سقف هزینه)، ADR-050 (درگاه زیبال:
شروع، برگشت، سنجش و استعلام)، ADR-051 (بازپرداخت) و ADR-052 (روشن کردن `live`: آمادگی، پیش‌نمایش مالک و ترمز). نام‌ها ۷٫۱ تا ۷٫۶.

| PR | دامنه | روی سایت زنده | وضعیت |
|---|---|---|---|
| سند | همین برنامه: ADR-049 تا ۰۵۲، سؤال‌های ۱۱۲ تا ۱۲۸، و ۶٫۴ «ادغام و مستقر شد» (#55) | هیچ | #56؛ برنامه تأیید شد (۱۴۰۵/۰۷/۰۸) |
| طرح | طرح نمونهٔ سایت و پنل برش ۷، بیرون از گیت و پیش از ۷٫۱ (`docs/UI.md`، بخش ۱۰) | هیچ | تأیید شد (۱۴۰۵/۰۷/۰۸، سؤال‌های ۱۲۹ تا ۱۴۳، همه طبق پیشنهاد)؛ با ۷٫۱ به مخزن آمد |
| ۷٫۱ | پیامک sms.ir: آداپتور پشت `SmsTransport` برای کد، پرداخت و رهگیری؛ دو کلید تازهٔ قالب (مهاجرت‌های `0027` و `0028`)؛ کلید با هر استفاده (`readServiceKey`)؛ پیامک پرداخت از صف؛ سقف کد و اعتبار پیامک؛ «آزمایش» کلید و قالب؛ سرور ساختگی sms.ir | مشتری هیچ (مسیر خرید `off`)؛ پنل: کلیدهای قالب، «آزمایش»، کارت اعتبار؛ پیامک رهگیری واقعی فقط با `SMS_PROVIDER=smsir` | ادغام و مستقر شد (#57؛ پایین، «۷٫۱») |
| ۷٫۲ | درگاه زیبال: پکیج مشترک `packages/payments`؛ شروع، برگشت با کلید خود تلاش (سؤال ۱۴۵)، استعلام پیش از `verify`، «پرداخت در حال بررسی است»، استعلام خودکار «پرداخت بی برگشت»؛ محافظ‌های `payments` (مهاجرت‌های `0029` و `0030`)؛ «آزمایش» کد پذیرنده؛ سرور ساختگی زیبال | مشتری هیچ (مسیر خرید `off`)؛ پنل: جزئیات پرداخت، «استعلام از درگاه»، «آزمایش» کد پذیرنده و هشدارهای پیشخوان | ادغام و مستقر شد (#59، و فیکس تست ناپایدار #60؛ «آزمایش» کد پذیرنده روی سایت زنده: «درست · زیبال پذیرفت»؛ پایین، «۷٫۲») |
| ۷٫۳ | بازپرداخت سفارش لغوشده: ثبت دستی کامل، و «از درگاه» فقط با درگاه نمونه (CI)، چون زیبال API بازپرداخت ندارد (۱۴۰۵/۰۷/۱۰)؛ `refunds` و محافظ‌ها (مهاجرت‌های `0031` و `0032`)؛ استعلام خودکار پنل؛ صفحهٔ سفارش مشتری | مشتری هیچ تا سفارشی نیست؛ پنل: کارت «بازپرداخت» در سفارش لغوشده، فقط ثبت دستی | ادغام و مستقر شد (#61؛ پایین، «۷٫۳»). «از درگاه» زیبال و کلید `PAYMENT_API_TOKEN` (سؤال‌های ۱۵۰ و ۱۵۱) لغو شد: زیبال API بازپرداخت ندارد |
| ۷٫۴ | قدم ۵: `/terms`، `/privacy`، `/about` و `/contact`، با پیوند در پاورقی و نقشهٔ سایت؛ «تماس» فقط با اطلاعات تماس واقعی | سه صفحهٔ تازه و پیوندهای پاورقی؛ «تماس» با اطلاعات تماس | ادغام شد (#62؛ پایین، «۷٫۴»)، بی اطلاعات تماس: `/contact` تا رسیدنش ۴۰۴ است و در پاورقی و نقشهٔ سایت نیست |
| ۷٫۵ | روشن کردن `live`: آمادگی زمان اجرا به جای `LIVE_ADAPTERS_READY`، دامنهٔ مسیر خرید از پنل (پیش‌نمایش مالک، همه، متوقف)، برگشت و استعلام در `off` هم، و سرتاسری `live` با دو سرور ساختگی | با `.env` امروز هیچ؛ بعد پیش‌نمایش مالک، بعد همه | ادغام شد (#63؛ پایین، «۷٫۵»)؛ برنامه تأیید شد (۱۴۰۵/۰۷/۱۰، سؤال‌های ۱۶۱ تا ۱۷۱ پایین، همه طبق پیشنهاد). روشن کردن روی سایت زنده کار دستی و با صاحب پروژه |
| ۷٫۶ | پیامک به چاپخانه: موبایل اعلان اختیاری هر چاپخانه، یک پیامک از صف برای هر تخصیص (پرداخت، جابه‌جایی و سپردن پنل)، قالب چهارم `SMS_PARTNER_TEMPLATE` با «آزمایش»، ردیف و «دوباره بفرست» در کارت «چاپخانه»، هشدار پیشخوان، و محافظ‌ها (مهاجرت‌های `0035` و `0036`) | مشتری هیچ؛ پنل: موبایل اعلان در «چاپخانه‌ها»، و پیامک فقط برای چاپخانه‌ای که مالک موبایلش را می‌گذارد | ادغام شد (#66؛ پایین، «۷٫۶»)؛ سؤال‌های ۱۷۲ تا ۱۷۷ پایین، همه طبق پیشنهاد (۱۴۰۵/۰۷/۱۱) |

**وابستگی‌ها:** ۷٫۱ و ۷٫۲ به هم بند نیستند و هر کدام با سرور ساختگی خودش سنجیده می‌شود؛ ۷٫۳ پس از ۷٫۲ (همان پکیج درگاه)، و بازپرداختش روی سایت زنده
دستی است، چون زیبال API بازپرداخت ندارد؛ ۷٫۴ بی اطلاعات تماس ساخته شد و فقط «تماس» به آن بند است؛ ۷٫۵ آخر، پس از همه و کارهای دستی پایین؛ ۷٫۶ پس از ۷٫۵، ولی نه پیش‌نیاز باز شدن مسیر خرید است و نه به آن بند (سؤال ۱۲۶). مسیر خرید سایت زنده تا روشن کردن دستی
پس از ۷٫۵ `off` است، و هیچ PR رفتار امروز مشتری را عوض نمی‌کند، جز صفحه‌های ثابت ۷٫۴.

**سنجیده پیش از برنامه** (هیچ درخواستی به API زیبال یا sms.ir نرفت؛ جزئیات و منبع هر ادعا در ADR-049 و ADR-050):
- صفحه‌های مستند (`help.zibal.ir`، `docs.zibal.ir`، `zibal.ir`، `sms.ir`، `app.sms.ir`) از این محیط باز نشدند: سیاست شبکهٔ محیط بستشان.
- جایش بستهٔ رسمی هر دو خوانده شد، فقط فایل، نه نصب و نه اجرا: زیبال `zibal` ۲٫۰٫۰ (نگه‌دارنده `zibalco`، 2026-08-22؛
  https://www.npmjs.com/package/zibal)؛ sms.ir `smsir-js` ۱٫۳٫۳ («Official sms.ir npm package»، نگه‌دارنده `ipecompany`؛
  https://www.npmjs.com/package/smsir-js) و `smsir-python` ۱٫۰٫۸ از همان مخزن سازمانی (https://pypi.org/project/smsir-python/).
- از آنها: نشانی‌ها و شکل درخواست `request`، `verify` و شروع پرداخت زیبال، کدهای `result` و `status`، کد ۱۱۵ «IP درخواست‌دهنده در پنل کاربری
  ثبت نشده است»، سرآیند `Referer` که صفحهٔ پرداخت زیبال می‌خواهد، و merchant آزمایشی `zibal`؛ نشانی پایه، سرآیند کلید، ارسال با قالب، گزارش
  یک پیامک و اعتبار sms.ir.
- **هنوز باز، منتظر متن مستند رسمی** (بازپرداخت و «Lazy» بسته شد، ۱۴۰۵/۰۷/۱۰: زیبال API بازپرداخت ندارد، و «Lazy» روش پرداخت دیگری است، بیرون از
  برش ۷). پارامترهای برگشت زیبال (نام و معنا)، شکل `inquiry` و ~~«Lazy»~~، ~~API بازپرداخت و شرطش~~، زمان برگشت
  خودکار پول تأییدنشده، اجباری بودن ثبت IP و شرط میزبانی داخل ایران؛ شکل پاسخ و کدهای خطای sms.ir، قاعدهٔ مقدار پارامتر قالب (فاصله، طول)،
  sandbox و محدودیت IP کلید، تماس صوتی، و قیمت هر تکهٔ پیامک و شیوهٔ شمردن تکه. پیشنهادهای وابسته به این‌ها شرطی‌اند و با متن مستند پیش از ادغام قطعی می‌شوند.
- **طول پیامک‌های امروز** (UCS-2: یک تکه تا ۷۰ نویسه، چندتکه ۶۷ در هر تکه؛ با همان `otpText`، `orderPaidText` و `trackingText`، شمارهٔ
  سفارش پنج و شش رقمی و بلندترین روز و ماه): کد تأیید ۴۶ نویسه، یک تکه؛ پرداخت ۹۷ تا ۱۰۶، دو تکه؛ رهگیری ۹۰ تا ۹۱، دو تکه.
- **پیامک هر سفارش:** کد تأیید فقط برای گوشی تازه (همان گوشی تا ۳۰ روز کد نمی‌خواهد، ADR-033)، یک پیامک پرداخت، و یک پیامک رهگیری برای
  هر بسته. سفارش تک‌بسته: گوشی تازه ۵ تکه و گوشی برگشتی ۴ تکه؛ با متن کوتاه سؤال ۱۱۵، ۳ و ۲ تکه. هزینه = شمار تکه × قیمت هر تکه در sms.ir
  (باز).
- **کد امروز:** `settlePayment` درگاه را زیر قفل ردیف پرداخت و سفارش می‌سنجد (ADR-034)؛ `payments` جز CHECKها و `payments_one_success`
  محافظی ندارد، پس مبلغ و وضعیتش با کد عوض‌شدنی است؛ `off` همهٔ مسیرهای خرید را ۴۰۴ می‌کند، `/pay/callback` هم؛ صفحهٔ سفارش
  `no-referrer` دارد و «دوباره پرداخت کن» همان‌جاست؛ و وب و پنل هر دو کل `.env` را دارند (`SECRETS_KEY` هم)، پس `readServiceKey` در هر
  دو خواندنی است.

**سنجیده پس از برنامه** (۱۴۰۵/۰۷/۰۸، پیش از ۷٫۱؛ باز هم هیچ درخواستی به API نرفت؛ منبع هر ادعا در ADR-049 و ADR-050):
- **زیبال:** IP ثبت‌نشده، یا بیرون از ایران، وصل نمی‌شود و IP سرور در تنظیمات درگاه ثبت می‌شود (پاسخ سؤال ۱۱۳؛ سایت از ۱۴۰۵/۰۷/۰۸ کامل
  روی پارس‌پک است و IP آن از ۱۴۰۵/۰۷/۰۹ در پنل زیبال ثبت شده)؛ تراکنشی که تا ۱۵ دقیقه تأیید نشود خودکار برمی‌گردد (مهلت تلاش باید کمتر شود؛ پیشنهاد ۱۰ دقیقه، پرسش در ۷٫۲)؛ Push Transaction
  تأیید را ۵ بار در ۵ دقیقه دوباره می‌فرستد (برگشت تکراری بی کوکی بی‌خطر)؛ نشانی برگشت و Referer با دامنهٔ ثبت‌شده، و `www` فرق دارد (سؤال
  ۱۲۲)؛ API بازپرداخت از کیف پول، کامل یا بخشی، کارمزد ۰٫۱٪ و کمینه ۱٬۵۰۰ تومان، ۵ تا ۳۰ دقیقه (۷٫۳). **تصحیح (صاحب پروژه، ۱۴۰۵/۰۷/۱۰):** زیبال
  API بازپرداخت ندارد، و مستند درگاهش هم ندارد؛ بازپرداخت سفارش لغوشده دستی است.
- **sms.ir:** بسته‌های رسمی `sms-typescript` ۲٫۰٫۳ (npm) و `IPE.SmsIr` ۱٫۲٫۷ (nuget) شکل درخواست و پاسخ را قطعی کردند (سرآیند `X-API-KEY`،
  `{ status, message, data }`، `data { messageId, cost }` و اعتبار عددی، خطا با کد HTTP ۴۰۰، ۴۰۱، ۴۰۳، ۴۲۹ و ۵۰۰)؛ تماس صوتی ندارد (سؤال ۱۱۸ و ۱۰
  بسته)؛ کلید آزمایشی دارد و کلید را می‌شود به IP بست؛ مقدار هر پارامتر حداکثر ۵۰ نویسه و قالب را sms.ir تأیید می‌کند؛ هر تکه ۷۰ نویسهٔ فارسی،
  و ۴۰ ریال سهم دولت روی هر پیامک.
- **هنوز باز:** واحد اعتبار sms.ir، جدول کد `status` بدنه، شکل جای پارامتر در قالب (`#NAME#` نشان داده می‌شود، منتظر مستند)، و فاصله در مقدار
  پارامتر (با پیامک آزمایشی قالب پرداخت دیده می‌شود)؛ فیلدهای `inquiry` زیبال، و نشانی و کلید بازپرداخت. از این‌ها، پیش از ۷٫۲ بسته شد (پایین،
  «وضعیت تازه»): واحد اعتبار، `#NAME#` و فاصله؛ و نشانی و کلید بازپرداخت ۱۴۰۵/۰۷/۱۰: زیبال API بازپرداخت ندارد.

**سنجیده پیش از ۷٫۲** (۱۴۰۵/۰۷/۰۹؛ باز هم هیچ درخواستی به API زیبال نرفت؛ بسته‌های رسمی فقط خوانده شد، بی نصب و بی اجرا؛ منبع هر ادعا در
ADR-050، «سنجیده پیش از ۷٫۲»):
- **برگشت:** GET با `trackId`، `success`، `status` و `orderId` (README بستهٔ رسمی `zibal` ۱٫۰٫۲)؛ هیچ‌کدام باور نمی‌شود (سؤال ۱۴۵).
- **`verify` موفق** فقط `result` ۱۰۰ با `status` ۱ و مبلغ (`zibal` ۲٫۰٫۰)؛ **`inquiry`** هست (README ۲٫۰٫۰)؛ شکل درخواست و پاسخش (`POST /v1/inquiry`
  با `merchant` و `trackId`؛ `status`، `amount`، `orderId`، `refNumber`، `cardNumber`…) فقط از بسته‌های غیررسمی، پس حکم فقط با `status` است
  (سؤال ۱۴۶).
- **برگشت خودکار پول تأییدنشده** پس از ۱۵ دقیقه و «کمتر از نیم ساعت»؛ **Push Transaction** تا ۵ دقیقه، ۵ بار (وبلاگ زیبال)؛ شکل درخواستش
  منتظر مستند، پس برگشت GET و POST هر دو.
- **سقف یک تراکنش** کد ۱۱۳ (نسخهٔ ۱٫۰٫۲: «کمتر از 500,000,000 ریال»؛ ۲٫۰٫۰ عددی ندارد)؛ عدد در کد نمی‌آید (سؤال ۱۴۸).
- **API پلتفرم** (برای ۷٫۳، `zibal-platform` ۱٫۰٫۵): `https://api.zibal.ir/v1/` با `Authorization: Bearer`؛ کد ۷ «IP ارسال‌کننده نامعتبر»؛
  بازپرداخت در بسته نیست.

**وضعیت تازه** (صاحب پروژه، ۱۴۰۵/۰۷/۰۸ و ۰۹):
- سایت از ۱۴۰۵/۰۷/۰۸ کامل روی پارس‌پک است؛ سؤال ۱۱۳ بسته.
- **زیبال:** دامنهٔ `jozveyar.com` (بی `www`) و IP پارس‌پک در پنل زیبال ثبت شد (۱۴۰۵/۰۷/۰۹)؛ نشانی برگشت `https://jozveyar.com/pay/callback`،
  که سرور کلید هر تلاش را به تهش می‌افزاید (سؤال ۱۴۵).
- **sms.ir** (۱۴۰۵/۰۷/۰۹): سه قالب با متن «تنظیمات» (`packages/sms/src/templates.ts`) ساخته و تأیید شد؛ کلید API و شناسهٔ سه قالب در «تنظیمات» وارد و
  «آزمایش» هر چهار پذیرفته شد؛ پیامک آزمایشی عین متن رسید؛ سرور ← sms.ir سنجیده. بسته شد: واحد اعتبار شمار پیامک است (۱٬۵۰۸ یعنی «۱٬۵۰۸
  پیامک»؛ ریالی ۳٬۶۲۰٬۲۰۸)، جای پارامتر `#NAME#` درست است، و فاصله در مقدار پارامتر پذیرفته است («دوشنبه 6 مهر»). فقط جدول کد `status` بدنهٔ
  sms.ir باز است.
- **پیش از ۷٫۳، کار دستی** (سؤال ۱۴۹، پاسخ گرفت ۱۴۰۵/۰۷/۰۹): توکن API زیبال برای بازپرداخت **آری**، و موجودی کیف پول زیبال برای کارمزد
  **آری**؛ مقدار هیچ‌کدام در گفت‌وگو نیامد. دیگر لازم نیست (۱۴۰۵/۰۷/۱۰): زیبال API بازپرداخت ندارد.
- **۷٫۲ مستقر** (#59، و فیکس تست ناپایدار پیشخوان #60): «آزمایش» کد پذیرنده روی سایت زنده: «درست · زیبال پذیرفت».
- **مستند درگاه زیبال** (۱۴۰۵/۰۷/۰۹، صاحب پروژه از پنل زیبال داد؛ OpenAPI بخش IPG، `gateway.zibal.ir`): بازپرداخت در آن نیست، ولی جدول وضعیت
  (۱۵ «تراکنش استرداد شده»، ۱۶ «تراکنش در حال استرداد») و شکل `/v1/inquiry` حالا منبع رسمی دارند؛ پیش‌استعلام ۷٫۳ (سؤال ۱۵۴) روی همین است.
  مستند API پلتفرم یا کیف پول (بازپرداخت) هنوز نرسیده. **بسته شد (صاحب پروژه، ۱۴۰۵/۰۷/۱۰):** زیبال API بازپرداخت ندارد، و مستند درگاه (IPG) هم
  ندارد؛ «از درگاه» زیبال لغو شد و بازپرداخت سفارش لغوشده روی سایت زنده ثبت دستی است.

**جریان پول (پیشنهاد):** «پرداخت» ← سفارش و تلاش پرداخت با مبلغ منجمد ← `request` زیبال ← صفحهٔ پرداخت، با Referer دامنهٔ ما ← برگشت با
شناسهٔ تلاش ← زیر قفل: استعلام، و `verify` فقط برای «پرداخت‌شده، تأییدنشده» با مبلغ و شناسهٔ همان تلاش ← «در صف چاپ» و پیامک پرداخت ←
(لغو ← بازپرداخت). بی پاسخ درگاه: «پرداخت در حال بررسی است»، و استعلام خودکار تا نتیجه.

**سؤال‌ها** (تأیید ۱۴۰۵/۰۷/۰۸، همه طبق پیشنهاد؛ جزئیات در ADR‌ها). مستند رسمی هنوز از این محیط باز نمی‌شود (۱۴۰۵/۰۷/۰۸، دوباره با `https://sms.ir/web-service/` و `https://help.zibal.ir/#docs` که صاحب
پروژه داد)؛ پیشنهادهای شرطی (۱۱۳، ۱۱۵ شکل روز تحویل، ۱۱۸، ۱۱۹ آزمایش کد پذیرنده، ۱۲۰ ترتیب استعلام و `verify`، ۱۲۱ و ۱۲۳) با
متن مستند قطعی می‌شوند: sms.ir پیش از ۷٫۱، زیبال پیش از ۷٫۲.
- **۱۱۲. ترتیب PRها.** پیشنهاد: همان جدول؛ ۷٫۴ هر وقت اطلاعات تماس رسید و حتماً پیش از ۷٫۵. دلیل: هر PR جدا با سرور ساختگی سنجیدنی و
  روی سایت زنده بی‌اثر است؛ `live` PR کوچک آخری است که فقط تکه‌های آماده را کنار هم می‌گذارد، پس برگشتش هم ساده است.
- **۱۱۳. سرور بیرون از ایران** (بسته: سایت از ۱۴۰۵/۰۷/۰۸ کامل روی پارس‌پک است و IP آن در پنل زیبال ثبت شد؛ پیش از ۷٫۱ پاسخ این بود که زیبال IP بیرون از ایران را نمی‌پذیرد، پس انتقال PR جدایی پیش از ۷٫۵ است؛ «سنجیده پس از برنامه» بالا). زیبال IP درخواست‌دهنده را با پنل می‌سنجد (کد ۱۱۵)؛ دسترسی از IP بیرون ایران و شرط میزبانی داخلی سنجیده
  نشد. پیشنهاد: پس از تأیید برنامه، دو کار دستی: از سرور فعلی فقط اتصال TLS به `gateway.zibal.ir` و `api.sms.ir` (بی کلید و بی فراخوانی API)،
  و پرسش از پشتیبانی زیبال که IP سرور بیرون ایران در پنل پذیرفته است یا نه. هر دو آری: ترتیب همان (۷ پیش از ۹). یکی نه: ۷٫۱ تا ۷٫۴ همان‌طور
  ساخته می‌شوند (به سرویس واقعی بند نیستند)، و انتقال به پارس‌پک از برش ۹ جدا و پیش از ۷٫۵ می‌آید؛ واسط داخل ایران فقط برای API نه. دلیل:
  بی این دو `live` کار نمی‌کند؛ و واسط، سرور و رازی تازه است برای چیزی که انتقال خودش حل می‌کند.
- **۱۱۴. پیامک پنل.** پیشنهاد: پنل با `SMS_PROVIDER` (`smsir` واقعی، هر چیز دیگر کنسولی)، جدا از `CHECKOUT_MODE`؛ وب در `live` فقط sms.ir
  و در `mock` فقط کنسولی (ADR-035). دلیل: ترمز مسیر خرید نباید پیامک رهگیری سفارش‌های پرداخت‌شده را خاموش کند، و پنل حالت `mock` ندارد.
- **۱۱۵. متن قالب‌ها.** پیشنهاد: سه قالب با متن و نام پارامتر ثابت در ADR-049، یک منبع برای کد و پنل sms.ir؛ پرداخت و رهگیری کوتاه‌تر تا هر
  کدام یک تکه شود: «جزوه‌یار: سفارش ‹ORDER› پرداخت شد؛ تحویل به پست تا ‹DAY›» و «جزوه‌یار: سفارش ‹ORDER› به پست رسید. کد رهگیری
  ‹BARCODE›» (هر دو ۶۹ تا ۷۰ نویسه، با شمارهٔ سفارش پنج و شش رقمی و بلندترین روز)؛ کد همان امروز. روز تحویل یک پارامتر اگر
  مقدار پارامتر فاصله می‌پذیرد، وگرنه سه (روز هفته، روز، ماه) با همان متن. دلیل: هر سفارش ۵ تکه به ۳ (حدود ۴۰٪ کمتر)؛ نشانی سایت پست در
  صفحهٔ سفارش پیوند دارد، و «کد رهگیری را هم پیامک می‌کنیم» را خود پیامک رهگیری می‌گوید.
- **۱۱۶. پیامک پرداخت، هزینه و گزارش تحویل.** پیشنهاد: پیامک پرداخت مثل رهگیری از صف (ردیف منتظر در همان تراکنش پرداخت، فرستادن بعد از
  commit، «دوباره بفرست» در پنل)؛ هزینهٔ هر پیامک در ستون تازهٔ `sms_messages.cost` اگر پاسخ sms.ir دارد؛ گزارش تحویل در برش ۷ خوانده نمی‌شود
  و فقط شناسهٔ پیامک می‌ماند. دلیل: پیامک پرداختی که امروز نرود فقط لاگ و ردیف «نرفت» است، بی «دوباره بفرست»؛ با صف، شکستش دیده و جبران‌پذیر می‌شود. گزارش تحویل
  «رفت» را از «رسید» جدا می‌کند، ولی کاری جز «دوباره بفرست» ندارد، که هست.
- **۱۱۷. سقف هزینهٔ پیامک** (ADR-047). پیشنهاد: پیامک پرداخت و رهگیری به سفارش پرداخت‌شده بندند و سقف ندارند؛ سقف فقط برای کد تأیید، لایه‌لایه:
  (۱) دروازهٔ جزوه: کد فقط برای مرورگری که سند آماده و زنده روی سرور دارد، همان شرط «ادامه»؛ (۲) هر مرورگر ۵ کد در ساعت، و هر شماره
  همان ۵ در ساعت به‌علاوهٔ ۱۰ در ۲۴ ساعت؛ (۳) ترمز آخر کل سایت: همان ۳۰۰ در ساعت و سقف روزانهٔ تازهٔ `otp.site_daily_limit` (پیش‌فرض
  ۲٬۰۰۰)، با هشدار پیشخوان وقتی پر شد؛ (۴) کارت «اعتبار پیامک» و هشدار اعتبار کم. دلیل: مشتری واقعی همیشه جزوهٔ روی سرور دارد، پس
  دروازهٔ جزوه و سقف هر مرورگر فقط ربات را می‌گیرند و بن‌بست نمی‌سازند؛ بدترین هزینهٔ روزانه = سقف روزانه × قیمت یک تکه؛ و اعتبار تمام‌شده
  خودش بن‌بست همه است.
- **۱۱۸. تماس صوتی** (سؤال ۱۰؛ بسته شد پیش از ۷٫۱: sms.ir تماس صوتی ندارد). پیشنهاد: اگر مستند sms.ir ندارد، سؤال ۱۰ بسته: «پیامک نرسید» همان «ارسال دوباره» و «عوضش کن»؛ اگر دارد، در
  برش ۷ نه، و پس از `live` با شمار «پیامک نرسید». دلیل: دو بستهٔ رسمی sms.ir تماس صوتی ندارند؛ و قالب و هزینهٔ تازه برای مسئله‌ای که هنوز
  دیده نشده.
- **۱۱۹. آزمایش پیش از ذخیره** (سؤال ۲۱). پیشنهاد: هر کلید پیش از کد تازه، با مقدار تازه، از خود سرویس سنجیده می‌شود: کلید API با اعتبار sms.ir
  (بی پیامک)؛ هر قالب با یک پیامک آزمایشی به شماره‌ای که مالک در همان فرم می‌نویسد؛ کد پذیرنده با یک `request` کم‌مبلغ که کسی به صفحه‌اش
  نمی‌رود (کد پذیرنده، نشانی برگشت و IP با هم). «رد شد» ذخیره نمی‌شود؛ «در دسترس نیست» با هشدار ذخیره‌شدنی است. دلیل: کلید اشتباه اینجا
  دیده می‌شود، نه روز باز شدن مسیر خرید؛ و کلید لورفته در قطعی سرویس هم عوض‌شدنی می‌ماند.
- **۱۲۰. زیبال** (ADR-050). پیشنهاد: پکیج مشترک `packages/payments`، آداپتور دست‌نویس با `fetch` (نه بستهٔ `zibal`)؛ `orderId` زیبال «شمارهٔ
  سفارش-۸ نویسهٔ اول شناسهٔ تلاش»، بی موبایل و کد ملی؛ برگشت فقط با شناسهٔ تلاش، و پارامترهای موفق و وضعیت نشانی هرگز؛ استعلام پیش از
  `verify`؛ «در انتظار پرداخت» در انتظار می‌ماند؛ بی پاسخ درگاه «در حال بررسی»؛ استعلام خودکار هر ۲ دقیقه در وب با `SKIP LOCKED`، و
  «استعلام از درگاه» در پنل (`orders.money`). دلیل: `verify` پول را نهایی می‌کند و پیش از آن باید دید همان پول همان تلاش است؛ برگشت زودرس یا
  دست‌ساز نباید پرداخت را بسوزاند، و پاسخ گم‌شده نباید «ناموفق» شود.
- **۱۲۱. مهلت تلاش و پول تأییدنشده** (پیش از ۷٫۱: زیبال تأییدنشده را پس از ۱۵ دقیقه برمی‌گرداند؛ پیشنهاد مهلت ۱۰ دقیقه، پرسش در ۷٫۲). پیشنهاد: مهلت هر تلاش (امروز ۳۰ دقیقه) کمتر از زمان برگشت خودکار پول تأییدنشدهٔ زیبال بماند؛ پس از
  مهلت، و برای پرداخت دوم سفارشی که پرداخت شد، «پرداخت‌شده، تأییدنشده» هرگز `verify` نمی‌شود و هشدار «پول مشتری برمی‌گردد» می‌گیرد تا
  استعلام «ریورس‌شده» (۱۸) بگوید. اگر مستند بگوید زیبال خودکار برنمی‌گرداند، این دو به بازپرداخت ۷٫۳ می‌روند. دلیل: پول مشتری یا سفارش
  می‌سازد یا برمی‌گردد؛ حالت سومی نیست.
- **۱۲۲. Referer صفحهٔ سفارش.** پیشنهاد: متای `referrer` صفحهٔ سفارش از `no-referrer` به `strict-origin`: زیبال فقط `https://jozveyar.com/` را
  می‌بیند و توکن سفارش جایی نمی‌رود؛ پیوند پست همچنان `noreferrer`. دلیل: «دوباره پرداخت کن» همان‌جاست و بی Referer صفحهٔ پرداخت زیبال
  نمی‌پذیردش.
- **۱۲۳. بازپرداخت** (ADR-051). پیشنهاد: `refunds`؛ نسخهٔ اول فقط سفارش لغوشده و کل مبلغ؛ فقط مالک (مجوز تازهٔ `orders.refund`) با کد
  تازه؛ «بازپرداخت از درگاه» اگر زیبال API دارد و شرطش برآوردنی است، وگرنه «ثبت بازپرداخت دستی» با مبلغ، روز و کد پیگیری بانک؛ صفحهٔ مشتری
  «… برگشت داده شد»، بی پیامک؛ لغو پس از بازپرداخت برنمی‌گردد. دلیل: پول جابه‌جا می‌کند (کد تازه، ADR-038)؛ و «برمی‌گردد» امروز قولی بی رد است.
- **۱۲۴. روشن کردن `live`** (ADR-052). پیشنهاد: `.env` توانایی را می‌گوید و پنل مخاطب را: `CHECKOUT_MODE=live` یعنی «می‌شود»، و تنظیم تازهٔ
  `checkout.audience` (فقط مالک): «متوقف»، «پیش‌نمایش مالک» یا «همه». پیش‌نمایش با پیوند یک‌بارهٔ ۱۵ دقیقه‌ای از پنل و کوکی ۲۴ ساعتهٔ
  `jy_preview`؛ «همه» با کد تازه؛ «متوقف» بی کد و همان لحظه. برگشت از درگاه و استعلام در «متوقف» و `off` هم کار می‌کنند. `LIVE_ADAPTERS_READY`
  جایش را به آمادگی زمان اجرا می‌دهد؛ نبودِ هر تکه یعنی `off`، با لاگ و هشدار. دلیل: «اول یک پرداخت واقعی کوچک خودم» بی باز کردن برای همه؛
  ترمزی بی SSH، از گوشی؛ و هیچ پرداختی در راه گم نمی‌شود.
- **۱۲۵. تعطیلی‌های قمری ۱۴۰۶.** پیشنهاد: پیش‌نیاز `live` نباشد؛ مهلتش پیش از ۱۴۰۶/۰۱/۰۱، چون اولین تعطیلی قمری ۱۴۰۶ فهرست ۱۴۰۶/۰۱/۱۴
  است، و هشدار قمری پنل تا تطبیق می‌ماند. دلیل: تطبیق به انتشار تقویم رسمی ۱۴۰۶ بند است، و خطای یک‌روزه فقط مهلت چند سفارش دور همان روز را
  جابه‌جا می‌کند؛ بستن `live` به آن ماه‌ها مسیر خرید را معطل می‌کرد.
- **۱۲۶. پیامک به چاپخانه** (از برش ۵ و ۶). پیشنهاد: در برش ۷ و پس از `live` (۷٫۶): ستون تازهٔ `print_partners.notify_mobile` (اختیاری، از «چاپخانه‌ها»
  با مالک)، و یک پیامک از صف برای هر سفارش تازه‌ای که به آن چاپخانه می‌رسد (تخصیص در پرداخت یا جابه‌جایی)، با قالب چهارم
  (`SMS_PARTNER_TEMPLATE`). بی موبایل، بی پیامک؛ «چاپخانهٔ جزوه‌یار» هم. دلیل: چاپخانهٔ دور تا پیشخوان را باز نکند سفارش را نمی‌بیند؛ ولی پیش‌نیاز
  `live` نیست.
- **۱۲۷. طرح نمونه.** پیشنهاد: پیش از ۷٫۱، بیرون از گیت، با حالت‌های `docs/UI.md` بخش ۱۰؛ سؤال‌های طرح از ۱۲۹. دلیل: مثل قدم‌های ۸ و ۹.
- **۱۲۸. تست و CI.** پیشنهاد: هیچ درخواستی از CI یا محیط توسعه به زیبال یا sms.ir واقعی نمی‌رود: دو سرور ساختگی Node بی وابستگی به شکل همان
  بسته‌ها و مستند (کنار هر آداپتور)، نشانی پایهٔ هر آداپتور از `.env` (`ZIBAL_API_URL`، `SMSIR_API_URL`؛ پیش‌فرض نشانی واقعی)، و دیوار دوم در
  CI: `gateway.zibal.ir` و `api.sms.ir` در `/etc/hosts` به نشانی بی‌پاسخ. درگاه نمونه و مرحلهٔ «مسیر خرید، سرتاسری» (`mock`) همان؛ مرحلهٔ تازهٔ
  «مسیر خرید live، سرتاسری» با دو سرور ساختگی؛ و پس از هر مرحله جست‌وجوی مقدار کلیدهای ساختگی در لاگ‌ها. دلیل: همان دو دیوار مستقل
  ADR-028 و ADR-035: فراموش شدن یک متغیر به سرویس واقعی نمی‌رسد.

**سؤال‌های ۷٫۲** (تأیید ۱۴۰۵/۰۷/۰۹، همه طبق پیشنهاد؛ جزئیات در ADR-050، «اجرا در ۷٫۲»):
- **۱۴۴. مهلت هر تلاش** (همان ۱۲۱): ۱۰ دقیقه از ساختن تلاش؛ پس از آن `verify` هرگز. استعلام خودکار هر دقیقه برای تلاش‌هایی که بیش از ۲ دقیقه از
  ساختنشان گذشته؛ «بی برگشت» پنل همین ۱۰ دقیقه.
- **۱۴۵. کلید نشانی برگشت:** هر تلاش کلید تصادفی ۱۲۸ بیتی خودش (`payments.return_key`)؛ نشانی برگشت `PAYMENT_CALLBACK_URL/<کلید>`؛ برگشت فقط همین
  را می‌خواند، هیچ پارامتر زیبال؛ کلید ناشناس ۴۰۴؛ GET و POST هر دو؛ درگاه نمونه هم.
- **۱۴۶. استعلام پیش از `verify`، فقط با `status`:** −۱ در انتظار؛ ۲ `verify`؛ ۱ موفق بی `verify` دوباره؛ لغو، کارت، بانک و برگشت ناموفق با گروه علت.
  مبلغ و `orderId` هر جا درگاه گفت سنجیده می‌شوند، و همیشه از پاسخ `verify`.
- **۱۴۷. خطایی که وضعیت پرداخت نیست** (۱۰۲ تا ۱۰۴، ۲۰۳، ۱۱۵، شبکه، سقف زمان، ۵xx، پاسخ بدشکل): تلاش را ناموفق نمی‌کند؛ در انتظار تا استعلام بعدی یا
  پایان مهلت، و پیشخوان خطا نشان می‌دهد.
- **۱۴۸. بالاتر از سقف یک پرداخت (۱۱۳):** پیام خودش و «برگرد به جزوه و قیمت»؛ عدد سقف در کد نمی‌آید.
- **۱۴۹. کار دستی پیش از ۷٫۳:** توکن API زیبال و موجودی کیف پول برای کارمزد (فقط آری یا نه؛ مقدار هرگز در گفت‌وگو). پاسخ (۱۴۰۵/۰۷/۰۹): آری و آری.
  دیگر لازم نیست (۱۴۰۵/۰۷/۱۰): زیبال API بازپرداخت ندارد.

**سؤال‌های ۷٫۳** (تأیید ۱۴۰۵/۰۷/۰۹، همه طبق پیشنهاد؛ جزئیات در ADR-051، «اجرا در ۷٫۳»):
- **۱۵۰. جای توکن** (لغو شد، ۱۴۰۵/۰۷/۱۰: زیبال API بازپرداخت ندارد). کلید ششم پنل `PAYMENT_API_TOKEN`، با قواعد کد پذیرنده (مهروموم، مالک با کد
  تازه، ۴ نویسهٔ آخر، «برگرداندن به .env»)؛ فقط پنل می‌خواندش.
- **۱۵۱. «آزمایش» توکن** (لغو شد، ۱۴۰۵/۰۷/۱۰، همراه ۱۵۰). «آزمایش و ذخیره» با استعلام یک بازپرداخت ناموجود («پیدا نشد» یعنی توکن، IP و دسترسی
  درست، بی جابه‌جایی پول)؛ اگر مستند «پیدا نشد» را تعریف نکرده بود، `wallet/balance` یا «بی آزمایش ذخیره کن».
- **۱۵۲. بی مستند:** همین PR ثبت دستی کامل، و «از درگاه» فقط با درگاه نمونه؛ هیچ شکل حدسی. همین ماند (۱۴۰۵/۰۷/۱۰): زیبال API بازپرداخت ندارد، پس
  روی سایت زنده بازپرداخت ثبت دستی است، و کد «از درگاه» درگاه نمونه برای CI می‌ماند.
- **۱۵۳. استعلام «در حال برگشت»:** خودکار در خود پنل هر ۲ دقیقه، `SKIP LOCKED`، تا ۲۴ ساعت؛ و «استعلام از درگاه» برای مالک و متصدی.
- **۱۵۴. بازپرداخت دوم هرگز:** ردیف پیش از درخواست ساخته می‌شود و شناسه‌اش با درخواست می‌رود؛ پاسخی که نیامد «معلوم نیست» می‌ماند و «دوباره» تا
  روشن شدن بسته است؛ پیش از هر درخواست همان پرداخت استعلام می‌شود و ۱۵ یا ۱۶ یعنی درخواست نمی‌رود.
- **۱۵۵. کارمزد در فرم:** ۰٫۱٪، دست‌کم ۱٬۵۰۰ تومان، گرد به بالا تا تومان؛ موجودی کیف پول از پیش خوانده نمی‌شود.
- **۱۵۶. فرم دستی:** عین طرح؛ ستون `reason` برنامه برداشته شد (دلیلش همان دلیل لغو است).
- **۱۵۷. صفحهٔ مشتری:** جزئیات (مبلغ، کارت، زمان، کد پیگیری) فقط برای صاحب سفارش؛ دستی فقط روز، بی ساعت و بی «به کارتت»؛ «برنگشت» همان «برمی‌گردد».
- **۱۵۸. پیشخوان:** «پول سفارش لغوشدهٔ N هنوز برنگشته» از لغو تا بازپرداخت موفق، برای مالک و متصدی؛ «هنوز در حال برگشت» پس از ۲ ساعت.
- **۱۵۹. رویدادها:** `orders.refund` و `orders.refund_inquiry`، زیر چیپ «پرداخت و بازپرداخت».
- **۱۶۰. پرداخت دومِ تأییدشده** («پولی که خودکار برنمی‌گردد» ۷٫۲): بیرون از ۷٫۳؛ همان راه امروز، از پنل زیبال.

**سؤال‌های ۷٫۵** (تأیید ۱۴۰۵/۰۷/۱۰، همه طبق پیشنهاد؛ جزئیات اجرا در ADR-052، «اجرا در ۷٫۵»، با خود ۷٫۵):
- **۱۶۱. آمادگی** (جای `LIVE_ADAPTERS_READY`): `CHECKOUT_MODE=live`، `PAYMENT_PROVIDER=zibal` و `SMS_PROVIDER=smsir`؛ پایگاه داده و `SESSION_SECRET`؛ پنج
  کلید خواندنی و خوش‌شکل (`PAYMENT_MERCHANT_ID`، `SMS_API_KEY` و سه قالب)؛ و نشانی برگشت (۱۶۲). صفحهٔ قوانین (قفل با تست)، اعتبار sms.ir و ۱۱۵ در
  فهرست نیستند. تابع مشترک `checkoutReadiness` در `packages/db` برای وب و پنل، با هر درخواست و بی کش؛ لاگ فقط با عوض شدن حالت.
- **۱۶۲. نشانی برگشت:** دقیقاً `https://jozveyar.com/pay/callback`؛ http روی `127.0.0.1` یا `localhost` فقط برای سرتاسری.
- **۱۶۳. مخاطب فقط برای `live`**؛ `mock` همان امروز.
- **۱۶۴. درگاه‌های وب مستقل از `CHECKOUT_MODE`:** زیبال فقط با `PAYMENT_PROVIDER=zibal`، درگاه نمونه فقط در `mock`؛ برگشت و استعلام خودکار در هر حالت؛
  پیامک پرداخت در `mock` کنسولی، وگرنه با `SMS_PROVIDER`. دلیل: وب ۳۱۰۱ CI (`off`، بی `PAYMENT_PROVIDER`) نباید استعلام خودکار کند، چون
  `payments.spec.ts` تلاش‌های زیبال سه‌دقیقه‌ای می‌نشاند.
- **۱۶۵. «متوقف»:** قیمت، کد، تأیید کد، سفارش تازه و «دوباره پرداخت کن» با ۵۰۳ `checkout_paused` و یادداشت طرح؛ برگشت (GET و POST)، استعلام، صفحهٔ
  سفارش و خروج باز. مخاطب «پیش‌نمایش» بی کوکی همان `off`.
- **۱۶۶. کد ۱۱۵** (سؤال ۱۳۹): همان شرط و پنجرهٔ هشدار پیشخوان، در یک تابع مشترک پایگاه داده؛ `GET /api/checkout` برای مشتری تازه «متوقف»؛ مسیرها بسته
  نمی‌شوند و مخاطب دست نمی‌خورد.
- **۱۶۷. پیوند پیش‌نمایش:** `/preview/<توکن>` صفحه‌ای با دکمه، و مصرف با POST، نه GET؛ یک پیوند باز در هر زمان (پیوند تازه کهنه‌های مصرف‌نشده را
  می‌بندد)؛ ساختن فقط در مخاطب «پیش‌نمایش»، بی کد تازه؛ مبدأ پیوند از `PAYMENT_CALLBACK_URL`؛ «خروج» ردیف را در پایگاه داده هم می‌بندد.
- **۱۶۸. نوار پیش‌نمایش در همهٔ صفحه‌ها:** کوکی نمایشی `jy_pv` (بی `HttpOnly`) کنار `jy_preview` (`HttpOnly`)؛ اسکریپت کوچک درون HTML layout فقط با
  `jy_pv` از `/api/checkout/preview` می‌پرسد و نوار را نشان می‌دهد یا کوکی را پاک می‌کند؛ باندل اولیه بایت‌به‌بایت همان.
- **۱۶۹. نردبان مخاطب:** متوقف ← پیش‌نمایش ← همه؛ هر پلهٔ بالا با کد تازه (متوقف ← پیش‌نمایش هم)، هر پلهٔ پایین بی کد و همان لحظه؛ تا سایت آماده
  نیست مخاطب عوض نمی‌شود؛ رویدادهای `settings.checkout_audience` و `settings.checkout_preview` زیر چیپ «تنظیمات و کلیدها».
- **۱۷۰. مهاجرت‌ها:** `0033` تولیدی (`checkout_previews`) و `0034` دست‌نویس: شکل هش‌ها، عمر ۱۵ دقیقهٔ پیوند و ۲۴ ساعتهٔ کوکی، باز شدن یک بار، فقط پیش
  از انقضا و فقط اگر بسته نشده، ستون‌های منجمد، بستن یک بار، پاک‌نشدنی، و شاخص یکتای جزئی برای یک پیوند باز.
- **۱۷۱. مرحلهٔ تازهٔ CI «مسیر خرید live، سرتاسری»:** پایگاه دادهٔ `jy_live`، وب ۳۱۰۲ با `live`، پنل ۳۲۰۳، sms.ir ساختگی ۳۳۰۱، زیبال ساختگی ۳۴۰۱ و کارگر جدا
  روی همان Garage. spec وب: کد، پرداخت، برگشت، «در حال بررسی»، «دوباره پرداخت کن» با Referer، «متوقف» وسط پرداخت، پیش‌نمایش بی کوکی «به‌زودی» و
  `/terms` ۲۰۰؛ spec پنل: آمادگی، پیوند پیش‌نمایش، «باز برای همه» با کد تازه و «توقف»؛ بعد وب ۳۱۰۲ دوباره با `CHECKOUT_MODE=off` و spec سوم برای برگشت
  و استعلام در `off`؛ و جست‌وجوی کلیدها و توکن پیش‌نمایش در همهٔ لاگ‌ها.
- **بقیهٔ برنامه:** `checkout.audience` در `SETTING_SCHEMAS` و `DEFAULT_SETTINGS`، پیش‌فرض `preview`، بی مهاجرت؛ کارت «مسیر خرید روی سایت» عین طرح، فقط
  مالک، «همان که دیده شد» زیر قفل و رویداد در همان تراکنش؛ سطر وضعیت پیشخوان فقط وقتی `live` خواسته شده؛ خط‌های بالا آمدن طبق ADR-052؛ سندها در همان PR.

**سؤال‌های ۷٫۶** (تأیید ۱۴۰۵/۰۷/۱۱، همه طبق پیشنهاد؛ پایه‌شان ۱۲۶ و ۱۴۳؛ جزئیات اجرا در ADR-049، «اجرا در ۷٫۶»، با خود ۷٫۶):
- **۱۷۲. کجا دیده می‌شود:** ردیف «پیامک سفارش تازه» در کارت «چاپخانه» سفارش، همان شکل ردیف «پیامک پرداخت» («به 0915 123 4567 رفت، شنبه 14:05»، یا
  «نرفت: …» با «دوباره بفرست»)، فقط مالک و متصدی (`orders.assign`)؛ کاربر چاپخانه هرگز. پیشخوان: «پیامک سفارش تازهٔ 10027 به چاپ نور نرفت؛ از کارت
  «چاپخانه» دوباره بفرست.»
- **۱۷۳. جابه‌جایی:** فقط چاپخانهٔ تازه پیامک می‌گیرد؛ قبلی هیچ.
- **۱۷۴. پیامک کهنه:** پیامک سفارشی که جابه‌جا شد، چاپش شروع شد یا لغو شد نمی‌رود و «دوباره بفرست» هم ندارد؛ خود پایگاه داده هم می‌سنجد.
- **۱۷۵. قالب خالی:** چاپخانه موبایل دارد ولی شناسهٔ قالب نه: پیامک ساخته می‌شود و «نرفت» با نام همین قالب، با هشدار پیشخوان، و پس از گذاشتن شناسه
  «دوباره بفرست»؛ فرم چاپخانه زیر موبایل هشدار می‌دهد. کار دستی صاحب پروژه: قالب «جزوه‌یار: سفارش تازه #ORDER#؛ تحویل به پست تا #DAY#» در sms.ir، و
  شناسه‌اش در «تنظیمات» با «آزمایش».
- **۱۷۶. زمان:** همان لحظه، بی ساعت سکوت و بی دسته‌بندی.
- **۱۷۷. شماره:** کامل در فهرست «چاپخانه‌ها» (فقط مالک)، پوشیده در رویدادها («0915 ••• 4567»)؛ ویرایش با همان «همان که دیدی» نام و شهر؛ «دوباره بفرست»
  به شماره‌ای که پیامک با آن ساخته شد، و شمارهٔ تازه فقط برای سفارش‌های بعدی.

**داده و محافظ‌ها** (مهاجرت تازه، هر محافظ با شاهد جهش؛ طرحشان در بخش ۵):
- ✅ `0027` و `0028` (۷٫۱، ساخته شد؛ ADR-049 «اجرا در ۷٫۱»): CHECK `service_secrets_name` با `SMS_PAID_TEMPLATE` و `SMS_TRACKING_TEMPLATE` (و در
  ۷٫۶ `SMS_PARTNER_TEMPLATE`)؛ `sms_messages.cost` (`sms_messages_cost`)؛ کد با پنل واقعی بی متن و پارامتر (`sms_messages_otp_secret`)؛
  `sms_messages_queued` برای پرداخت هم؛ `payments.sms_message_id` با شاخص یکتای `payments_sms` و تریگر `payments_sms`؛ گذار منتظر و در حال
  فرستادن برای پیامک پرداخت هم (`sms_messages_guard`: `_flow`، `_live`، `_frozen`)؛ نمایهٔ `otp_requests_session` برای سقف هر مرورگر. شماره‌ها
  به ترتیب ادغام، پس بقیه یکی جلو رفتند.
- ✅ `0029` و `0030` (۷٫۲، ساخته شد؛ ADR-050 «اجرا در ۷٫۲»): روی `payments`: ستون‌های تازهٔ `return_key` (۱۲۸ بیت، یکتا، CHECK شکل)،
  `gateway_order_id` (یکتا برای هر درگاه؛ برای زیبال اجباری)، `verified_amount_rials`، و آنچه از درگاه دانستیم (`gateway_status`، `gateway_error` با
  CHECK برچسب بی متن، `gateway_checked_at`)، نخستین برگشت مرورگر (`returned_at`) و کسی که بست (`settled_via`: برگشت، خودکار، پنل)؛ CHECK «موفق یعنی
  مبلغ تأییدشده برابر مبلغ» (`payments_success_amount`)؛ و تریگر `payments_guard`: مبلغ در درج برابر `orders.total_rials` (`payments_amount_is_total`)،
  سفارش، درگاه، مبلغ، شناسه‌ها، کلید و زمان ساختن منجمد و نخستین برگشت یک بار (`payments_frozen`)، گذار فقط از در انتظار و نهایی ماندن موفق و
  ناموفق (`payments_flow`)، و آنچه تلاش نهایی را ساخت منجمد. موجودها می‌مانند (`payments_one_success`، `payments_success_has_ref`). موفق‌های پیش
  از ۷٫۲ در همان مهاجرت `verified_amount_rials` برابر مبلغ می‌گیرند.
- ✅ `0031` و `0032` (۷٫۳، ساخته شد؛ ADR-051 «اجرا در ۷٫۳»): `refunds` فقط افزودنی (`refunds_append_only`)؛ فقط برای پرداخت موفق سفارش لغوشده
  (`refunds_cancelled_only`، `refunds_paid_only`)؛ جمع بازپرداخت‌های زنده ≤ مبلغ پرداخت (`refunds_within_payment`)؛ یکی در جریان
  (`refunds_one_pending`)؛ راه درگاه پیش از درخواست و بی پاسخ (`refunds_insert_state`)؛ گذار فقط به نهایی و ستون‌های منجمد (`refunds_flow`،
  `refunds_frozen`)؛ نُه CHECK شکل؛ و سفارشی که بازپرداخت زنده دارد از «لغو شد» برنمی‌گردد (`orders_status_flow`).
- ✅ `0033` تولیدی و `0034` دست‌نویس (۷٫۵، ساخته شد؛ ADR-052 «اجرا در ۷٫۵»؛ سؤال ۱۷۰): `checkout_previews` (پیوند یک‌باره و کوکی پیش‌نمایش، فقط
  هش، مثل `admin_invites`). شکل هش‌ها (`checkout_previews_token_hash`، `checkout_previews_cookie_hash`)؛ عمر دقیق پیوند ۱۵ دقیقه و کوکی ۲۴ ساعت
  (`checkout_previews_link_ttl`، `checkout_previews_cookie_ttl`)؛ زمان باز شدن، هش کوکی و انقضایش با هم (`checkout_previews_opened`)؛ یک پیوند باز در هر
  زمان (شاخص یکتای جزئی `checkout_previews_one_open`)؛ و تریگر `checkout_previews_guard`: پاک‌نشدنی (`_append_only`)، تازه بازنشده و بسته‌نشده
  (`_insert_state`)، شناسه، هش توکن، سازنده، زمان ساختن و انقضای پیوند منجمد (`_frozen`)، یک بار باز شدن (`_open_once`)، فقط پیش از انقضا و بسته شدن (`_open_window`)، و یک
  بار بستن (`_close_once`). هر خطا با نام محدودیت، هر کدام با شاهد جهش روی پایگاه دادهٔ تازه.
  تنظیم `checkout.audience` و سقف‌های تازه با `SETTING_SCHEMAS` و دادهٔ پایه، بی مهاجرت (مثل ۴٫۶). ۷٫۴ مهاجرتی ندارد.
- ✅ `0035` تولیدی و `0036` دست‌نویس (۷٫۶، ساخته شد؛ ADR-049 «اجرا در ۷٫۶»): `print_partners.notify_mobile` (اختیاری، `09…`،
  `print_partners_notify_mobile`)؛ `order_assignments.sms_message_id` با کلید خارجی و شاخص یکتای `order_assignments_sms` (یک پیامک برای هر تخصیص)؛
  `partner_order` در `sms_messages_purpose` و در صف `sms_messages_queued`؛ `SMS_PARTNER_TEMPLATE` در `service_secrets_name`. تریگر تازهٔ
  `order_assignments_partner_sms` (پیش از درج تخصیص): تخصیص به چاپخانه‌ای که موبایل اعلان دارد پیامک تازهٔ خودش را دارد (`partner_order`، به همان
  موبایلی که `FOR SHARE` خوانده شد، منتظر، بی تلاش، با شمارهٔ همین سفارش در پارامتر اول)، و بی موبایل هیچ؛ و `sms_messages_guard` (بازنویسی 0028): گذار
  پیامک چاپخانه مثل پرداخت (`_flow`، `_frozen`)، و «در حال فرستادن» فقط برای تخصیص امروز سفارشی که هنوز «در صف چاپ» همان چاپخانه است
  (`sms_messages_live`). هر خطا با نام محدودیت، هر کدام با شاهد جهش روی پایگاه دادهٔ تازه.
- **یک پرداخت موفق، برگشت تکراری یا هم‌زمان:** همان قفل ردیف پرداخت و سفارش (`settlePayment`) و `payments_one_success`؛ دو برگشت یک تلاش
  پشت‌سرهم و درگاه یک بار؛ برگشت و استعلام خودکار هم همان قفل؛ دو تلاش پرداخت‌شدهٔ یک سفارش: اولی موفق، دومی هرگز `verify` (سؤال ۱۲۱).
- **مبلغ فقط از سرور، قیمت منجمد:** مبلغ درگاه `payments.amount_rials` است که پایگاه داده برابر `orders.total_rials` منجمد می‌خواهد
  (قاعده‌های ۲ و ۶)؛ `verify` مبلغ و شناسهٔ تلاش را با همان می‌سنجد؛ «دوباره پرداخت کن» همان مبلغ.

**امنیت:**
- **برگشت جعلی یا دست‌ساز:** نشانی برگشت فقط کلید خود تلاش را دارد (سؤال ۱۴۵)، نه شناسهٔ زیبال؛ کلیدی که در پایگاه داده نیست ۴۰۴؛ «موفق» فقط از استعلام و `verify`
  سرور به سرور، با مبلغ و شناسهٔ همان تلاش؛ پارامتر «موفق» یا «ناموفق» نشانی هیچ‌وقت خوانده نمی‌شود، پس برگشت زودرس با «ناموفق» پرداخت را
  نمی‌سوزاند (زیبال هنوز «در انتظار» می‌گوید).
- **هر درگاه فقط پرداخت‌های خودش** (`payments.provider`): درگاه نمونه هرگز روی jozveyar.com (ADR-035)، و `live` هرگز با درگاه نمونه.
- **کلیدها فقط مهروموم پنل یا `.env`** (ADR-041)، با هر استفاده؛ مقدار تازهٔ «آزمایش» فقط در حافظهٔ همان درخواست.
- **هیچ مقدار کلید در لاگ، رویداد، خطا یا HTML**، جز ۴ نویسهٔ آخر در «تنظیمات»: آداپتورها سرآیند و بدنهٔ درخواست را لاگ نمی‌کنند؛ خطا فقط
  کد خودش و کد عددی سرویس؛ `payments.raw` فقط پاسخ درگاه (بی کد پذیرنده)؛ کد تأیید و پارامترش در پایگاه داده نه؛ و CI مقدار کلیدهای ساختگی
  را در لاگ وب و پنل می‌جوید (مثل ۴٫۶).
- **پیوند پیش‌نمایش** یک‌باره، ۱۵ دقیقه، و فقط هشش در پایگاه داده؛ کوکی `HttpOnly`، و `Secure` پشت https (`X-Forwarded-Proto` Nginx سایت زنده، مثل `jy_auth`).

**راه‌اندازی مرحله‌ای و ترمز** (ADR-052):
1. ۷٫۱ تا ۷٫۴ مستقر؛ `.env` همان امروز (`off`، `mock`، `console`).
2. کارهای دستی (پایین) و «آزمایش» هر کلید در «تنظیمات».
3. ۷٫۵ مستقر؛ `.env`: `PAYMENT_PROVIDER=zibal`، `SMS_PROVIDER=smsir`، `CHECKOUT_MODE=live`. مخاطب پیش‌فرض «پیش‌نمایش مالک»: مردم همچنان «ثبت سفارش
   آنلاین به‌زودی» می‌بینند.
4. پیش‌نمایش: یک سفارش واقعی کوچک خودت تا پیامک رهگیری (پرداخت، پیامک پرداخت، چاپ، فایل پست، پیامک رهگیری)، و یک سفارش دیگر تا لغو و
   ثبت بازپرداخت دستی (زیبال API بازپرداخت ندارد).
5. «همه» در پنل، با کد تازه. پیشخوان در روزهای اول: «پرداخت بی برگشت»، «مبلغ ناهمخوان»، اعتبار پیامک و سقف کد.
6. **ترمز:** «متوقف» در پنل، همان لحظه و بی SSH؛ `CHECKOUT_MODE=off` در `.env` دیوار دوم. در هر دو، برگشت از درگاه و استعلام پرداخت‌های در راه
   کار می‌کنند.

**سنجش‌ها** (هر محافظ با شاهد جهش، مثل برش ۶):
- ۷٫۱ (✅ ساخته شد؛ ADR-049، «سنجیده در ۷٫۱»): واحد آداپتور روی سرور ساختگی sms.ir (نام پارامترها، قالب هر هدف، خطاها و سقف زمان، کد و کلید نه در
  لاگ و نه در ردیف)؛ سقف‌های کد با ساعت ساختگی و پستگرس (دروازهٔ جزوه، هر مرورگر، روزانه، هم‌زمانی)؛ پیامک پرداخت از صف؛ «آزمایش» (رد ذخیره
  نمی‌شود)؛ سرتاسری پنل با پیامک رهگیری و پرداخت به سرور ساختگی.
- ۷٫۲ (✅ ساخته شد؛ ADR-050، «سنجیده در ۷٫۲»): واحد آداپتور روی سرور ساختگی زیبال (هر `result` و `status`، ۲۰۱، ۲۰۲، ۱۱۵، سقف زمان)؛ پستگرس (هر
  محافظ `0029` و `0030` با نام محدودیت، دو برگشت هم‌زمان، برگشت و استعلام هم‌زمان، دو تلاش پرداخت‌شده)؛ برگشت دست‌ساز «موفق» و برگشت زودرس
  «ناموفق» (شاهد: خواندن پارامتر نشانی)؛ مبلغ یا شناسهٔ ناهمخوان (شاهد: برداشتن سنجش)؛ سرتاسری سایت (`checkout.spec.ts`) و پنل
  (`payments.spec.ts`).
- ۷٫۳ (✅ ساخته شد؛ ADR-051، «سنجیده در ۷٫۳»): پستگرس (هر محافظ `0031` و `0032` با نام محدودیت، دو کلیک هم‌زمان، بازپرداخت و برگرداندن لغو
  هم‌زمان، هر قفل ماشه جدا، پاسخ گم‌شده و استعلام، استعلام خودکار و `SKIP LOCKED`، پیشخوان)؛ واحد سرویس پنل (ترتیب سنجش‌ها پیش از کد تازه)؛ سرتاسری
  پنل و صفحهٔ مشتری با کد تازه (`refunds.spec.ts`)؛ ۶۵ شاهد جهش.
- ۷٫۴ (✅ ساخته شد؛ `docs/UI.md`، «۷٫۴»): `site.spec.ts` (هر صفحه با عنوان، canonical و تصویر اشتراک خودش؛ عددها؛ تماس پنهان؛ پاورقی بی جزوه همان
  زبانه و در حالت سفارش زبانهٔ تازه؛ نقشهٔ سایت؛ هیچ منبع بیرونی جز اینماد و بی اسکرول افقی در ۳۲۰ تا ۱۲۸۰)؛ ترتیب Tab صفحهٔ اصلی و صفحهٔ سفارش با پیوندهای پاورقی
  (`home.spec.ts`، `desk.spec.ts`)؛ واحد (`siteFacts`، `staticPages`، `contact`)؛
  پستگرس (`settingsChangedAt`)؛ ۲۵ شاهد جهش (۲ پستگرس، ۱۴ واحد، ۹ سرتاسری در سه build تولیدی)؛ باندل اولیه ۱۰۷٬۶۳۵ بایت، بایت‌به‌بایت برابر main.
- ۷٫۵ (✅ ساخته شد؛ ADR-052، «سنجیده در ۷٫۵»): مرحلهٔ CI سؤال ۱۷۱، «مسیر خرید live، سرتاسری»، روی `127.0.0.1` با دو سرور ساختگی: وب (۶: پیش‌فرض
  «پیش‌نمایش مالک» و «به‌زودی»، کد با sms.ir و پرداخت با زیبال تا پیامک پرداخت، لغو و «دوباره پرداخت کن» با Referer، «در حال بررسی»، «متوقف» وسط
  پرداخت، و دو پرداخت نیمه‌کاره)، پنل (۶: آمادگی و «چه کم است»، پیوند پیش‌نمایش تا نوار سایت و «خروج»، «باز برای همه» با کد تازه، «توقف»، برگرداندن
  به پیش‌نمایش و صفحهٔ کهنه، رویدادها)، و `off` (۳: همه ۴۰۴، و برگشت و استعلام خودکار همان دو پرداخت)؛ مقدار کلیدها و توکن پیش‌نمایش در هیچ لاگی
  نیست. واحد ۴۰ تازه (خالص؛ سه تست main در جا بازنویسی شد، ADR-052)، پستگرس ۱۸ تازه (۲۰۹)؛ ۷۸ شاهد جهش (۱۲ محافظ و ۶۶ کد) و ۲ سرتاسری؛ باندل اولیه ۱۰۷٬۶۳۳ بایت، چهار اسکریپت بایت‌به‌بایت برابر
  main.
- ۷٫۶ (✅ ساخته شد؛ ADR-049، «سنجیده در ۷٫۶»): سرتاسری پنل `partners.spec.ts` (موبایل اعلان در فرم و فهرست، پیامک فقط به چاپخانهٔ تازه، «نرفت» با
  هشدار پیشخوان و «دوباره بفرست»، جابه‌جاشده و چاپ شروع‌شده بی «دوباره بفرست»، رویدادها با شمارهٔ پوشیده، و ردیف پیامک در گوشی و دسکتاپ) و
  `settings.spec.ts` (کلید ششم)؛ مرحلهٔ «مسیر خرید live» با قالب ۱۰۰۰۰۴ در sms.ir ساختگی: وب (پیامک چاپخانهٔ پیش‌فرض با قالب خالی «نرفت» و پرداخت سر جایش)
  و پنل (همان «نرفت» با نام قالب، هشدار پیشخوان و فرم، و گذاشتن شناسه با پیامک آزمایشی تا «دوباره بفرست»، سؤال ۱۷۵). واحد ۲۱ تازه (۱٬۰۴۴)، پستگرس ۱۰
  تازه (۲۱۹)؛ ۵۲ شاهد جهش (۱۷ محافظ، ۳۴ کد و ۱ رابط)؛ باندل اولیه ۱۰۷٬۶۳۳ بایت، هر پنج اسکریپت بایت‌به‌بایت برابر main.

**بیرون از برش ۷:** (انتقال سرور به ایران پیش از ۷٫۲ انجام شد: پارس‌پک، سؤال ۱۱۳)؛ خواندن گزارش تحویل پیامک (سؤال ۱۱۶)؛ پیامک تبلیغاتی،
فهرست مشترک و ایمیل؛ درگاه دوم یا جابه‌جایی خودکار درگاه؛ «Lazy» زیبال (روش پرداخت دیگری است، ۱۴۰۵/۰۷/۱۰)؛ بازپرداخت از درگاه زیبال (API ندارد)؛
بازپرداخت بخشی؛
تسویه و گزارش مالی زیبال؛ کد تخفیف و پنل کاربری (برش ۸)؛ وضعیت بسته درون صفحه (سؤال ۷۴)؛ تماس صوتی (سؤال ۱۱۸).

**دست نمی‌خورد:** تز محصول؛ قیمت و کرایهٔ منجمد و تعرفه (مبلغ درگاه همان جمع منجمد است)؛ باندل اولیهٔ سایت (۱۰۷٬۶۳۳ بایت در ۵ اسکریپت): مسیر خرید
در تکهٔ جدای خودش می‌ماند، صفحهٔ سفارش و صفحه‌های ثابت کامپوننت سرورند، و مرورگر حالت را همان‌طور از `GET /api/checkout` می‌گیرد؛ ایمیج پایهٔ
کارگر (کارگر دست نمی‌خورد)؛ و درگاه نمونه با مرحلهٔ `mock` CI.

**کار دستی صاحب پروژه:**
- **متن مستند رسمی:** sms.ir پیش از ۷٫۱ و زیبال پیش از ۷٫۲ (یا باز کردن همان پنج دامنه در تنظیمات شبکهٔ محیط: منوی محیط ابری در نوار
  عنوان سشن، Edit، Network access)؛ قیمت هر تکهٔ پیامک از تعرفه یا پنل sms.ir؛ و آنچه زیبال هنگام تأیید درگاه دربارهٔ IP، دامنه یا میزبانی گفت.
- ✅ **پس از ۷٫۱ و پیش از ۷٫۵** (انجام شد، ۱۴۰۵/۰۷/۰۸ و ۰۹): سه قالب در sms.ir با متن «تنظیمات»، تأییدشده؛ شناسهٔ هر کدام و کلید API در «تنظیمات»
  با «آزمایش» و پیامک آزمایشی؛ انتقال به پارس‌پک (سؤال ۱۱۳) و ثبت IP و دامنهٔ سرور در پنل زیبال.
- ✅ **پیش از ۷٫۳:** توکن API زیبال و موجودی کیف پول برای کارمزد (سؤال ۱۴۹: آری و آری).
- ~~**برای «از درگاه» زیبال (PR پس از ۷٫۳)**~~ لغو شد (۱۴۰۵/۰۷/۱۰): زیبال API بازپرداخت ندارد؛ نه مستند لازم است و نه توکن API زیبال. بازپرداخت سفارش
  لغوشده روی سایت زنده «ثبت بازپرداخت دستی» است.
- **مرحلهٔ آخر** (۷٫۴ و ۷٫۵ بی آن ساخته شدند؛ صاحب پروژه، ۱۴۰۵/۰۷/۱۰): ✅ اطلاعات تماس (سؤال ۴) و نام کسب‌وکار، ۱۴۰۵/۰۷/۱۱ (#65؛ پایین،
  «مرحلهٔ آخر»): «تماس» در پاورقی و نقشهٔ سایت آمد. مانده: خواندن و تأیید متن قوانین، حریم خصوصی و دربارهٔ ما (پیش‌نویس از قاعده‌های خود سایت).
- **پس از استقرار ۷٫۵، برای روشن کردن** (با صاحب پروژه): شارژ اعتبار sms.ir؛ `PAYMENT_CALLBACK_URL=https://jozveyar.com/pay/callback` در `.env` (بی کلید؛ سرور کلید هر تلاش را به
  تهش می‌افزاید) و «آزمایش» کد پذیرنده در «تنظیمات»؛ `.env` قدم ۳ بالا؛ پیش‌نمایش و بعد «همه».
- **پس از استقرار ۷٫۶** (سؤال ۱۷۵): قالب «جزوه‌یار: سفارش تازه #ORDER#؛ تحویل به پست تا #DAY#» در sms.ir برای تأیید، و شناسه‌اش در «تنظیمات» با پیامک
  آزمایشی به گوشی خودت؛ بعد موبایل اعلان هر چاپخانه‌ای که پیامک می‌خواهد (چاپخانهٔ پیش‌فرض هم). بی موبایل هیچ پیامکی ساخته نمی‌شود، پس ترتیب قالب و
  موبایل مهم نیست: اگر موبایل پیش از قالب گذاشته شد، پیامک‌های آن فاصله «نرفت» می‌مانند و از کارت «چاپخانه» دوباره فرستاده می‌شوند. پیامک پنل به
  چاپخانه (جابه‌جایی و «انتخاب») همان آداپتور پیامک رهگیری است: پیامک واقعی فقط با `SMS_PROVIDER=smsir` پنل؛ پنل کنسولی ردیفش را «رفت» می‌نویسد و
  چیزی نمی‌فرستد، پس موبایل‌ها پس از sms.ir پنل.
- **تا پایان ۱۴۰۵:** تطبیق تعطیلی‌های قمری ۱۴۰۶ از پنل با انتشار تقویم رسمی (سؤال ۱۲۵).
- **همیشه:** نسخهٔ پشتیبان `.env`.

#### ۷٫۱: پیامک sms.ir (#57، ادغام و مستقر شد)

| جا | کار |
|---|---|
| `packages/sms`: `src/smsir.ts` و `src/templates.ts` (تازه)، `src/index.ts`، `mock/smsir.mjs` (تازه) | آداپتور `smsIrClient` و `smsIrTransport`؛ متن یک منبع (`SMS_TEMPLATES`، `templateText`، `templateSource`، `paramMark`، `smsSegments` و پارامترهای هر هدف)؛ `SmsError` با کد و عدد پاسخ، کد تازهٔ `unconfigured` و `smsErrorTag`؛ `loggedSms` بی متن کد با پنل واقعی؛ `deliverQueued` با هزینه؛ و سرور ساختگی sms.ir با فرمان تست |
| `packages/db`: `schema.ts`، `0027_smsir.sql` (تولیدی)، `0028_smsir_guards.sql` (دست‌نویس) | ستون‌ها، CHECKها، شاخص‌ها و تریگرهای بخش «داده و محافظ‌ها» بالا |
| `packages/db/src`: `orders.ts`، `sms.ts`، `auth.ts`، `secrets.ts`، `panel.ts`، `reference.ts` | `queuedPaidSms` در `settlePayment`؛ برداشتن پیامک پرداخت با شرط زنده، و هزینه با «رفت»؛ `createSmsStats` (شمار کد، نخستین لحظهٔ پر شدن سقف امروز، هزینهٔ هفته)؛ شمار لایه‌ها و دروازهٔ جزوه در `issueOtp`؛ `SecretStore.test` و `lastChecks`، `serviceKeyReader` و پنج نام کلید؛ پیامک پرداخت در جزئیات سفارش، `paymentSms` و هشدار `paidSmsFailed`؛ `OTP_FIXED_LIMITS` و دو تنظیم تازه |
| `packages/contracts` | `otp.site_daily_limit` و `sms.credit_alert_days` در `SETTING_SCHEMAS`؛ خطای `otp_no_documents` |
| `apps/web`: `lib/server/auth.ts`، `checkout.ts`، `checkoutContext.ts`، `checkoutMode.ts`، `instrumentation.ts`؛ `lib/checkout/format.ts`؛ `components/checkout/Checkout.tsx` | سقف لایه‌لایه با لایهٔ هر ۴۲۹، `webSmsTransport`، پیامک پرداخت پس از commit، خط بالا آمدن، `retryWhen`، متن هر لایه زیر فیلد موبایل و «دوباره بینداز» |
| `apps/admin/lib`: `server/settings.ts`، `server/orders.ts`، `server/config.ts`، `server/context.ts`، `server/result.ts`؛ `settings.ts`، `sms.ts`، `orders.ts`، `events.ts`، `messages.ts`؛ `instrumentation.ts` | `testKey`، `setKey` با آزمایش و رسید، `saveNumbers`، `smsAlerts` و کارت اعتبار؛ `resendPaymentSms`؛ آداپتور با `SMS_PROVIDER` و نشانی `SMSIR_API_URL`؛ خط آزمایش، متن قالب، کارت اعتبار و هشدار سقف (خالص)؛ ردیف «پیامک پرداخت»؛ رویدادها و چیپ «پرداخت و بازپرداخت» |
| `apps/admin/app`: «تنظیمات»، پیشخوان، سفارش؛ `actions.ts`؛ `admin.css`؛ `components/`: `KeyForm.tsx`، `TemplateKeyForm.tsx`، `KeyTestForm.tsx`، `OtpLimitsForm.tsx`، `NumberSettingForm.tsx`، `ResendPaymentSmsForm.tsx` | رابط طبق طرح قدم ۱۰ (`docs/UI.md`، «۷٫۱») |
| CI | دیوار `/etc/hosts` برای `api.sms.ir` و دو میزبان زیبال پیش از هر تست؛ sms.ir ساختگی روی ۳۳۰۰ در «پنل، سرتاسری»؛ پنل دوم با `SMS_PROVIDER=smsir` روی ۳۲۰۱ و `smsir.spec.ts`؛ جست‌وجوی کلیدها در لاگ پنل دوم و sms.ir ساختگی هم |
| `docs/ui/mockups/checkout.html`، `admin.html` | طرح تأییدشدهٔ قدم ۱۰ |

- باندل اولیهٔ سایت همان (۱۰۷٬۶۳۱ بایت در ۵ اسکریپت، main روی همان ماشین ۱۰۷٬۶۳۴؛ در یک مسیر build چهار اسکریپت بایت‌به‌بایت همان‌اند و
  runtime webpack فقط هش تکه‌های تنبل را عوض کرد؛ تکهٔ مسیر خرید ۴۲۲ بایت gzip بزرگ‌تر، `docs/UI.md`، «۷٫۱»)؛ ایمیج پایهٔ کارگر عوض نشد؛ قیمت، کرایهٔ منجمد و تعرفه دست نخوردند؛ مسیر خرید سایت زنده همان `off`.
- **پس از استقرار، خودکار:** مهاجرت‌های `0027` و `0028`؛ دادهٔ پایهٔ وب دو تنظیم تازه را می‌نشاند (لاگ وب: «تنظیم‌های تازه: otp.site_daily_limit،
  sms.credit_alert_days»). پنل با `.env` امروز کنسولی می‌ماند (لاگ پنل: «پیامک کنسولی (در sms_messages)؛ SMS_PROVIDER=smsir نیست»)، و فقط «آزمایش»
  کلیدهای sms.ir که مالک می‌زند به خود sms.ir می‌رود.
- تصمیم‌های اجرا و سنجش‌ها در ADR-049، «اجرا در ۷٫۱» و «سنجیده در ۷٫۱»؛ رابط و فرق‌ها با طرح در `docs/UI.md`، «۷٫۱».

#### ۷٫۲: درگاه زیبال (#59، ادغام و مستقر شد؛ فیکس تست ناپایدار #60)

| جا | کار |
|---|---|
| `packages/payments` (تازه): `src/index.ts`، `src/status.ts`، `src/settle.ts`، `src/zibal.ts`، `mock/zibal.mjs` | `PaymentGateway` (`start`، `inquire`، `verify`) و درگاه نمونه (از `apps/web/lib/server/payments.ts`، حالا به زبان وضعیت‌های زیبال)؛ `PaymentError` با برچسب بی متن (`rejected:115`)؛ وضعیت‌ها، علت کارت و پنج گروه علت (`status.ts`)؛ حکم `judge`: استعلام پیش از `verify` (سؤال‌های ۱۴۴ تا ۱۴۷)؛ آداپتور دست‌نویس `zibalClient` و `zibalGateway` (`ZIBAL_API_URL`)؛ و زیبال ساختگی با صفحهٔ پرداخت، Referer، برگشت خودکار پول و فرمان تست |
| `packages/db`: `schema.ts`، `0029_zibal.sql` (تولیدی، با یک UPDATE پیش از CHECK)، `0030_zibal_guards.sql` (دست‌نویس) | ستون‌ها، CHECKها، شاخص‌ها و تریگر بخش «داده و محافظ‌ها» بالا |
| `packages/db/src`: `payments.ts` (تازه)، `orders.ts`، `panel.ts` | `settleWith` (حکم زیر قفل `settle` با درگاه خود همان پرداخت) و `watchHeld` (پاییدن پول تلاش بسته، فقط استعلام)، `isChecking`؛ یافتن تلاش با کلید برگشت یا شناسه و `SKIP LOCKED`، `pendingAttempts`، `heldAttempts`، `recordGatewayCheck`، `recordGatewayRejection` با `GATEWAY_NOT_READY_RESULTS`؛ `PAYMENT_ATTEMPT_TTL_MS` ده دقیقه و `HELD_WATCH_MS` دو ساعت؛ هشدارهای پرداخت پیشخوان و `paymentOf` با محدوده |
| `packages/contracts`: `checkout.ts`؛ `packages/text`: `format.ts` | `lastPayment` با گروه علت، علت کارت و «هنوز پرداخت نشده»، `checking` و `extraPayments`؛ خطاهای `payment_checking`، `gateway_not_ready` و `amount_over_gateway_limit`؛ `formatCardMask` |
| `apps/web`: `lib/server/checkout.ts`، `checkoutContext.ts`، `checkoutMode.ts`، `testing.ts`؛ `instrumentation.ts`؛ `app/pay/callback/[key]/route.ts` (جای `app/pay/callback/route.ts`)، `app/pay/mock/[authority]/page.tsx` | شروع با کلید برگشت و `orderId` تلاش؛ برگشت فقط با کلید، GET و POST؛ `webPayments` (درگاه نمونه در `mock`، زیبال در `live`)؛ استعلام خودکار هر دقیقه (`startAutoInquiry`) و پاییدن پول تلاش بسته تا دو ساعت؛ ۱۱۳ پیام خودش، و ۱۰۲ تا ۱۰۴ و ۱۱۵ «آماده نیست» با رویداد سیستم؛ «در حال بررسی» تلاش تازه را نمی‌گذارد؛ خط بالا آمدن «✓ درگاه وب: …» |
| `apps/web`: `app/order/[token]/page.tsx`، `components/checkout/OrderPay.tsx`، `Checkout.tsx`، `GateActions.tsx`، `components/OrderDesk.tsx`، `lib/checkout/store.ts` و `api.ts`، `app/checkout.css` | رابط طبق طرح قدم ۱۰ (`docs/UI.md`، «۷٫۲»): رفتن به درگاه زیبال، پنج گروه علت، «پرداخت هنوز انجام نشده»، «پرداختت در حال بررسی است» که خودش به‌روز می‌شود، پرداخت دوم، و Referer `strict-origin` |
| `apps/admin/lib`: `server/orders.ts`، `server/settings.ts`، `server/context.ts`، `server/config.ts`، `server/result.ts`؛ `orders.ts`، `settings.ts`، `events.ts`، `messages.ts`؛ `instrumentation.ts` | «استعلام از درگاه» (`inquirePayment`)؛ «آزمایش» کد پذیرنده با `request` ۱٬۰۰۰ تومانی؛ درگاه‌های پنل (زیبال همیشه، نمونه فقط با `CHECKOUT_MODE=mock`) و خط بالا آمدن؛ کارت «پرداخت‌ها» (`paymentView`)، هشدارهای پیشخوان و رویدادها |
| `apps/admin/app` و `components/`: پیشخوان، سفارش، «تنظیمات»، `actions.ts`؛ `InquiryForm.tsx` (تازه)، `KeyForm.tsx`، `KeyTestForm.tsx`، `OrderBadges.tsx` | رابط طبق طرح (`docs/UI.md`، «۷٫۲») |
| CI | زیبال ساختگی روی ۳۴۰۰ در «پنل، سرتاسری» با کد پذیرندهٔ تصادفی (همان `PAYMENT_MERCHANT_ID` پنل)، `ZIBAL_API_URL` و `PAYMENT_CALLBACK_URL`؛ خط بالا آمدن درگاه پنل؛ `payments.spec.ts`؛ کد پذیرنده و لاگ زیبال ساختگی هم در جست‌وجوی کلیدها |

- باندل اولیهٔ سایت همان (`docs/UI.md`، «۷٫۲»)؛ کارگر و ایمیج پایه‌اش عوض نشدند؛ قیمت، کرایهٔ منجمد و تعرفه دست نخوردند؛ مسیر خرید سایت زنده همان
  `off`، و `live` همان بسته تا ۷٫۵ (`LIVE_ADAPTERS_READY`).
- **پس از استقرار، خودکار:** مهاجرت‌های `0029` و `0030` (کلید برگشت تلاش‌های قدیم تصادفی، و موفق‌های قدیم مبلغ تأییدشده برابر مبلغ). وب در `off`
  نه خط درگاه دارد، نه استعلام خودکار، نه هیچ درخواستی به هیچ درگاهی. پنل یک خط تازه دارد: «✓ پنل ادمین: درگاه زیبال (نشانی پیش‌فرض زیبال) برای
  «استعلام از درگاه»؛ PAYMENT_CALLBACK_URL هست». تنها درخواست به زیبال واقعی «آزمایش» کد پذیرنده است، وقتی مالک می‌زند.
- تصمیم‌های اجرا و سنجش‌ها در ADR-050، «اجرا در ۷٫۲» و «سنجیده در ۷٫۲»؛ رابط و فرق‌ها با طرح در `docs/UI.md`، «۷٫۲».

#### ۷٫۳: بازپرداخت سفارش لغوشده (#61، ادغام و مستقر شد)

| جا | کار |
|---|---|
| `packages/payments`: `src/refund.ts` (تازه)، `src/index.ts` | `GatewayRefunds` اختیاری روی `PaymentGateway` (`feeRials`، `request`، `inquire`) و `GatewayRefund` با علت رد (`balance`، `ip`، `token`، `unconfigured`، `not_found`، `other`)؛ `refundFeeRials` (۰٫۱٪، کمینه ۱٬۵۰۰ تومان، گرد به بالا)؛ `isRefundedStatus` (۱۵ و ۱۶)؛ بازپرداخت درگاه نمونه با `MockRefundPlan` در `raw` پرداخت (رد کیف پول، پاسخ گم‌شده، درخواست نرسیده، کند، و «پیش‌تر برگشته» که استعلام پرداخت را ۱۶ می‌کند). زیبال `refunds` ندارد: API بازپرداخت ندارد (۱۴۰۵/۰۷/۱۰)، پس بازپرداختش ثبت دستی است |
| `packages/db`: `schema.ts`، `0031_refunds.sql` (تولیدی)، `0032_refunds_guards.sql` (دست‌نویس)؛ `src/admin.ts` | جدول، CHECKها، شاخص‌ها و تریگرهای بخش «داده و محافظ‌ها» بالا؛ مجوز `orders.refund`، فقط مالک |
| `packages/db/src`: `refunds.ts` (تازه)، `panel.ts`، `orders.ts` | `RefundStore`: `start` زیر قفل سطر سفارش با «همان که دیده شد» و رویداد در همان تراکنش، `record`، `inquire` (زیر قفل ردیف، `SKIP LOCKED`، فقط استعلام‌پذیر)، `autoInquiry` (پس از ۲ دقیقه، تا ۲۴ ساعت، قدیمی‌ترین پرسش اول)، `refundOf` با محدوده؛ `requestRefund`، `inquireRefund` و `inquirePendingRefunds`؛ `refundUnknown` («معلوم نیست») و `refundInquirable` (مهلت ۶۰ ثانیهٔ درخواست در راه)؛ بازپرداخت‌ها با نام ادمین در جزئیات سفارش؛ هشدارهای `unrefunded` و `refunding` پیشخوان؛ و بازپرداخت سفارش مشتری |
| `packages/contracts`: `checkout.ts` | `OrderViewRefund`: «در حال برگشت» با کارت، و «برگشت داده شد» با روز، ساعت (فقط درگاه) و کد پیگیری |
| `apps/admin/lib`: `refunds.ts` (تازه)، `server/orders.ts`، `server/context.ts`، `server/config.ts`، `server/result.ts`، `orders.ts`، `events.ts`، `messages.ts`؛ `instrumentation.ts` | حالت کارت و متن هر رد (خالص)؛ `refundFromGateway` (مجوز، «همان که دیده شد»، درگاه بازپرداخت‌دار، پیش‌استعلام، بعد کد تازه، ردیف، بعد درخواست)، `refundManual` (فرم پیش از کد تازه) و `inquireRefund` (`orders.money`، رویداد `orders.refund_inquiry`)؛ استعلام خودکار هر ۲ دقیقه از `instrumentation` فقط با درگاه بازپرداخت‌دار؛ خط بالا آمدن درگاه پنل («؛ بازپرداخت فقط ثبت دستی» یا «بازپرداخت از درگاه …، با استعلام خودکار»)؛ رویدادهای سفارش و صفحهٔ «رویدادها»؛ `withoutMoney` بازپرداخت‌ها را هم می‌کند |
| `apps/admin/app` و `components/`: سفارش، پیشخوان، `actions.ts`، `admin.css`؛ `RefundForms.tsx` و `RefundInquiryForm.tsx` (تازه)، `CodeField.tsx`، `ReasonForm.tsx` | رابط طبق طرح (`docs/UI.md`، «۷٫۳») |
| `apps/web`: `lib/server/checkout.ts`، `app/order/[token]/page.tsx` | «در حال برگشت» و «برگشت داده شد» در صفحهٔ سفارش لغوشده و برچسب خلاصه؛ کامپوننت سرور |
| CI | پنل اصلی با «؛ بازپرداخت فقط ثبت دستی» در خط درگاه؛ پنل سوم روی ۳۲۰۲ با `CHECKOUT_MODE=mock` (درگاه نمونه با بازپرداخت و استعلام خودکار) و `refunds.spec.ts`، با وب روی ۳۱۰۱؛ لاگش هم در جست‌وجوی کلیدها |

- باندل اولیهٔ سایت همان: ۱۰۷٬۶۳۵ بایت در ۵ اسکریپت، بایت‌به‌بایت برابر main روی همان ماشین و همان مسیر (همان نام و هش هر پنج)؛ کارگر و ایمیج
  پایه‌اش عوض نشدند؛ قیمت، کرایهٔ منجمد و تعرفه دست نخوردند؛ مسیر خرید سایت زنده همان `off`.
- **پس از استقرار، خودکار:** مهاجرت‌های `0031` و `0032`؛ دادهٔ پایهٔ وب مجوز `orders.refund` را به مالک می‌دهد. پنل با `.env` امروز خط درگاهش را با
  «؛ بازپرداخت فقط ثبت دستی» می‌گوید: درگاه نمونه آنجا نیست و زیبال API بازپرداخت ندارد، پس نه استعلام خودکار بازپرداخت هست و نه هیچ درخواست تازه‌ای
  به زیبال. روی سایت زنده سفارشی نیست (مسیر خرید `off`)، پس کارت «بازپرداخت» هم دیده نمی‌شود.
- تصمیم‌های اجرا و سنجش‌ها در ADR-051، «اجرا در ۷٫۳» و «سنجیده در ۷٫۳»؛ رابط و فرق‌ها با طرح در `docs/UI.md`، «۷٫۳».

#### ۷٫۴: صفحه‌های ثابت (#62، ادغام شد)

| جا | کار |
|---|---|
| `apps/web/app`: `terms/page.tsx`، `privacy/page.tsx`، `about/page.tsx`، `contact/page.tsx` و `pages.css` (تازه)؛ `globals.css`، `layout.tsx`، `sitemap.ts` | چهار صفحه، کامپوننت سرور و بی JS، طبق طرح قدم ۵ (یک ستون متن با تیترهای بی شماره، سؤال ۱۴۲)؛ قوانین، حریم خصوصی و دربارهٔ ما ISR ۶۰ ثانیه؛ `/contact` با `notFound()` تا اطلاعات تماس؛ هر صفحه canonical و openGraph خودش، با تصویر اشتراک از layout (`generateMetadata`)؛ نقشهٔ سایت |
| `apps/web/lib`: `staticPages.ts` و `contact.ts` (تازه)؛ `server/siteFacts.ts` (تازه)، `server/uploads.ts`، `server/context.ts`، `server/tariff.ts` | یک منبع برای نشانی و نام صفحه‌ها، پاورقی، نقشهٔ سایت و «به‌روز شده»؛ `CONTACT` خالی تا اطلاعات واقعی؛ عددهای متن از `settings` (`order.sla_days`، `order.files_retention_days` و `file.retention_days`، با همان قاعدهٔ آپلود) با پیش‌فرض در build و بی پایگاه داده، مثل `siteTariff`؛ روزهای دو کوکی از همان ثابت‌هایی که کوکی را می‌گذارند |
| `apps/web/components`: `StaticPage.tsx` (تازه)، `SiteFooter.tsx` | پوستهٔ صفحه؛ پیوندهای پاورقی در دو گروه طرح، در حالت سفارش در زبانهٔ تازه |
| `packages/db/src`: `settings.ts` | `settingsChangedAt`: آخرین `updated_at` چند تنظیم («همان» در «تنظیمات» نمی‌نویسد، پس جلویش نمی‌برد) |
| `apps/web/tests/site.spec.ts`؛ واحد و پستگرس | صفحه‌ها، عددها، تماس پنهان، پاورقی در دو حالت، نقشهٔ سایت، منبع بیرونی و اسکرول افقی؛ `siteFacts`، `staticPages`، `contact`؛ `settingsChangedAt` |
| `apps/web/tests/checkout.spec.ts` | `href` پیوند قوانین در مرور هم سنجیده می‌شود (پیش‌نیاز `live`، ADR-052) |
| `apps/web/tests/home.spec.ts` و `desk.spec.ts` | ترتیب Tab پیوندهای پاورقی را میان سؤال‌ها و نشان اینماد می‌خواهد، نام‌ها از `footerGroups()` |
| `apps/admin/app/[gate]/(panel)/orders/[number]/page.tsx`؛ کامنت‌های `packages/payments/src` و `apps/admin/lib/server` | «هنوز» از راهنمای ثبت دستی زیبال در کارت «بازپرداخت» برداشته شد، و کامنت‌ها دیگر «تا مستند API بازپرداخت» نمی‌گویند: زیبال API بازپرداخت ندارد (۱۴۰۵/۰۷/۱۰) |

- **متن** پیش‌نویس از قاعده‌های خود سایت است (ADR-033، ۰۳۴، ۰۴۴ و ۰۴۹ تا ۰۵۱)، و صاحب پروژه در مرحلهٔ آخر می‌خواندش و عوضش می‌کند (کار دستی بالا). بازپرداخت
  سفارش لغوشده دستی است، پس قوانین برای لغو «به همان کارت» نمی‌گوید؛ فقط پرداخت تأییدنشده خودکار به همان کارت برمی‌گردد.
- **عددها از `settings`:** روز کاری تحویل به پست، روزهای فایل آپلود و روزهای فایل‌های سفارش همان‌اند که سایت و کارگر با آن کار می‌کنند؛ اگر مالک از
  «تنظیمات» عوضشان کند، صفحه حداکثر یک دقیقه بعد همان را می‌گوید، و «به‌روز شده» دیرترینِ روز متن (۱۴۰۵/۰۷/۱۰) و آخرین تغییر همین تنظیم‌هاست.
- **پاورقی:** «دربارهٔ ما» (و «تماس» با اطلاعات تماس) زیر «جزوه‌یار»، و «قوانین و مقررات» و «حریم خصوصی» زیر «قوانین»؛ بی جزوه همان زبانه، و در
  حالت سفارش (صفحهٔ اصلی با جزوه، یا صفحهٔ سفارش) زبانهٔ تازه، با همان `site-idle` و `site-ordering` سربرگ؛ بی JS.
- **شاهدها** (هر کدام تست خودش را انداخت و برگشت، همه همان بار اول): ۲ پستگرس (`settingsChangedAt` با `min`، و بی فیلتر کلید)، ۱۴ واحد، و ۹
  سرتاسری در سه build تولیدی که هر کدام سنجش خودش را انداخت؛ فهرست در `docs/UI.md`، «۷٫۴».
- **باندل اولیهٔ سایت** همان: ۱۰۷٬۶۳۵ بایت در ۵ اسکریپت، بایت‌به‌بایت برابر main روی همان ماشین و همان مسیر (هر پنج با همان نام و sha256). HTML صفحهٔ
  اصلی ۵۳٬۷۷۶ ← ۵۶٬۰۵۰ بایت (gzip ۹٬۶۵۸ ← ۹٬۹۹۹): پیوندهای پاورقی در HTML و در دادهٔ RSC. کارگر و ایمیج پایه‌اش، قیمت، کرایه و تعرفه دست نخوردند؛ مسیر
  خرید سایت زنده همان `off`.
- **پس از استقرار:** سه صفحهٔ تازه و پیوندهای پاورقی؛ `/contact` همچنان ۴۰۴. مهاجرت، کلید و تنظیم تازه‌ای نیست.
- تصمیم‌های اجرا و سنجش‌ها در `docs/UI.md`، «۷٫۴».

#### ۷٫۵: روشن کردن `live` (#63، ادغام شد)

| جا | کار |
|---|---|
| `packages/db`: `schema.ts`، `0033_checkout_previews.sql` (تولیدی)، `0034_checkout_previews_guards.sql` (دست‌نویس) | جدول، CHECKها، شاخص و تریگر بخش «داده و محافظ‌ها» بالا |
| `packages/db/src`: `checkout.ts` (تازه)، `panel.ts`، `reference.ts`، `settings.ts`، `index.ts` | آمادگی (`readinessOf` و `checkoutReadiness`: ده تکه، هر کدام `ok`، `empty`، `other`، `unreadable` یا `malformed`؛ `describeReadiness` و `readinessLogger`، لاگ فقط با عوض شدن حال)؛ مخاطب (`checkoutAudience`، `lastAudienceChange`)؛ پیش‌نمایش (`createCheckoutPreviewStore`: `create` زیر قفل تنظیم‌ها و فقط در «پیش‌نمایش مالک» با رویداد در همان تراکنش، `link`، `open`، `session`، `close`؛ `newPreviewToken`، `previewHash`)؛ `gatewayRejection` که هشدار پیشخوان هم از آن می‌خواند؛ `checkout.audience` در دادهٔ پایه |
| `packages/contracts`: `settings.ts`، `checkout.ts` | `checkout.audience` در `SETTING_SCHEMAS` (`paused`، `preview`، `everyone`)؛ حالت `paused` در `GET /api/checkout`، خطای `checkout_paused`، و `CheckoutPreviewStatus` |
| `apps/web/lib/server`: `checkoutMode.ts`، `checkoutContext.ts`؛ `instrumentation.ts` | `accessOf` (`off`، `paused`، `open` با `preview`)؛ `webGatewayNames`، `startGatewayOf`، `webSmsProvider`، `describeSms` و `describePayments`؛ `withCheckout` (۴۰۴، یا ۵۰۳ `checkout_paused` مگر `whenPaused: 'run'`) و `withPayments` (همیشه، فقط پایگاه داده)؛ استعلام خودکار در هر حالت با درگاه‌هایی که هست؛ کوکی‌های پیش‌نمایش؛ خط آمادگی پس از مهاجرت |
| `apps/web/app`: `preview/[token]/page.tsx` و `api/checkout/preview/route.ts` (تازه)؛ `api/checkout/route.ts`، `api/checkout/auth/route.ts`، `pay/callback/[key]/route.ts`، `pay/mock/[authority]/page.tsx`، `order/[token]/page.tsx`، `layout.tsx`، `checkout.css`؛ `lib/previewBar.ts` (تازه) | صفحهٔ پیوند (GET بی مصرف) و باز شدن با POST، وضعیت نوار با GET و «خروج» با DELETE؛ `GET /api/checkout` با `paused`؛ برگشت با `withPayments`؛ خروج در «متوقف» هم؛ «دوباره پرداخت کن» با درگاه همین حالت؛ نوار پیش‌نمایش با اسکریپت درون layout |
| `apps/web/components`: `checkout/Checkout.tsx`، `checkout/OrderPay.tsx`، `OrderSummary.tsx`، `OrderDesk.tsx`، `Restore.tsx` | «ثبت سفارش موقتاً متوقف است» جای «ادامه» («متوقف» در نوار موبایل)، و یادداشت کارت وسط مسیر در هر قدم و در «دوباره پرداخت کن» |
| `apps/admin/lib`: `checkout.ts` (تازه)، `server/settings.ts`، `server/config.ts`، `server/context.ts`، `server/result.ts`، `events.ts`، `messages.ts`؛ `instrumentation.ts` | نام مخاطب‌ها، فهرست آمادگی، «چه کم است»، «از امروز…»، حالت کارت و سطر پیشخوان (خالص)؛ `overview` با کارت، `checkoutCard`، `checkoutStatus`، `changeAudience` (مجوز، آمادگی، «همان که دیده شد» و جهت فرم پیش از کد، کد تازه فقط برای پلهٔ بالا، و زیر قفل دوباره) و `createPreview`؛ خط بالا آمدن پنل فقط با `live`؛ متن رویدادها؛ پیام‌های تازه |
| `apps/admin/app` و `components/`: «تنظیمات»، `settings/checkout/page.tsx` (تازه)، پیشخوان، `actions.ts`، `admin.css`؛ `CheckoutCard.tsx`، `CheckoutActions.tsx` و `RaiseAudienceForm.tsx` (تازه) | رابط طبق طرح (`docs/UI.md`، «۷٫۵») |
| CI و تست‌ها | مرحلهٔ «مسیر خرید live، سرتاسری» (CLAUDE.md، «تست سرتاسری»)؛ `apps/web/tests/live.spec.ts` و `live-off.spec.ts`، `apps/admin/tests/live.spec.ts`؛ واحد (`checkout.test.ts` پایگاه داده و پنل، `checkoutMode`، `checkoutContext`، `previewBar`، سرویس «تنظیمات») و پستگرس (۱۸) |

- **آمادگی و مخاطب** در هر درخواست خوانده می‌شوند، بی کش، تا «توقف» همان لحظه اثر کند؛ لاگ آمادگی فقط با عوض شدن حال، هر نود جدا.
- **باندل اولیهٔ سایت** همان: ۱۰۷٬۶۳۳ بایت در ۵ اسکریپت (main روی همان ماشین و همان مسیر ۱۰۷٬۶۳۵)؛ چهار اسکریپت بایت‌به‌بایت همان، و runtime webpack
  (همان ۳٬۵۴۳ بایت خام) فقط هش تکه‌های تنبل را عوض کرد. HTML صفحهٔ اصلی ۵۶٬۰۵۰ ← ۵۹٬۱۴۵ بایت (gzip ۱۰٬۰۰۰ ← ۱۰٬۹۳۹): اسکریپت نوار پیش‌نمایش (۱٬۴۳۹
  بایت) در HTML و در دادهٔ RSC. کارگر و ایمیج پایه‌اش، قیمت، کرایهٔ منجمد و تعرفه دست نخوردند.
- **پس از استقرار، خودکار:** مهاجرت‌های `0033` و `0034`؛ دادهٔ پایهٔ وب `checkout.audience` را با «پیش‌نمایش مالک» می‌نشاند (لاگ: «تنظیم‌های تازه:
  checkout.audience»). با `.env` امروز سایت زنده (`off`، `PAYMENT_PROVIDER=mock`، `SMS_PROVIDER=console`) رفتار مشتری همان است: «✓ مسیر خرید: off (ثبت
  سفارش آنلاین به‌زودی)»، بی خط درگاه، بی استعلام خودکار و بی هیچ درخواستی به درگاه یا sms.ir. پنل خط مسیر خرید و سطر پیشخوان ندارد (`live` خواسته
  نشده)؛ «تنظیمات» کارت «مسیر خرید روی سایت» را «خاموش» نشان می‌دهد، با فهرست آمادگی همین `.env` و «مسیر خرید واقعی فقط با `CHECKOUT_MODE=live` در
  `.env` سرور روشن می‌شود»: همان فهرستی که روشن کردن (کار دستی بالا) کامل می‌کند.
- **پس از ادغام:** اجرای main ساعت ۰۰:۰۹ تهران `smsir.spec.ts` (۷٫۱) را انداخت: پیامک پرداختی که تست ده دقیقه پیش می‌نشاند «دیروز 23:59»
  بود و تست «امروز» می‌خواست. نگهبان نیمه‌شب ده spec پنل هم صبری داشت که در هفت‌تایش از سقف زمان همان `beforeAll` بیشتر بود. هر دو در این
  PR (CLAUDE.md، «تست سرتاسری»)؛ کد سایت و پنل دست نخورد.
- تصمیم‌های اجرا و سنجش‌ها در ADR-052، «اجرا در ۷٫۵» و «سنجیده در ۷٫۵»؛ رابط و فرق‌ها با طرح در `docs/UI.md`، «۷٫۵».

#### مرحلهٔ آخر: اطلاعات تماس (#65، ادغام و مستقر شد)

- **از صاحب پروژه** (۱۴۰۵/۰۷/۱۱): ایمیل، ساعت پاسخ‌گویی و نشانی؛ تلفن و موبایل فعلاً نه، و کد پستی ندارد. نام کسب‌وکار همان جزوه‌یار است، و روزهای
  پاسخ‌گویی همان روز کاری سایت (شنبه تا چهارشنبه، جز تعطیلی رسمی).
- **پرونده‌ها:** `apps/web/lib/contact.ts` (`CONTACT` پر، و `contactLead`)، `app/contact/page.tsx` (زیرعنوان از `contactLead`)، `app/about/page.tsx`
  (بخش «نشانی» از همان `CONTACT`، با پیوند «تماس»؛ بی نشانی نمی‌آید)، `app/globals.css` (پیوند پاورقی دست‌کم ۴۴ پیکسل پهنا هم)، و تست‌ها
  (`lib/contact.test.ts`، `tests/site.spec.ts`). صفحهٔ تماس، پاورقی و نقشهٔ سایت از ۷٫۴ آماده بودند و با `CONTACT` خودشان آمدند.
- **سنجیده:** واحد ۱٬۰۲۳ گذشت و ۲۱۵ رد شد (پایگاه داده یا استوریج می‌خواهند)، یکی تازه. سرتاسری مرورگر سایت روی build تولیدی و بی پایگاه داده، مثل
  مرحلهٔ CI: ۱۴۴ گذشت و ۴۵ رد شد (main ۱۳۹). پنج تازه: صفحهٔ «تماس» (۲۰۰، عنوان، canonical، تصویر اشتراک)، نشانی «دربارهٔ ما»، و «تماس» در ۳۲۰، ۳۹۰
  و ۱۲۸۰ بی اسکرول افقی و بی منبع بیرونی. تست «تماس فقط با اطلاعات واقعی» حالا شاخهٔ ۲۰۰ را می‌سنجد (پیوند پاورقی، نقشهٔ سایت، هر مقدار، زیرعنوان،
  ردیف‌ها به ترتیب طرح و پیوند هر راه)؛ شاخهٔ ۴۰۴ در واحد می‌ماند (`footerGroups(null)` و `sitemapPages(null)`). اجرای اول همین سرتاسری پنج تست هدف لمسی
  را انداخت (پیوند پاورقی «تماس» ۳۷ پیکسل پهنا)، که کمینهٔ پهنا رفعش کرد.
- **شاهدها: ۸، همه افتادند: ۳ واحد (زیرعنوان بی شاخهٔ ایمیل، زیرعنوان بی تلفن ثابت، و ایمیل نمونه در `CONTACT` که نگهبان ۷٫۴ حالا واقعاً می‌سنجدش) و ۵
  سرتاسری روی build تولیدی (زیرعنوان ثابت طرح، «دربارهٔ ما» بی نشانی، پیوند ایمیل بی نشانی، ردیف‌های وارونه، و پیوند پاورقی بی کمینهٔ پهنا که همان اجرای
  اول بود).**
- **باندل اولیهٔ سایت** همان: ۱۰۷٬۶۳۳ بایت در ۵ اسکریپت، بایت‌به‌بایت برابر main روی همان ماشین و همان مسیر. HTML صفحهٔ اصلی ۵۹٬۱۴۵ ← ۵۹٬۶۰۹ بایت
  (gzip ۱۰٬۹۴۶ ← ۱۱٬۰۰۶): پیوند «تماس» پاورقی در HTML و در دادهٔ RSC.
- **پس از استقرار:** «تماس» در پاورقی همهٔ صفحه‌ها و در نقشهٔ سایت، و نشانی در «دربارهٔ ما». بی مهاجرت؛ مسیر خرید همان (`CHECKOUT_MODE=off`).
- **بمب زمانی در تست پایگاه داده** (کامیت جدا، فقط تست؛ کد سرور دست نخورد): CI همین PR افتاد، نه از تغییرش. چهار تست
  `packages/db/src/integration.test.ts` بخشی از صحنه را با `now()` پایگاه داده می‌ساختند و بقیه را با زمان ثابت طرح («حالا»: دوشنبه 13 مهر 1405، 11:20
  تهران)، پس با رسیدن ساعت واقعی به آن زمان‌ها بی هیچ تغییری افتادند؛ main هم همین را دارد و آخرین اجرای سبزش پیش از مرز اول بود. مرز هر کدام
  سنجیده شد، با ساعت Node و پستگرس روی libfaketime، حدود پانزده دقیقه پیش و پس از هر مرز: جزئیات سفارش در پنل (۴٫۲؛ «ساخته شد» پس از «پرداخت شد») از
  11 مهر 14:05، «بی برگشت» پیشخوان (۵٫۳؛ تلاش تازه‌تر از مرزش) از 13 مهر 10:50، تغییر وضعیت (۴٫۳؛ «ساخته شد» میان تغییرهای ادمین) از 13 مهر 11:20،
  و «فعال شدن‌ها»ی تعرفه (۴٫۵؛ تعرفهٔ پایه پس از فعال کردن‌های پنل) از 13 مهر 11:21. رفع در خود صحنه، فقط همان یک زمان: رویداد ساختن سفارش با
  زمان صحنه (`placedAt`، با شرط «دقیقاً یک ردیف»)، تلاش بی برگشت با `createdAt` صریح (مثل `attempt` برش ۴٫۲)، و تعرفهٔ پایهٔ همان تست با زمان فعال
  شدن صحنه (تریگر 0013 فقط وقتی زمان می‌گذارد که کسی ننوشته باشد؛ زمان‌گذاری خود تریگر را تست «تغییرناپذیر» می‌سنجد). **سنجیده:** کل `pnpm test`
  با پستگرس روی نه ساعت، امروز و ۲، ۵، ۸، ۲۰، ۳۰، ۵۰، ۱۲۰ و ۳۶۵ روز بعد: پیش از رفع امروز ۱ و از ۲ روز بعد ۴ افتاد؛ پس از رفع همه گذشت (۱٬۲۳۲ گذشت
  و ۶ رد شد، هر نه بار). **شاهدها: ۸، همه افتادند**، با ساعت دو روز بعد، پس از هر چهار مرز: ۳ کد (رویدادهای جزئیات وارونهٔ زمان، مرز «بی برگشت» یک ساعت
  دیرتر، «فعال شدن‌ها» بی ترتیب) و ۵ صحنه (بی زمان ساختن در ۴٫۲ و در ۴٫۳، `placedAt` بی ردیف، تلاش پس از مرز «بی برگشت»، و تعرفهٔ پایه با زمان تریگر).

#### ۷٫۶: پیامک به چاپخانه (#66، ادغام شد)

| جا | کار |
|---|---|
| `packages/db`: `schema.ts`، `0035_partner_sms.sql` (تولیدی)، `0036_partner_sms_guards.sql` (دست‌نویس) | ستون‌ها، CHECKها، شاخص و تریگرهای بخش «داده و محافظ‌ها» بالا |
| `packages/db/src`: `assignment.ts`، `sms.ts`، `orders.ts`، `panel.ts`، `partners.ts`، `secrets.ts`، `checkout.ts`، `admin.ts` | پیامک «منتظر» در همان تراکنش تخصیص (`partnerSmsOf`، `queuedPartnerSms`) و `partnerSmsId` در نتیجهٔ `settlePayment`؛ زنده بودن پیامک از صف یک شرط با تریگر (`liveSms`)؛ جابه‌جایی با `smsId`، `assignmentSms`، پیامک هر تخصیص در جزئیات، و هشدار `partnerSmsFailed` (فقط بیرون از محدودهٔ چاپخانه)؛ موبایل اعلان در ذخیره‌گاه چاپخانه با «همان که دیدی»؛ کلید ششم؛ آمادگی `live` بی قالب چاپخانه (`READINESS_KEYS`)؛ مجوز `orders.assign` برای دیدن و «دوباره بفرست» |
| `packages/sms`: `templates.ts`، `index.ts` | قالب `partner_order` با همان دو پارامتر پرداخت (`partnerOrderText`، `partnerParams`)، یک‌منبع با «تنظیمات» |
| `apps/web/lib/server`: `checkout.ts`، `testing.ts` | پیامک پرداخت و پیامک چاپخانه هر دو بعد از commit، در برگشت و استعلام خودکار؛ ذخیره‌گاه حافظه‌ای با همان قاعدهٔ زنده بودن |
| `apps/admin/lib`: `partners.ts`، `sms.ts`، `settings.ts`، `orders.ts`، `events.ts`، `format.ts`، `messages.ts`؛ `server/partners.ts`، `server/orders.ts`، `server/settings.ts`، `server/result.ts` | `partnerMobileOf` و خط فهرست؛ `partnerSmsView` با علت «قالب پیامک چاپخانه»؛ کلید ششم و نمونهٔ «آزمایش»؛ `withoutPartnerSms`؛ رویدادها با شمارهٔ پوشیده؛ `resendPartnerSms`، فرستادن پس از جابه‌جایی و «استعلام از درگاه»، و گیت جزئیات و پیشخوان؛ `partnerTemplateMissing` |
| `apps/admin/app` و `components/`: سفارش، پیشخوان، «چاپخانه‌ها» (فهرست، افزودن، ویرایش)، `actions.ts`؛ `PartnerForm.tsx`، `ResendPartnerSmsForm.tsx` (تازه)، `TemplateKeyForm.tsx` | رابط طبق طرح (`docs/UI.md`، «۷٫۶») |
| CI و تست‌ها | sms.ir ساختگی مرحلهٔ «مسیر خرید live، سرتاسری» با قالب ۱۰۰۰۰۴ (`SMS_PARTNER_TEMPLATE` عمداً نه در `.env` آن)؛ `partners.spec.ts`، `settings.spec.ts`، وب و پنل `live.spec.ts`، و `assignAtPayment` تست (`helpers.ts`)؛ واحد و پستگرس |

- **یک شرط، سه جا:** «زنده بودن» پیامک چاپخانه (تخصیص امروز سفارشی که هنوز «در صف چاپ» همان چاپخانه است) در تریگر `sms_messages_guard`
  (`sms_messages_live`)، در صف (`liveSms` در `packages/db/src/sms.ts`) و در هشدار پیشخوان یکی است. پس از commit «آخرین تخصیص» و «چاپخانهٔ امروز»
  یکی‌اند (`order_assignments_recorded`، معوق)، پس نیمهٔ دوم فقط در میانهٔ تراکنش جابه‌جایی دیده می‌شود، و تستش هم همان‌جاست.
- **باندل اولیهٔ سایت** همان: ۱۰۷٬۶۳۳ بایت در ۵ اسکریپت، هر پنج با همان نام و sha256 build main روی همان ماشین و همان مسیر؛ HTML صفحهٔ اصلی همان
  ۵۹٬۶۰۹ بایت. کارگر و ایمیج پایه‌اش، قیمت، کرایهٔ منجمد و تعرفه دست نخوردند.
- **پس از استقرار، خودکار:** مهاجرت‌های `0035` و `0036`: دو ستون تازه، هر دو خالی (`notify_mobile` و `sms_message_id`)، و تریگر تخصیص فقط برای ردیف
  تازه؛ پس تا موبایل اعلانی گذاشته نشود هیچ پیامکی ساخته نمی‌شود و سایت و پنل همان‌اند، مسیر خرید هم (`CHECKOUT_MODE=off`). «تنظیمات» کلید ششم را
  خالی نشان می‌دهد و آمادگی `live` همان می‌ماند. با پنل کنسولی (`SMS_PROVIDER=console`، خط پنل «پیامک کنسولی») پیامک چاپخانه هم مثل پیامک رهگیری فقط
  ردیف و خط لاگ است و کارت «رفت» می‌گوید؛ پیامک واقعی پنل با `SMS_PROVIDER=smsir`. کار دستی صاحب پروژه بالا، «پس از استقرار ۷٫۶».
- تصمیم‌های اجرا و سنجش‌ها در ADR-049، «اجرا در ۷٫۶» و «سنجیده در ۷٫۶»؛ رابط و فرق‌ها با طرح در `docs/UI.md`، «۷٫۶».

### برش ۸ تا ۱۲: نقشهٔ راه خواسته‌های ۱۴۰۵/۰۷/۲۱ (برنامه تأیید شد)

**برنامه تأیید شد** (۱۴۰۵/۰۷/۲۱، سؤال‌های ۱۷۸ تا ۲۱۴ پایین، همه طبق پیشنهاد؛ ADR-053). پنج پرسش بازش هر کدام پیش از PR خودش پاسخ می‌خواهد: معنی «کاور» (۱۸۵، پیش از ۸٫۳؛ **بسته شد** ۱۴۰۵/۰۷/۲۲: یک صحافی است که صاحب پروژه از پنل می‌افزاید)، روش‌های ارسال (۱۹۱، پیش از ۸٫۵؛ **بسته شد** ۱۴۰۵/۰۷/۲۶: فقط پست پیشتاز، پس ۸٫۵ نیست)، شیوهٔ حساب با چاپخانه‌ها (۲۰۳، پیش از ۱۰٫۳؛ **بسته شد** ۱۴۰۵/۰۷/۲۶: درصدی از سفارش)، موجودی همهٔ چاپخانه‌ها یا یکی (۲۰۴، پیش از ۱۰٫۴؛ **بسته شد** ۱۴۰۵/۰۷/۲۸: همهٔ چاپخانه‌ها)، و «بنر» تصویر یا نوار (۲۰۶، پیش از ۱۱٫۲؛ **بسته شد** ۱۴۰۵/۰۷/۲۶: تصویر). صاحب پروژه در ۱۴۰۵/۰۷/۲۱ فهرستی داد: دوازده خواستهٔ
شماره‌دار، نُه خواستهٔ دیگر، نمونهٔ «گزارش سفارشات در بازه شماره سفارش 6716 تا 6745» به تفکیک چاپخانه، و دو قالب HTML («برگهٔ سفارش» و
«بیجک سفارش»). قالب‌ها Jinja2 برای WeasyPrint‌اند و لوگو، شناسهٔ تلگرام و شمارهٔ تلفن «چاپ اپکس» را دارند، پس مثل نمونهٔ فایل پست (سؤال ۵۹)
بیرون از مخزن می‌مانند. این بخش هر خواسته را به جای امروزش در کد می‌برد، تناقضش با تصمیم‌های گذشته را نام می‌برد، و پنج برش پیشنهاد
می‌کند. جزئیات اجرای هر برش (مهاجرت‌ها، محافظ‌ها، سنجش‌ها) مثل ۷٫۵ در برنامهٔ خود آن برش و پیش از شروعش می‌آید؛ اینجا فقط دامنه، ترتیب و
تصمیم‌های اصلی است.

**خواسته‌ها و جای امروزشان** (بررسی کد، ۱۴۰۵/۰۷/۲۱؛ شماره‌ها همان فهرست صاحب پروژه):

| # | خواسته | امروز | کجا |
|---|---|---|---|
| ۱ | هشدار کیفیت اسکن و حاشیه به مشتری نشان داده نشود | فقط در قدم «جزوه و قیمت» دیده می‌شوند (`AnalysisCard`، `JozveFiles`): کیفیت پایین، حاشیهٔ کم، صفحهٔ خالی، و فونت جایگزین جدا از آنها. پنل هیچ‌کدام را نشان نمی‌دهد | ۸٫۱ |
| ۲ | کاغذ A3، A4 و A5؛ صحافی منگنه، طلق و سیم، چسب گرم و کاور؛ خدمات جانبی مثل تراکت، پوستر و چاپ گلاسه؛ و خاموش کردن هر کدام | اندازهٔ کاغذ در قیمت و سفارش نیست و فایل چاپ همیشه A4 است (ADR-043). مدل نوع کاغذ و صحافی با فلگ `enabled` هست، ولی دادهٔ پایه فقط «تحریر ۸۰ گرم» و «طلق و سیم» دارد و ویرایشگر فقط همین صحافی را. خدمات جانبی نیست | ۸٫۳؛ خدمات جانبی سؤال ۱۸۷ |
| ۳ | همهٔ متن‌ها (خانه، قوانین، سؤال‌ها، تماس، دربارهٔ ما)، لوگو، بنر، رنگ‌ها، شماره و نشانی قابل تغییر | همهٔ متن‌ها در کد (TSX)؛ فقط عددها از پایگاه داده (تعرفه، روز کاری، روزهای نگهداری). لوگو، آیکون‌ها و تصویر اشتراک فایل ثابت‌اند. رنگ‌ها قفل برندند (ADR-031) | ۱۱٫۱، ۱۱٫۲ |
| ۴ | قیمت هر حالت چاپ (یکرو، دورو، رنگی، A4، A5…) و هر صحافی مشخص و قابل تغییر | ویرایشگر تعرفه (۴٫۵) فقط نرخ رنگی و سیاه‌سفید، بازه‌های طلق و سیم و کرایهٔ پست را دارد؛ یکرو و دورو یک نرخ‌اند؛ حداقل سفارش، مالیات و گرد کردن فقط‌خواندنی‌اند | ۸٫۳ |
| ۵ | کد تخفیف با سقف استفاده و مهلت، و نمایشش بالای صفحه به انتخاب ادمین | نیست. `orders.discount_rials` هست و موتور قیمت همیشه صفر می‌گذارد | ۱۱٫۳، ۱۱٫۴ |
| ۶ | اعلان قیمت بالای صفحه («هر صفحه فقط 2,400 تومان») | نیست | ۱۱٫۳ |
| ۷ | تخفیف ویژهٔ سفارش بزرگ (مثلاً بالای ۷ میلیون تومان) | نیست (`discount_tiers` بخش ۵ برنامه بود و ساخته نشد) | ۱۱٫۴ |
| ۸ | تخصیص دستی و خودکار، و خودکار بر اساس فاصله | خودکار: همان شهر، وگرنه همان استان، وگرنه پیش‌فرض (ADR-042)؛ دستی: «جابه‌جایی» در «در صف چاپ». مختصات شهرها نیست، و منبع امروز شهرها هم ندارد | ۱۰٫۱ |
| ۹ | گزارش کامل هر چاپخانه: شمار فایل، فایل‌های فرد، صحافی… | فقط «گزارش ارسال» (حاشیهٔ کرایه، ۶٫۴) | ۱۰٫۲ |
| ۱۰ | حداقل سفارش، فرمت و حجم فایل از پنل | حداقل سفارش در تعرفه (صفر) و در پنل فقط‌خواندنی؛ فرمت‌ها در کد؛ `file.max_bytes` در هر آپلود خوانده می‌شود ولی از پنل نه؛ `file.max_pages` هیچ‌جا خوانده نمی‌شود | ۸٫۴ |
| ۱۱ | برگهٔ اول سفارش و قالب نشانی HTML و بارگذاری‌شدنی در پنل؛ پنل جمع‌وجوری که با کلیک روی شمارهٔ سفارش مشخصات فایل‌ها را نشان دهد؛ فایل زیپ | برگهٔ سفارش یکی برای هر سفارش، با PyMuPDF و HTML درون کد (ADR-043)، بی لوگو و بی فرستنده (سؤال ۴۰). دانلود هر جلد جدا؛ زیپ نیست. صفحهٔ سفارش پنل شمار صفحه‌های رنگی را ندارد | ۹٫۱، ۹٫۲ |
| ۱۲ | تکلیف هر فایل روشن باشد؛ چند فایل جدا، نه همه چسبیده | رابط همهٔ فایل‌ها را یک جزوه با یک صحافی می‌کند (ADR-030). قرارداد، موتور قیمت، پایگاه داده، کارگر و پنل از امروز چند جزوه را دارند (`MAX_ITEMS_PER_ORDER = 10`) | ۸٫۲ |
| — | نقش‌ها (ادمین کل، اپراتور هر چاپخانه، حسابدار) به انتخاب مالک | مالک، متصدی و چاپخانه (با محدوده) هست؛ حسابدار نه؛ نقش ادمینِ ساخته‌شده از پنل عوض نمی‌شود | ۹٫۴ |
| — | وضعیت‌های سفارش و برگهٔ اول برای اپراتور | هست (۴٫۳، ۵٫۱، ۵٫۳) | قالب برگه در ۹٫۲ |
| — | کد رهگیری، هزینه و روش‌های ارسال، برچسب نشانی | رهگیری هست (برش ۶). فقط پست پیشتاز: تیپاکس، پیک و تحویل حضوری در دادهٔ پایه خاموش‌اند و رابطی ندارند. برچسب درون برگهٔ سفارش است | ۸٫۵ (سؤال ۱۹۱)، ۹٫۲ |
| — | تأیید رسید پرداخت، بازگشت وجه، تسویه با چاپخانه‌ها | پرداخت را زیبال سرور به سرور تأیید می‌کند (۷٫۲)؛ بازپرداخت ثبت دستی است (۷٫۳)؛ تسویه نیست | سؤال ۲۱۴؛ ۱۰٫۳ |
| — | بنر تعطیلی یا شلوغی هر چاپخانه | نیست | ۱۰٫۱ (سؤال ۲۰۰) |
| — | خروجی اکسل و PDF گزارش‌ها | هیچ خروجی فایلی در پنل نیست | ۱۰٫۲ |
| — | موجودی کاغذ و هشدار کمبود | نیست | ۱۰٫۴ |
| — | یادداشت داخلی و ویرایش دستی سفارش | ویرایش فقط نام، نشانی و کد پستی گیرنده (۴٫۳)؛ یادداشت نیست | ۹٫۳ |
| — | تیکت پشتیبانی، مسدودسازی مشتری، و جای رضایت و نظر با حذف به دست مالک | هیچ‌کدام | ۱۲ |

**یافته‌های همین بررسی** (بیرون از فهرست، ولی سر راه همین برش‌ها):
- **حداقل سفارش بن‌بست پنهان دارد.** «ادامه» به هشدار `below_min_order` بند نیست (`OrderDesk.tsx`)، و سرور در «پرداخت» سفارش هشداردار را با ۴۲۲
  `quote_warnings` رد می‌کند؛ امروز حداقل صفر است، پس دیده نشده. یادداشتش هم می‌گوید «چند جزوه را با هم بفرست»، که رابط امروز نمی‌تواند، و مسیر خرید
  هر `quote_warnings` را با همان متن حداقل سفارش نشان می‌دهد. با ۸٫۴؛ بسته شد: «ادامه» زیر حداقل بسته است و مانده را می‌گوید، و مسیر خرید برای
  هر شکستی که جوابش در میز است (`quote_warnings`، `option_unavailable`، `too_many_pages`) متن خودش و «برگرد به جزوه و قیمت» را دارد.
- **«دو روز» در کد:** فهرست اعتماد صفحهٔ اصلی («2 روز بعد خودکار پاک می‌شود») و پرسش چهارم «سؤال‌های پرتکرار» عدد را در کد دارند، ولی قوانین و
  حریم خصوصی `file.retention_days` را می‌خوانند. با ۸٫۴، و در ۱۱٫۱ با جای‌نگهدار؛ عدد بسته شد: هر دو از همان تنظیم (`siteFiles`).
- **چند جای سایت فقط جزوهٔ اول را می‌خوانند** (`items[0]`: خلاصه، مرور، صفحهٔ سفارش، `ConfigPanel`). با ۸٫۲؛ بسته شد: `items[0]` فقط در شاخهٔ یک جزوه مانده.
- کد هشدار `odd_page_size` در قرارداد هست و هیچ‌جا ساخته نمی‌شود.

**برش‌ها** (نام PRها ۸٫۱ و…؛ برش‌های ۸ و ۹ قدیم جدول بالا جابه‌جا می‌شوند، سؤال ۱۷۹):

| برش | دامنه | PRها (پیشنهاد) | روی سایت زنده |
|---|---|---|---|
| ۸ کاتالوگ چاپ و قیمت | خواسته‌های ۱، ۲، ۴، ۱۰ و ۱۲، و روش‌های ارسال | ۸٫۱ هشدارها فقط در پنل؛ ۸٫۲ چند جزوه در یک سفارش؛ ۸٫۳ اندازهٔ کاغذ، نرخ یکرو و دورو، صحافی‌ها و نوع کاغذ، روشن و خاموش، و ویرایشگر کامل تعرفه؛ ۸٫۴ حداقل سفارش، فرمت، حجم و صفحه از پنل؛ ۸٫۵ روش‌های ارسال (شرطی، سؤال ۱۹۱) | صفحهٔ اصلی و «جزوه و قیمت»؛ مسیر خرید همچنان `off` |
| ۹ پنل عملیات | خواستهٔ ۱۱، نقش‌ها، یادداشت و ویرایش | ۹٫۱ فهرست جمع‌وجور با مشخصات فایل‌ها، و زیپ هر سفارش؛ ۹٫۲ قالب HTML برگهٔ اول و بیجک؛ ۹٫۳ یادداشت داخلی و ویرایش دستی؛ ۹٫۴ نقش حسابدار و عوض کردن نقش | هیچ (پنل) |
| ۱۰ چاپخانه‌ها | خواسته‌های ۸ و ۹، تعطیلی و شلوغی، خروجی، تسویه، موجودی | ۱۰٫۱ تخصیص با فاصله، حالت دستی، و «تعطیل» و «شلوغ»؛ ۱۰٫۲ گزارش تولید هر چاپخانه با خروجی اکسل و PDF؛ ۱۰٫۳ تسویه با چاپخانه‌ها؛ ۱۰٫۴ موجودی کاغذ | هیچ، جز نوار وقتی همهٔ چاپخانه‌ها تعطیل‌اند (سؤال ۲۰۰) |
| ۱۱ محتوا و بازاریابی | خواسته‌های ۳، ۵، ۶ و ۷ | ۱۱٫۱ متن‌ها و اطلاعات تماس از پنل؛ ۱۱٫۲ لوگو و بنر؛ ۱۱٫۳ نوار اعلان بالای صفحه؛ ۱۱٫۴ کد تخفیف و تخفیف سفارش بزرگ | همه |
| ۱۲ مشتری و پشتیبانی | تیکت، مسدودسازی، رضایت و نظر؛ و «سفارش‌های قبلی» برش ۸ قدیم | ۱۲٫۱ «سفارش‌های من» و تیکت؛ ۱۲٫۲ مسدودسازی؛ ۱۲٫۳ رضایت و نظر | همه |
| بعد | — | ۱۳ خدمات جانبی (سؤال ۱۸۷)؛ ۱۴ آمار و قیف (باقی برش ۸ قدیم)؛ ۱۵ موتور سئو (برش ۹ قدیم) | — |

**وابستگی‌ها:** ۸٫۱ کوچک و مستقل است، اول. ۸٫۲ پیش از ۸٫۳: اول هر جزوه تنظیمات خودش را می‌گیرد، بعد گزینه‌های تازه. ۸٫۳ شکل ریز قیمت منجمد و
قلم سفارش را عوض می‌کند، پس پیش از اولین سفارش واقعی (سؤال ۱۷۹). ۹٫۲ پیش از PDF گزارش‌های ۱۰٫۲ (همان موتور). ۱۰٫۳ پس از ۱۰٫۲ (همان شمارش‌ها).
۱۱٫۴ پس از ۸٫۳ (همان موتور قیمت). ۱۲٫۱ نشست مشتری ۳ب (`jy_auth`) را به کار می‌برد. طرح نمونه پیش از ۸٫۲، ۹٫۱، ۱۱٫۱ و ۱۲٫۱ (سؤال ۱۸۰).

**دست نمی‌خورد:** تز محصول (قیمت پیش از هویت، صفر تایپ تا نشانی، یک تصمیم در هر لحظه، بی بن‌بست)؛ قاعده‌های شکست‌ناپذیر: قیمت و تخفیف فقط در
`packages/pricing`، سرور منبع حقیقت، پول `bigint` و ریال، رنگ per-page، قیمت منجمد، آداپتور برای هر سرویس بیرونی، و هیچ منبع بیرونی در زمان اجرا
(تصویر و فونت بارگذاری‌شده هم از دامنهٔ خودمان)؛ پالت برند (سؤال ۲۰۷)؛ باندل اولیهٔ سایت (۱۰۷٬۶۳۳ بایت، سقف تست ۱۱۱): رابط تازهٔ پس از فایل در همان
تکهٔ جدا، و هر چه پیش از فایل است کامپوننت سرور؛ عددهای قفل‌شدهٔ اولین قیمت؛ و مسیر خرید سایت زنده `off` تا صاحب پروژه بگوید.

**سنجیده پیش از برنامه** (بیرون از مخزن، روی دادهٔ نمونه؛ هیچ چیز روی سرور یا CI اجرا نشد):
- **قالب‌های صاحب پروژه در دو موتور**، با دادهٔ نمونه و Jinja2 3.1.6 در `SandboxedEnvironment`:
  - PyMuPDF 1.27.2.3، همان پین کارگر و همان موتوری که برگهٔ امروز را می‌سازد (Story، که `insert_htmlbox` هم روی آن است): MuPDF کل `<style>` را کنار
    گذاشت، چون دادهٔ base64 فونت درون `@font-face` برایش «token too long» است؛ برگه با فونت پیش‌فرض و لوگوی تمام‌عرض آمد. با وزیرمتن مخزن به جای آن
    داده، رنگ، لبه، زمینه و جدول واقعی درست‌اند، ولی `display: table` (جعبه‌های کنار هم)، پاورقی `position: fixed` و چیپ‌های `inline-block` نه: همه
    زیر هم چیده شدند و بیجک به صفحهٔ دوم رفت.
  - WeasyPrint 70.0، موتوری که قالب‌ها برایش نوشته شده‌اند: هر دو عین طرحشان، یک صفحه، حدود ۰٫۸ ثانیه هر کدام، با وزیرمتن درون قالب.
  - واکشی: با واکش‌گر پیش‌فرض WeasyPrint، برگهٔ سبک `http://127.0.0.1` درخواست شد و `file://` محلی به کار رفت (زمینهٔ قرمز)؛ با
    `URLFetcher(allowed_protocols=["data"])` هیچ‌کدام (زمینهٔ سفید، صفر درخواست).
  - Jinja2 در sandbox: `''.__class__` و `cycler.__init__.__globals__` خطای `SecurityError` دادند، و `<script>` در مقدار escape شد.
  - وابستگی‌های پایتونی تازهٔ WeasyPrint و Jinja2، بازشده: حدود ۴۵ مگابایت (fontTools ۲۹ و pyphen ۶٫۳)، به‌علاوهٔ کتابخانه‌های Pango از Debian؛ Pillow
    همین حالا در ایمیج هست.
- **مختصات شهرها:** `iran-cities-json` ۲٫۰٫۰، منبع `packages/geo`، فقط شناسه، نام و استان دارد.
- **چند جزوه:** `MAX_ITEMS_PER_ORDER = 10` در قرارداد؛ `quote()`، `createOrder`، `prepare_order` و صفحهٔ سفارش پنل هر کدام روی همهٔ قلم‌ها می‌چرخند (تست
  سرتاسری پنل «دو جزوه» دارد)؛ فقط رابط سایت یک جزوه می‌فرستد.
- **تنظیم‌ها:** `file.max_bytes` در هر آپلود خوانده می‌شود ولی در `SETTING_SCHEMAS` و پنل نیست؛ `file.max_pages` و `order.min_order_rials` بخش ۵ فقط در
  سندند؛ حداقل سفارش واقعی `PriceList.settings.minOrderRials` است.

**سؤال‌ها** (تأیید ۱۴۰۵/۰۷/۲۱، همه طبق پیشنهاد؛ جزئیات اجرا در برنامهٔ هر برش):

*سراسری*
- **۱۷۸. «چاپ اپکس» و نام سایت.** قالب‌ها و گزارش نمونه مال «چاپ اپکس»اند (لوگو، `@Chap_Apex`، تلفن، و چاپخانه‌های «چاپ اپکس | هادی»،
  «چاپ اپکس | فرشادینو» و «تبریز»). پیشنهاد: سایت، پیامک‌ها و درگاه با نام جزوه‌یار می‌مانند؛ «چاپ اپکس» و شعبه‌هایش چاپخانه‌های «چاپخانه‌ها»یند (یا
  کسب‌وکار پشت سایت)؛ نام و لوگوی روی برگه‌های چاپی را قالب تعیین می‌کند (سؤال ۱۹۴). دلیل: دامنه، اینماد، دامنهٔ ثبت‌شدهٔ زیبال و سه قالب پیامک
  («جزوه‌یار: …») به نام جزوه‌یار ثبت شده‌اند؛ نام تازه یعنی ثبت دوبارهٔ همه، که از پنل شدنی نیست و برنامهٔ جدای خودش را می‌خواهد.
- **۱۷۹. ترتیب، و جای باز شدن مسیر خرید.** پیشنهاد: ۸ ← ۹ ← ۱۰ ← ۱۱ ← ۱۲، و روشن کردن `live` پس از برش ۸، نه پیش از آن. از برش ۸ قدیم (پنل کاربری و
  آمار) «سفارش‌های قبلی» در ۱۲٫۱ و بقیه برش ۱۴؛ برش ۹ قدیم (سئو) برش ۱۵. دلیل: برش ۸ شکل ریز قیمت منجمد و قلم سفارش را عوض می‌کند؛ پیش از اولین
  سفارش واقعی هیچ سفارشی با شکل قدیم نمی‌ماند که برای همیشه دو شکل خوانده شود (همان «وقتش همین بود» ADR-030). و کاتالوگ امروز (فقط A4، فقط طلق و
  سیم، یک جزوه) از آنچه کسب‌وکار امروز می‌فروشد کوچک‌تر است. برش‌های بعد شکل سفارش را عوض نمی‌کنند؛ تخفیف ۱۱٫۴ همان خطی است که ریز قیمت از امروز
  دارد.
- **۱۸۰. طرح نمونه.** پیشنهاد: پیش از ۸٫۲ (میز سفارش با چند جزوه، اندازه، صحافی‌ها، گزینهٔ خاموش و حداقل سفارش)، ۹٫۱ (فهرست جمع‌وجور و مشخصات
  فایل‌ها)، ۱۱٫۱ (ویرایشگر متن و نوار اعلان) و ۱۲٫۱ (سفارش‌های من و تیکت)، بیرون از گیت، مثل قدم‌های ۸ تا ۱۰؛ سؤال‌های طرح پس از همین سؤال‌ها شماره
  می‌گیرند (`docs/UI.md`، قدم ۱۱). دلیل: همان روش؛ این‌ها تغییرهای دیدنی‌اند.

*برش ۸: کاتالوگ چاپ و قیمت*
- **۱۸۱. هشدارها (خواستهٔ ۱).** پیشنهاد: مشتری «کیفیت اسکن پایین» و «حاشیهٔ کم» را دیگر نمی‌بیند؛ «صفحهٔ خالی» و «فونت جایگزین» برای مشتری
  می‌مانند، چون هر دو دربارهٔ پول‌اند: اولی صفحه‌ای است که هزینه می‌گیرد، و دومی می‌گوید شمار صفحه و قیمت شاید فرق کند و راه جلو دارد («خروجی PDF
  بگیر»). همه همان‌طور حساب و ذخیره می‌شوند (ADR-029)، و پنل همه را برای هر فایل با شمارهٔ صفحه در صفحهٔ سفارش نشان می‌دهد، به مالک، متصدی و
  چاپخانه. قوانین یک جمله می‌گیرد: «فایل همان‌طور که فرستاده شده چاپ می‌شود.» دلیل: صاحب پروژه همین دو را نام برده، و هر دو فقط کیفیت ظاهرند؛
  پنهان کردن آن دوی دیگر قیمت را بی‌صدا عوض می‌کرد.
- **۱۸۲. چند جزوه در یک سفارش (خواستهٔ ۱۲).** پیشنهاد: چند فایلی که با هم انداخته شوند یک پرسش دارند: «همه یک جزوه، یک صحافی» یا «هر فایل جزوهٔ
  جدا»؛ تک‌فایل پرسشی ندارد. هر جزوه کارت و تنظیمات خودش را دارد (رنگ، یکرو یا دورو، اندازه، کاغذ، صحافی، نسخه). «افزودن فایل» دو راه دارد:
  «به همین جزوه» و «جزوهٔ تازه»؛ فایل با منوی ردیفش بین جزوه‌ها جابه‌جا می‌شود. قیمت هر جزوه جدا و جمع سفارش یکی؛ کرایه یک بار، با وزن همه. سقف:
  ۳۰ فایل در کل سفارش (همان امروز) و ۳۰ جزوه (`MAX_ITEMS_PER_ORDER` ۱۰ ← ۳۰). پیش‌نویس رفرش (ADR-036) نسخهٔ ۲ می‌گیرد و نسخهٔ ۱ را هم می‌خواند.
  دلیل: مشتری امروزِ کسب‌وکار هر فایل را جدا سفارش می‌دهد (بیجک نمونه برای هر فایل صحافی خودش را دارد)؛ «یک جزوه، یک صحافی» ADR-030 یکی از دو راه
  می‌ماند، پس فصل‌های یک درس هنوز یک صحافی می‌خورند؛ و لایه‌های زیر رابط چند جزوه را از امروز دارند.
- **۱۸۳. اندازهٔ کاغذ.** پیشنهاد: هر جزوه A4 (پیش‌فرض)، A5 یا A3، هر کدام با نرخ و روشن و خاموش خودش. A5 یعنی هر صفحه روی یک روی برگ A5، و A3 همین
  روی A3؛ نه دو صفحه روی یک رو، و نه کتابی (چیدن و تا). فایل چاپ هر صفحه را روی اندازهٔ انتخابی «Fit» می‌کند، همان قاعدهٔ امروز A4 (ADR-043)، و وزن از
  مساحت همان اندازه. A5 و A3 تا نرخشان وارد نشده خاموش‌اند. دلیل: خواسته؛ «Fit» برای A4 نوشته و سنجیده شده و فقط اندازه‌اش پارامتر می‌شود. «چند صفحه
  روی یک رو» را ADR-043 رد کرده (شمار رو، یعنی قیمت، عوض می‌شد)، و کتابی محصول دیگری است؛ اگر لازم است، جدا بگو.
- **۱۸۴. نرخ چاپ.** پیشنهاد: جدول نرخ هر روی چاپی برای هر ترکیب اندازه × یکرو یا دورو × رنگی یا سیاه‌سفید (برای سه اندازه ۱۲ عدد)، به جای دو نرخ
  امروز؛ نرخ کاغذ هر برگ هم می‌ماند (پیش‌فرض صفر). نسخه‌های قدیم تعرفه با «یک نرخ برای یکرو و دورو، فقط A4» خوانده می‌شوند. دلیل: صاحب پروژه قیمت هر
  حالت را جدا و صریح می‌خواهد («تک رو دو رو رنگی و A4 و A5»)؛ موتور همان «روهای چاپی × نرخ» می‌ماند (`docs/PRICING.md`).
- **۱۸۵. صحافی.** پیشنهاد: صحافی‌ها داده‌اند، نه کد: «بی صحافی»، «منگنه»، «طلق و سیم»، «چسب گرم» و «کاور»، و هر نوع تازه‌ای که مالک بیفزاید. هر
  نوع: نام، بازه‌های برگ با قیمت هر جلد برای هر اندازهٔ روشن، سقف برگ هر جلد (بالاتر از آن خودکار چند جلد، مثل طلق و سیم امروز)، کمینهٔ برگ،
  اندازه‌های مجاز، وزن هر جلد، و روشن و خاموش. صحافی‌ای که به این جزوه نمی‌خورد با دلیلش دیده می‌شود («منگنه تا 50 برگ»). پرسش: «کاور» در کار امروز
  شما دقیقاً چیست، و قیمتش با چه حساب می‌شود؟ دلیل: خواسته؛ مدل نوع و بازه از امروز هست و فقط ویرایشگر و رابط تک‌صحافی‌اند.
- **۱۸۶. نوع کاغذ و «چاپ گلاسه».** پیشنهاد: «چاپ گلاسه» برای جزوه یعنی نوع کاغذ «گلاسه» کنار «تحریر ۸۰ گرم»، با گرماژ (برای وزن) و نرخ هر برگ برای هر
  اندازه، و روشن و خاموش؛ کاشی «کاغذ» با بیش از یک نوع روشن خودش دیده می‌شود. دلیل: `paper_types` و کاشی‌اش از امروز هست و فقط یک نوع فعال است.
- **۱۸۷. خدمات جانبی (تراکت، پوستر).** پیشنهاد: در برش ۸ نه؛ برش جدا (۱۳) با برنامهٔ خودش: هر خدمت یک محصول با اندازه، کاغذ، یکرو یا دورو و قیمت
  پله‌ای تیراژ، طرح آماده از مشتری (PDF یا عکس)، و روشن و خاموش. پیش از آن فهرست خدمت‌ها و جدول قیمتشان لازم است. دلیل: قیمت تیراژی است نه صفحه‌ای،
  سنجش فایل دیگری می‌خواهد (یک طرح، اندازه و حاشیهٔ برش)، و چاپ دیگری؛ آمیختنش با جزوه «یک تصمیم در هر لحظه» را می‌شکند.
- **۱۸۸. روشن و خاموش کردن.** پیشنهاد: دو لایه. قیمت‌ها در تعرفه، نسخه‌دار، با فعال کردن با کد تازه (ADR-040)؛ در دسترس بودن زنده از پنل، بی نسخهٔ
  تازه: مالک یا متصدی هر گزینهٔ تعرفهٔ فعال را موقتاً خاموش و دوباره روشن می‌کنند («چسب گرم موقتاً نه»)، با رویداد؛ چیزی که قیمت ندارد روشن نمی‌شود.
  سایت همراه JSON تعرفه می‌گیردش (ISR ۶۰ ثانیه)؛ سرور گزینهٔ خاموش را با ۴۰۹ و پیام روشن رد می‌کند؛ پیش‌نویس رفرش گزینهٔ خاموش را با یادداشت کنار
  می‌گذارد. سفارش‌های ثبت‌شده دست نمی‌خورند. دلیل: دستگاه خراب نسخهٔ تازهٔ تعرفه و کد تازه نمی‌خواهد؛ قیمت همچنان نسخه‌دار و منجمد است.
- **۱۸۹. ویرایشگر تعرفه (خواستهٔ ۴).** پیشنهاد: ویرایشگر ۴٫۵ هر چه قیمت دارد را می‌گیرد: جدول نرخ چاپ، نوع‌های کاغذ، بازه‌های هر صحافی برای هر اندازه،
  روش‌ها و کرایهٔ ارسال، حداقل سفارش، گرد کردن و مالیات؛ و جدول تعرفهٔ صفحهٔ اصلی همهٔ گزینه‌های روشن را نشان می‌دهد. فعال کردن همان کد تازه، و
  نسخه‌ای که فعال شد عوض‌نشدنی (ADR-040). دلیل: امروز حداقل سفارش، مالیات، گرد کردن، و کاغذ و صحافی‌های دیگر از پنل عوض نمی‌شوند.
- **۱۹۰. حداقل سفارش، فرمت، حجم و صفحه (خواستهٔ ۱۰).** پیشنهاد: حداقل سفارش روی جمع چاپ، کاغذ و صحافی، پیش از کرایه و تخفیف، در تعرفه؛ «ادامه» تا
  رسیدن به آن بسته است و خلاصه می‌گوید «تا حداقل سفارش X تومان مانده» (بن‌بست «پرداخت» بسته می‌شود و متن یادداشت درست). فرمت‌ها با یک کلید برای هر
  خانواده: PDF همیشه، Word (doc و docx)، پاورپوینت (ppt و pptx) و عکس (jpg، png، webp و heic)؛ فرمت خاموش همان لحظهٔ انداختن پیام روشن می‌گیرد («فایل
  Word فعلاً پذیرفته نمی‌شود؛ PDF بفرست»). حجم هر فایل (۱ تا ۱٬۵۳۶ مگابایت) و صفحهٔ هر فایل (۱ تا ۱٬۵۰۰): مرورگر همان لحظه می‌سنجد و سرور دوباره
  (قاعدهٔ ۲). همه در `SETTING_SCHEMAS` و «تنظیمات»، فقط مالک، و همراه JSON تعرفه به مرورگر. دلیل: خواسته؛ و بستن بن‌بستی که بالا پیدا شد.
- **۱۹۱. روش‌های ارسال.** پیشنهاد: اگر کسب‌وکار جز پست پیشتاز روش دیگری دارد (تیپاکس، پیک، تحویل حضوری): انتخاب در قدم نشانی میان روش‌های روشن، هر
  کدام با کرایهٔ خودش از همان جدول روش × منطقه × وزن (دادهٔ پایه هر سه را خاموش دارد)؛ «تحویل حضوری» بی کرایه، با نشانی چاپخانه پس از پرداخت و
  تخصیص به همان چاپخانه (پس با ۱۰٫۱)؛ کد رهگیری روش‌های غیرپست را متصدی یا چاپخانه دستی وارد می‌کند (فایل پست برای پست می‌ماند). اگر فقط پست، ۸٫۵
  نیست. پرسش: کدام روش‌ها؟ دلیل: مدل از امروز هست؛ فقط رابط و رهگیری دستی تازه‌اند. **پاسخ (۱۴۰۵/۰۷/۲۶): فقط پست پیشتاز**؛
  پس ۸٫۵ ساخته نمی‌شود و برش ۸ تمام است.

*برش ۹: پنل عملیات*
- **۱۹۲. فهرست جمع‌وجور، مشخصات فایل‌ها و زیپ (خواستهٔ ۱۱).** پیشنهاد: «سفارش‌ها» یک ردیف کوتاه برای هر سفارش (شماره، نام، شهر، وضعیت، مهلت، چاپخانه،
  و شمار جزوه، فایل و صفحه)؛ کلیک روی شماره مشخصات فایل‌ها را همان‌جا باز می‌کند: برای هر جزوه فایل‌ها با صفحه، صفحه‌های رنگی، اندازه، یکرو یا دورو،
  صحافی، نسخه، «فرد» بودن، و هشدارهای ۸٫۱؛ صفحهٔ کامل سفارش یک کلیک آن طرف. «همهٔ فایل‌ها (zip)» برای هر سفارش: فایل چاپ همهٔ جلدها، برگه‌های اول و
  بیجک، جریانی از استوریج بی فایل موقت (بی فشرده‌سازی دوباره، ZIP64 بالای ۴ گیگابایت)، با رویداد؛ چاپخانه هم برای سفارش‌های خودش. برداشت ما از «فایل
  زیپ» همین دانلود است؛ اگر منظور طرح پنل در یک زیپ بود، طرح نمونهٔ ۹٫۱ (سؤال ۱۸۰) همان است. دلیل: سفارش یک‌جا چاپ می‌شود، و امروز هر جلد یک کلیک
  است.
- **۱۹۳. موتور قالب برگه‌ها.** پیشنهاد: WeasyPrint و Jinja2 در ایمیج پایهٔ کارگر (ADR-027)، با واکش‌گر فقط `data:`، `SandboxedEnvironment` با escape
  خودکار، ساختن درون همان قفس کارگر (`sandbox.run_confined`) با سقف زمان و حافظه، و قالب حداکثر ۲ مگابایت (قالب‌های نمونه با فونت و لوگوی درونی حدود
  ۲۷۰ کیلوبایت‌اند). هزینه: ایمیج پایهٔ تازه، یک بار دانلود کامل روی سرور. جایگزین: فقط PyMuPDF، بی دانلود، ولی هر قالبی که بالا می‌آید باید با
  محدودیت‌های MuPDF بازنویسی شود (بالا، «سنجیده»). دلیل: صاحب پروژه قالب HTML می‌خواهد و قالب‌های امروزش برای WeasyPrint نوشته شده‌اند؛ موتوری که
  «آنچه بالا آمد» را با «آنچه چاپ شد» یکی نگه دارد، ارزش یک بار دانلود را دارد.
- **۱۹۴. کدام برگه‌ها، با چه داده‌ای.** پیشنهاد: دو قالب به جای برگهٔ امروز: «برگهٔ اول»، یکی برای هر جزوه (روی دستهٔ همان جزوه: شمارهٔ سفارش، گیرنده،
  فایل‌ها و مشخصات همین جزوه، نسخه، و خلاصهٔ سفارش)، و «بیجک»، یکی برای هر سفارش (فرستنده، گیرنده، نشانی، کد پستی، تلفن، فهرست جزوه‌ها، جمع نسخه، و
  برچسب پست با «نام گ»)، در یک PDF: اول بیجک، بعد برگه‌های اول. قالب‌های پیش‌فرض همان محتوای برگهٔ امروزند. فهرست متغیرها با توضیح فارسی در پنل، با
  نام‌های نزدیک قالب‌های امروز شما (`order.files`، `print_info…`). لوگو و فرستنده (نام، تلفن) محتوای قالب‌اند، پس سؤال ۴۰ (بی لوگو، بی فرستنده) به
  انتخاب شما برمی‌گردد. مبلغ هرگز در دادهٔ قالب نیست (چاپخانه می‌بیندش). بارگذاری ← پیش‌نمایش با یک سفارش واقعی یا نمونه ← فعال کردن با کد تازه،
  فقط مالک؛ نسخه‌ها می‌مانند و برگشت یعنی فعال کردن نسخهٔ قبل. یک قالب فعال برای هر نوع، برای همهٔ چاپخانه‌ها. دلیل: همان کار امروزتان (برگه روی هر
  دسته، بیجک روی هر بسته)؛ قالب به کد شبیه است، پس فقط مالک و با کد تازه.
- **۱۹۵. یادداشت داخلی.** پیشنهاد: یادداشت روی سفارش، فقط افزودنی، با نویسنده و زمان، تا ۱٬۰۰۰ نویسه؛ مالک، متصدی و حسابدار می‌نویسند و می‌خوانند؛ هر
  یادداشت تیک «چاپخانه هم ببیند» دارد («اسم استاد روی جلد نیاید»)، و چاپخانه فقط همان‌ها را می‌بیند. اشتباه با یادداشت تازه درست می‌شود. دلیل: مثل
  رویدادها، رد کار عوض نمی‌شود.
- **۱۹۶. ویرایش دستی سفارش.** پیشنهاد: آنچه قیمت را عوض نمی‌کند ویرایش‌شدنی است (نام، نشانی و کد پستی گیرنده، که هست؛ و دستورها با یادداشت). آنچه قیمت
  را عوض می‌کند (نسخه، صحافی، اندازه، فایل، شهر) ویرایش درجا نیست: در نسخهٔ اول لغو، بازپرداخت دستی (۷٫۳) و سفارش تازه؛ «اصلاحیه» با پرداخت مابه‌التفاوت
  یا بازپرداخت بخشی بعداً، با برنامهٔ خودش. دلیل: قیمت منجمد است (قاعدهٔ ۶، ADR-034) و مبلغ درگاه همان جمع منجمد (`payments_amount_is_total`)؛ ویرایش
  درجا پول و سفارش را از هم جدا می‌کرد.
- **۱۹۷. نقش حسابدار و عوض کردن نقش.** پیشنهاد: نقش چهارم «حسابدار» در کد (`ADMIN_ROLES`): سفارش‌ها با مبلغ، پرداخت‌ها و بازپرداخت‌ها، همهٔ گزارش‌ها با
  خروجی، تسویهٔ چاپخانه‌ها (۱۰٫۳) با کد تازه، و ثبت بازپرداخت دستی (امروز فقط مالک)؛ بی وضعیت، جابه‌جایی، لغو، تعرفه، تنظیمات و ادمین‌ها. مالک نقش ادمین
  موجود را از «ادمین‌ها» با کد تازه عوض می‌کند (امروز فقط هنگام دعوت)؛ آخرین مالک فعال پایین نمی‌آید. «ادمین کل» همان مالک است و «اپراتور هر چاپخانه»
  نقش «چاپخانه» (۵٫۳). دلیل: خواسته؛ «نقش‌ساز نه» ADR-038 می‌ماند: مجوز هر نقش در کد، و انتخاب نقش با مالک.

*برش ۱۰: چاپخانه‌ها*
- **۱۹۸. تخصیص با فاصله (خواستهٔ ۸).** پیشنهاد: همان شهر ← همان استان ← نزدیک‌ترین چاپخانهٔ فعال و باز با فاصلهٔ خط مستقیم میان دو شهر، به جای
  «پیش‌فرض»؛ پیش‌فرض فقط برای برابری، یا شهری که مختصات ندارد. مختصات: منبع امروز ندارد؛ پیشنهاد GeoNames (CC BY 4.0) با تطبیق نام و استان برای
  ۱٬۳۲۳ شهر، ناخوانده‌ها با دست، و نام منبع در `packages/geo/NOTICE.md`؛ داده درون `packages/geo`، بی سرویس بیرونی در زمان اجرا (قاعدهٔ ۸). کرایهٔ مشتری
  عوض نمی‌شود (ADR-042). دلیل: پست درون‌استانی ارزان‌تر است (سؤال ۹)، پس استان پیش از فاصله؛ فاصله سطح آخر را بهتر می‌کند: سفارش استانی که چاپخانه
  ندارد به نزدیک‌ترین می‌رود، نه همیشه به پیش‌فرض.
- **۱۹۹. حالت دستی.** پیشنهاد: تنظیم «تخصیص»: «خودکار» (پیش‌فرض: امروز به‌علاوهٔ فاصله) یا «دستی»: سفارش پرداخت‌شده «بی چاپخانه» می‌ماند، با هشدار
  پیشخوان و فهرست پیشنهادی به همان ترتیب قاعده، و متصدی با یک کلیک می‌سپارد (سپردن اول دلیل نمی‌خواهد؛ جابه‌جایی مثل امروز با دلیل). دلیل: «دستی و
  خودکار»؛ دستیِ امروز فقط جابه‌جایی پس از خودکار است.
- **۲۰۰. تعطیلی و شلوغی هر چاپخانه.** پیشنهاد: هر چاپخانه «باز»، «شلوغ» یا «تعطیل از … تا …» با یادداشت؛ مالک و متصدی می‌گذارند، و کاربر چاپخانه برای
  خودش، با رویداد. تعطیل در تخصیص خودکار و فهرست دستی نیست؛ شلوغ فقط وقتی سفارش می‌گیرد که چاپخانهٔ باز دیگری در همان استان نباشد. پیشخوان: «چاپ نور
  تا ۲۵ مهر تعطیل است». روی سایت فقط وقتی همهٔ چاپخانه‌های فعال تعطیل‌اند، با نوار اعلان ۱۱٫۳ و روز کاری بعد. دلیل: مشتری چاپخانه را انتخاب نمی‌کند،
  پس بنر هر چاپخانه روی سایت معنایی ندارد؛ اثرش روی مشتری فقط وقتی است که هیچ‌کس چاپ نمی‌کند. اگر منظور بنری برای خود چاپخانه‌ها بود، بگو.
- **۲۰۱. گزارش تولید (خواستهٔ ۹).** پیشنهاد: صفحهٔ «گزارش تولید» (مالک و حسابدار؛ چاپخانه فقط گزارش خودش، بی مبلغ)، با بازهٔ روز پرداخت به وقت تهران
  یا بازهٔ شمارهٔ سفارش، مثل نمونه، و یک یا همهٔ چاپخانه‌ها؛ لغوشده جدا. عددها همان نمونه: سفارش، جزوه، فایل، نسخه (با احتساب نسخه‌ها)، صفحه (رنگی و
  سیاه‌سفید)، جزوهٔ رنگی و سیاه‌سفید با شمار «فرد» (شمار صفحهٔ فرد)، نسخهٔ رنگی و سیاه‌سفید، هر صحافی (جلد × نسخه)، هر اندازه، و برگ مصرفی؛ و برای هر
  چاپخانه سفارش، صفحه و مبلغ (جمع پرداخت مشتری) و، با ۱۰٫۳، سهم چاپخانه. «⏳ N سفارش هنوز آماده نیست» یعنی پرداخت‌شده‌ای که فایل چاپش ساخته نشده.
  دلیل: همان گزارش نمونه؛ همه از دادهٔ منجمد سفارش، پس گزارش هرگز با آنچه پرداخت شد نمی‌جنگد.
- **۲۰۲. خروجی اکسل و PDF.** پیشنهاد: هر گزارش (تولید، ارسال ۶٫۴، تسویه) «خروجی اکسل» دارد: XLSX واقعی، دست‌نویس در Node با zlib خودش و بی وابستگی (مثل
  SigV4)، عدد به شکل عدد و برگهٔ راست‌به‌چپ، که تست با همان خوانندهٔ XLSX کارگر (۶٫۱) دوباره می‌خواندش؛ و «خروجی PDF» با کار کارگر و همان موتور قالب
  ۹٫۲. هر خروجی با رویداد. دلیل: بی وابستگی تازه در پنل؛ و چاپ مرورگر نشانی محرمانهٔ پنل را در حاشیهٔ کاغذ می‌آورد (همان دلیل برگهٔ کارگر، ADR-043).
- **۲۰۳. تسویه با چاپخانه‌ها.** پیشنهاد: «سهم چاپخانه» از نرخ‌نامهٔ هر چاپخانه (نرخ هر رو برای اندازه × یکرو یا دورو × رنگ، و هر صحافی برای هر جلد)،
  نسخه‌دار مثل تعرفه و منجمد روی هر سفارش هنگام تخصیص؛ بدهی با «تحویل پست شد» قطعی می‌شود (لغو پیش از چاپ صفر، لغو «در حال چاپ» به تصمیم مالک).
  تسویه: مالک یا حسابدار پرداخت به چاپخانه را با بازه، مبلغ، کد پیگیری و روز ثبت می‌کند، با کد تازه؛ چاپخانه صورت‌حساب خودش را می‌بیند (سفارش‌ها،
  سهم، پرداخت‌شده، مانده)، بی قیمت مشتری. پرسش: چاپخانه‌ها امروز چطور حساب می‌شوند: نرخ هر صفحه، درصدی از سفارش، یا ثابت ماهانه؟ دلیل: بی سهم
  منجمد هر سفارش، تسویه بحث‌برانگیز می‌شود. **پاسخ (۱۴۰۵/۰۷/۲۶): درصدی از سفارش**؛ پس سهم چاپخانه درصدی از مبلغ سفارش است، نه
  نرخ‌نامه، و پایهٔ درصد (کدام بخش مبلغ) و جزئیاتش سؤال‌های اجرای ۱۰٫۳‌اند. **ساخته شد در ۱۰٫۳** (سؤال‌های اجرا ۳۹۰ تا ۴۰۳؛ ADR-069؛ پایین، «۱۰٫۳»).
- **۲۰۴. موجودی کاغذ.** پیشنهاد: برای هر چاپخانه و هر کاغذ (نوع × اندازه)، به برگ: کم شدن خودکار با «شروع چاپ» (برگ × نسخهٔ جزوه‌های سفارش؛ با
  برگرداندن برمی‌گردد)، ورود دستی (خرید، ضایعات، شمارش) فقط افزودنی و با دلیل، و آستانهٔ هر قلم با هشدار پیشخوان برای مالک، متصدی و همان چاپخانه؛
  نسخهٔ اول بی پیامک. پرسش: موجودی همهٔ چاپخانه‌ها، یا فقط چاپخانهٔ خودتان؟ دلیل: چاپ در چاپخانه است؛ کم شدن از روی سفارش، دفترداری دستی را
  برمی‌دارد. **پاسخ (۱۴۰۵/۰۷/۲۸): همهٔ چاپخانه‌ها**؛ جزئیاتش سؤال‌های اجرای ۱۰٫۴‌اند. **ساخته شد در ۱۰٫۴** (سؤال‌های اجرا ۴۰۴ تا ۴۲۰؛ ADR-070؛ پایین، «۱۰٫۴»).

*برش ۱۱: محتوا و بازاریابی*
- **۲۰۵. متن‌ها از پنل (خواستهٔ ۳).** پیشنهاد: مالک از پنل عوض می‌کند: صفحهٔ اصلی (عنوان و متن قهرمان، سه قدم، و سؤال‌ها با افزودن، حذف و ترتیب)،
  قوانین، حریم خصوصی، دربارهٔ ما، تماس (تلفن، موبایل، ایمیل، ساعت، نشانی، پیوند تلگرام و اینستاگرام)، متن پاورقی، و عنوان و توضیح سئوی هر صفحه. قالب
  متن Markdown محدود (بند، سرتیتر، فهرست، پررنگ، و پیوند به همین سایت یا `tel:` و `mailto:`)، ساخته در سرور، بی HTML، اسکریپت و تصویر. عددهای زنده با
  جای‌نگهدار (`{روز_کاری}`، `{روزهای_فایل}`، `{نرخ_سیاه_سفید}`)، تا متن هرگز با تنظیم‌ها نجنگد. پیش‌نویس ← پیش‌نمایش ← انتشار؛ نسخه‌های قبل می‌مانند؛
  همان ISR ۶۰ ثانیه، و «به‌روز شده» از انتشار. دلیل: خواسته؛ قالب محدود سایت را امن نگه می‌دارد، حتی با نشست دزدیده‌شدهٔ پنل، و ظاهر را همان طرح.
- **۲۰۶. لوگو و بنر.** پیشنهاد: لوگو با PNG یا WebP (نه SVG، که اسکریپت می‌پذیرد)، روی استوریج و دامنهٔ خودمان؛ کارگر favicon، آیکون گوشی و تصویر
  اشتراک را از آن می‌سازد (امروز اسکریپت دستی با Chromium). «بنر» یک تصویر اختیاری صفحهٔ اصلی است، با پیوند و متن جایگزین، در دو اندازهٔ دسکتاپ و
  گوشی، و روشن و خاموش. پرسش: «بنر» تصویر است، یا همان نوار اعلان (۲۰۸)؟ دلیل: خواسته؛ بارگذاری فقط تصویر است، نه کد. **پاسخ
  (۱۴۰۵/۰۷/۲۶): تصویر**؛ پس ۱۱٫۲ لوگو و بنر تصویری است، و نوار اعلان همان ۱۱٫۳.
- **۲۰۷. رنگ‌ها.** پیشنهاد: از پنل نه. پالت برند می‌ماند (ADR-031)؛ اگر برند تازه‌ای لازم شد (سؤال ۱۷۸)، یک PR کد با فایل‌های برند تازه و تست‌های
  تضاد. دلیل: رنگ آزاد خوانایی صدها جزء را می‌شکند (متن ۴٫۵ به ۱، کنترل ۳ به ۱)، و نگهبان رنگ رنگی را که در پایگاه داده است نمی‌بیند؛ برند هر ماه عوض
  نمی‌شود.
- **۲۰۸. نوار اعلان (خواستهٔ ۶).** پیشنهاد: یک نوار بالای سربرگ همهٔ صفحه‌های سایت: یک خط متن با قالب محدود و پیوند اختیاری، روشن و خاموش و بازهٔ
  زمانی؛ مالک و متصدی. قیمت با جای‌نگهدار از تعرفهٔ فعال («هر صفحه سیاه‌سفید فقط {نرخ_سیاه_سفید_A4_دورو} تومان»)، تا عدد اعلان همیشه همان قیمت واقعی
  باشد؛ کامپوننت سرور، بی JS و بی اثر بر باندل؛ نسخهٔ اول بستنی نیست. دلیل: خواسته؛ جای‌نگهدار جلوی «اعلان 2,400، قیمت 2,600» را می‌گیرد.
- **۲۰۹. کد تخفیف (خواستهٔ ۵).** پیشنهاد: هر کد: متن (حرف و رقم لاتین، نرمال‌شده، بزرگی و کوچکی یکی)، درصد (با سقف هر سفارش) یا مبلغ ثابت، حداقل
  سفارش، روی چاپ و صحافی (نه کرایه)، بازهٔ اعتبار، سقف کل استفاده، سقف هر مشتری (پیش‌فرض ۱)، و روشن و خاموش؛ مالک می‌سازد. کد در «مرور و پرداخت» وارد
  می‌شود، پس از هویت (سقف هر مشتری موبایل می‌خواهد، و «صفر تایپ تا نشانی» می‌ماند)؛ نوار اعلان کد را نشان می‌دهد اگر مالک «در اعلان» را بزند. تخفیف
  در `packages/pricing` حساب و در ریز قیمت با شناسهٔ کد منجمد می‌شود؛ استفاده با پرداخت موفق شمرده می‌شود و تا مهلت تلاش رزرو است، و پایگاه داده
  نمی‌گذارد از سقف بگذرد، حتی هم‌زمان؛ مبلغ درگاه همان جمع پس از تخفیف است (`payments_amount_is_total`). دلیل: خواسته؛ قاعده‌های ۱ و ۶.
- **۲۱۰. تخفیف سفارش بزرگ (خواستهٔ ۷).** پیشنهاد: پله‌ها در تعرفه (نسخه‌دار)، مثلاً «از 7,000,000 تومان، ۵٪» یا «ارسال رایگان»؛ روی چاپ، کاغذ و صحافی؛
  از اولین قیمت دیدنی («X تومان دیگر تا ۵٪ تخفیف»)؛ با کد تخفیف جمع نمی‌شود: بزرگ‌تر می‌ماند و نامش دیده می‌شود. دلیل: خواسته؛ پیش از هویت دیدنی
  (تز)، و جمع نشدن جمعِ غافلگیرکننده نمی‌سازد. «ارسال رایگان بالای X» را `docs/PRICING.md` (بخش ۶) اهرمی قوی گفته، چون کرایه تقریباً ثابت است.

*برش ۱۲: مشتری و پشتیبانی*
- **۲۱۱. «سفارش‌های من» و تیکت.** پیشنهاد: `/orders` با همان ورود کد پیامکی و نشست مسیر خرید (`jy_auth`)، بی رمز: سفارش‌های خود مشتری با وضعیت و
  رهگیری؛ «پیام به پشتیبانی» برای هر سفارش یا کلی: رشتهٔ پیام متنی (نسخهٔ اول بی پیوست)؛ صندوق پنل برای مالک و متصدی (نه چاپخانه)، با «باز»، «پاسخ
  داده شد» و «بسته»؛ پیامک به مشتری وقتی پاسخ می‌رسد (قالب پنجم). دلیل: خواسته و «سفارش‌های قبلی» برش ۸ قدیم؛ هویت از مسیر خرید هست؛ و مشتری بی
  پیامک سراغ سایت نمی‌آید.
- **۲۱۲. مسدودسازی مشتری.** پیشنهاد: مسدود کردن موبایل با دلیل، مالک و متصدی، با رویداد؛ اثر: کد پیامکی نمی‌رود و سفارش تازه نه، با پیام «ثبت سفارش با
  این شماره ممکن نیست؛ از «تماس» پیام بده» (راه جلو)؛ سفارش‌های پرداخت‌شده همان‌طور چاپ و ارسال می‌شوند؛ رفع مسدودی هر وقت. دلیل: خواسته؛ بستن در
  کد پیامکی هزینهٔ پیامک را هم می‌بندد.
- **۲۱۳. رضایت و نظر.** پیشنهاد: پس از «تحویل پست شد»، صفحهٔ سفارش برای صاحبش «از جزوه راضی بودی؟» دارد (یک تا پنج، و متن اختیاری تا ۵۰۰ نویسه)؛ هیچ
  نظری پیش از تأیید مالک عمومی نیست؛ تأییدشده‌ها روی صفحهٔ اصلی با نام کوچک و شهر، بی نام خانوادگی و موبایل؛ مالک هر نظر را پنهان یا پاک می‌کند (پاک
  یعنی پاک، با رویدادی بی متن). دلیل: خواسته («امکان حذف توسط من»)، و حریم خصوصی مشتری.
- **۲۱۴. تأیید رسید پرداخت.** پیشنهاد: لازم نیست: زیبال هر پرداخت را سرور به سرور تأیید می‌کند (۷٫۲) و پنل کد پیگیری و کارت پوشیده را نشان می‌دهد؛
  کارت‌به‌کارت با عکس رسید افزوده نمی‌شود. اگر روزی پرداخت بیرون از درگاه لازم شد، «ثبت پرداخت دستی» مالک با کد تازه، با برنامهٔ خودش. بازگشت وجه
  همان ثبت دستی ۷٫۳ است. دلیل: درگاه آزموده است («درست · زیبال پذیرفت»)؛ و رسید جعلی، کار دستی و نبود تطبیق خودکار.

**بیرون از نقشهٔ راه:** پیامک تبلیغاتی و ایمیل؛ درگاه دوم؛ بازپرداخت از درگاه زیبال (API ندارد)؛ اپ گوشی؛ رنگ از پنل (سؤال ۲۰۷)؛ کتابی (سؤال ۱۸۳)؛
وضعیت بسته درون صفحه (سؤال ۷۴).

**کار دستی صاحب پروژه:**
- ✅ **تأیید سؤال‌های ۱۷۸ تا ۲۱۴** (۱۴۰۵/۰۷/۲۱، همه طبق پیشنهاد). مانده: پنج پرسش باز، هر کدام پیش از PR خودش: معنی «کاور» (۱۸۵)، روش‌های
  ارسال (۱۹۱)، شیوهٔ حساب با چاپخانه‌ها (۲۰۳)، موجودی همهٔ چاپخانه‌ها یا یکی (۲۰۴)، و اینکه «بنر» تصویر است یا نوار اعلان (۲۰۶). ۱۸۵ بسته شد (۱۴۰۵/۰۷/۲۲)، و ۱۹۱، ۲۰۳ و ۲۰۶ هم
  (۱۴۰۵/۰۷/۲۶)، و ۲۰۴ (۱۴۰۵/۰۷/۲۸: همهٔ چاپخانه‌ها)؛ هر پنج بسته است.
- **پیش از ۸٫۳:** نرخ هر اندازه × یکرو یا دورو × رنگ، نرخ هر کاغذ، بازه‌های هر صحافی، و حداقل سفارش؛ یا همه را خودت پس از ۸٫۳ در ویرایشگر وارد کن.
- **پیش از ۹٫۲:** اگر قالب خودت را می‌خواهی، همان دو فایل بس است؛ نگاشت متغیرهایشان با ما.
- **پیش از ۱۱:** متن‌های نهایی، یا پیش‌نویس امروز می‌ماند و از پنل عوض می‌شود؛ خواندن و تأیید متن قوانین، حریم خصوصی و دربارهٔ ما (مرحلهٔ آخر برش ۷)
  همین‌جا جا می‌افتد.
- **پیش از ۱۳:** فهرست خدمات جانبی و قیمتشان.
- کار دستی ۷٫۶ (قالب چهارم sms.ir) و روشن کردن `live` (بالا، «برش ۷») سر جایشان‌اند؛ پیشنهاد ۱۷۹: `live` پس از برش ۸.

#### ۸٫۱: هشدارها فقط در پنل (#67، ادغام شد)

خواستهٔ ۱ و سؤال ۱۸۱: مشتری «کیفیت اسکن پایین» و «حاشیهٔ کم» را دیگر نمی‌بیند؛ «صفحهٔ خالی» و «فونت جایگزین» می‌مانند. هر چهار همان‌طور حساب و
ذخیره می‌شوند، و صفحهٔ سفارش پنل همه را برای هر فایل با شمارهٔ صفحه نشان می‌دهد، به مالک، متصدی و چاپخانه. بی مهاجرت.

| جا | کار |
|---|---|
| `packages/analysis/src/warnings.ts` (تازه؛ `@jozveyar/analysis/warnings`) | قاعدهٔ نمایش ADR-029 یک جا برای سرور سایت و پنل: `pageWarnings` (شمارهٔ صفحه‌های هر هشدار؛ حاشیه نه برای پاورپوینت و نه برای صفحه‌ای به شکل اسلاید)، `isDeck` (فرمت کارگر، وگرنه نوع سند) و `mismatchedFonts` (فقط رشته، کوتاه، تا ۵۰). جدا از `index.ts`، چون کارگر تحلیل مرورگر لازمش ندارد |
| `apps/web`: `lib/fileSummary.ts`، `lib/jozveView.ts`، `components/AnalysisCard.tsx`، `components/JozveFiles.tsx`، `lib/server/uploads.ts` | کیفیت و حاشیه نه در خلاصهٔ تحلیل مرورگر، نه در خلاصهٔ سرور، و نه در پاسخ `/api/uploads/<id>` (چهار فیلدش برداشته شد)؛ کارت فقط «صفحهٔ خالی» و «فونت جایگزین». مرورگر هشدار هر صفحه را همان‌طور با تحلیل خودش می‌فرستد (`browser-analysis`). سه متن دیگر هم «کیفیت» را وعده نمی‌دهند: یادداشت عکس («رنگی بودنش بعد از بررسی روی سرور معلوم می‌شود.») و وضعیت ردیف («رنگ بعد از بررسی روی سرور»، «بررسی رنگ در صف») |
| `apps/web/app/terms/page.tsx` | «فایل و محتوا»: «محتوای فایل همان‌طور که فرستاده شده چاپ می‌شود؛ کیفیت اسکن یا حاشیهٔ صفحه را درست نمی‌کنیم.»؛ «به‌روز شده» 1405/07/21 |
| `packages/db/src/panel.ts` | جزئیات سفارش برای هر فایل `conversion` سند و صفحه‌های هشداردار یا خالیِ تازه‌ترین تحلیل سرور (`flaggedPages`)، با یک کوئری `DISTINCT ON` برای همهٔ سندهای سفارش |
| `packages/text/src/format.ts` | `pageListParts`: همان فشرده‌سازی `formatPages` («صفحه‌های 3 تا 5، 9 و 2 صفحهٔ دیگر») به شکل داده، تا پنل هر عدد را در `.num` بگذارد؛ خروجی `formatPages` همان |
| `apps/admin`: `lib/orders.ts`، `components/Segments.tsx`، صفحهٔ سفارش، `admin.css` | `fileWarnings`: یک یادداشت `jy-note--warning` برای هر هشدار، زیر فهرست فایل‌های همان جزوه و پیش از مشخصات چاپ؛ تکهٔ تازهٔ `{ name }` برای نام فایل و فونت مشتری |
| تست‌ها | واحد (`warnings.test.ts`، `fileAnalysis`، `uploads`، `format`، `orders`)، پستگرس (`flaggedPages`)، سرتاسری سایت (`flow.spec.ts`، `jozve.spec.ts`، `site.spec.ts`؛ نمونهٔ تازهٔ `blank-mid-3.pdf`) و پنل (`warnings.spec.ts` تازه، فقط پنل و پایگاه داده) |

- **شمارهٔ صفحه در پنل سراسری جزوه است،** همان فایل چاپ و «چه عوض شد» (۵٫۱)، با نام فایل فقط در جزوهٔ چندفایلی: «کیفیت اسکن یا عکس پایین، کمی مات
  چاپ می‌شود: صفحه‌های 2 و 5 (فایل فیزیک - جلسه ۱.pdf)؛ صفحهٔ 13 (فایل ارائه - فصل ۲.pptx).» سایت شمارهٔ خود همان فایل را زیر همان ردیف می‌گوید (ADR-030).
- **فقط تازه‌ترین تحلیل سرور،** همان که قیمت سرور و `serverAnalysis` سایت با آن است؛ نه تحلیل مرورگر (که ممکن است دیرتر برسد) و نه دور قدیمی‌تر.
- **نام فارسی در `ad-ltr` به هم می‌ریخت:** پسوند وسط جمله می‌نشست («فایل pdf.فیزیک - جلسه ۱»). تکهٔ `{ name }` یک `bdi` بی جهت ثابت است (فارسی
  راست‌به‌چپ، لاتین چپ‌به‌راست)، و یادداشت «چه عوض شد» ۵٫۱، که همین مشکل را داشت، هم با همان درست شد.
- **مشتری چه می‌بیند:** همان کارت، بی دو هشدار؛ اسکن بی‌کیفیت دیگر «کمی مات چاپ می‌شود» نمی‌گیرد، و قوانین می‌گوید چاپ همان فایل است. سرتاسری سایت با
  پاسخ ساختگی API آپلود، تحلیلی را که مرورگر می‌فرستد می‌خواند: تشخیص DPI و حاشیهٔ مرورگر هنوز سنجیده می‌شود، فقط دیگر دیده نمی‌شود.
- **باندل اولیهٔ سایت** همان: build در یک مسیر، چهار اسکریپت با همان نام و sha256 main، و runtime webpack (همان ۳٬۵۴۳ بایت خام، gzip ۱٬۸۴۳ ← ۱٬۸۴۴)
  فقط هش تکه‌های تنبل را عوض کرد: ۱۰۷٬۶۳۴ در برابر ۱۰۷٬۶۳۳. HTML صفحهٔ اصلی همان main، جز شناسهٔ build و نام runtime (۵۹٬۶۰۹ بایت پس از نخستین
  بازسازی ISR؛ پاسخ اول پس از بالا آمدن، صفحهٔ زمان build، چند ده بایت فرق دارد).
- **پس از استقرار:** خودکار، بی کار دستی. هشدارهای سفارش‌های پیشین هم در پنل دیده می‌شوند، چون تحلیل هر صفحه از روز آپلود ذخیره است و با فایل پاک
  نمی‌شود (ADR-029).
- تصمیم‌های اجرا و سنجش‌ها در ADR-029، «اجرا در ۸٫۱»؛ رابط در `docs/UI.md`، «۸٫۱».

**طرح نمونهٔ میز سفارش (پیش از ۸٫۲):** ساخته و سنجیده شد، با #67 آمد، و تأیید شد (۱۴۰۵/۰۷/۲۲، همه طبق پیشنهاد؛ `docs/UI.md`، قدم ۱۱؛ سؤال‌های ۲۱۵ تا ۲۲۵): `desk.html` با شش حالت (پرسش
چیدمان، جزوه‌های جدا، منوی ردیف، حداقل سفارش، فرمت خاموش و سقف فایل، برگشت با گزینهٔ خاموش) و «دو جزوهٔ جدا» در `checkout.html`. اندازه، کاغذ و
صحافی‌ها (۸٫۳) و حداقل سفارش و فرمت (۸٫۴) هم در همین طرح‌اند تا میز یک بار طراحی شود؛ ساختنشان در PR خودشان است. ۸٫۲ خودش چند جزوه است:
`MAX_ITEMS_PER_ORDER` ۱۰ ← ۳۰، پیش‌نویس نسخهٔ ۲ که نسخهٔ ۱ را هم می‌خواند (ADR-036)، رابط میز، خلاصه، مرور و صفحهٔ سفارش با هر جزوه، و پایان
`items[0]` (بالا، «یافته‌ها»)؛ قرارداد، موتور قیمت، پایگاه داده، کارگر و پنل چند جزوه را از امروز دارند.

#### ۸٫۲: چند جزوه در یک سفارش (#68، ادغام شد)

خواستهٔ ۱۲ و سؤال ۱۸۲؛ طرح میز (`docs/UI.md`، قدم ۱۱؛ سؤال‌های ۲۱۵ تا ۲۱۹ و ۲۲۵). چند فایلی که با هم انداخته شوند یک پرسش دارند: «همه یک جزوه، یک
صحافی» (از پیش) یا «هر فایل جزوهٔ جدا»؛ هر جزوه کارت، قیمت و «تنظیمات چاپ» خودش را دارد؛ فایل با منوی ردیفش میان جزوه‌ها می‌رود؛ و خلاصه، مرور و
صفحهٔ سفارش هر جزوه را جدا نشان می‌دهند. قرارداد، موتور قیمت، پایگاه داده، کارگر و پنل از پیش چند جزوه را داشتند؛ اینجا رابط سایت است و دو سقف
قرارداد. بی مهاجرت و بی کار دستی.

| جا | کار |
|---|---|
| `packages/contracts/src/checkout.ts` | `MAX_ITEMS_PER_ORDER` ۱۰ ← ۳۰، و `MAX_FILES_PER_ORDER = 30` تازه: جمع سندهای همهٔ قلم‌ها در قیمت مسیر خرید و «پرداخت» (`too_many_files`)، همان سقف ۳۰ فایل امروز |
| `apps/web/lib/layout.ts` (تازه) | چیدمان جزوه‌ها، خالص و بی React: کدام فایل در کدام جزوه، به چه ترتیب، با کدام تنظیمات، و پرسش چیدمان (`startLayout`، `restoredLayout`، `reconcile`، `place`، `moveWithin`، `moveTo`، `arrange`، `configure`، `arrangement`). پرسش با اولین چیدمان دلخواه، یا وقتی کمتر از دو فایل ماند، می‌رود و برنمی‌گردد |
| `lib/jozveController.ts`، `lib/jozve.ts`، `lib/useJozve.ts` | صف همهٔ فایل‌های سفارش است، هر جزوه‌ای که باشند: یک pdf.js و یک آپلود در کل سفارش. `add` کلید فایل‌های تازه را برمی‌گرداند تا رابط جایشان را بگذارد؛ «جایگزین کن» کلید را نگه می‌دارد، پس فایل تازه سر جای همان فایل در همان جزوه می‌نشیند؛ `move` رفت (ترتیب با چیدمان است) |
| `lib/jozveView.ts` | `jozveItem` و `orderSpec`: یک قلم برای هر جزوه‌ای که صفحه دارد، و جای قلم هر جزوه در ریز قیمت؛ نمای هر فایل یک بار برای هر شکل فایل (`WeakMap`) |
| `lib/checkout/gate.ts` | `orderGate(parts)`: «ادامه» روی همهٔ فایل‌های همهٔ جزوه‌ها، و یک قلم برای هر جزوه با تنظیمات خودش |
| `components/OrderDesk.tsx`، `DeskParts.tsx` (تازه)، `JozveFiles.tsx`، `AnalysisCard.tsx`، `ConfigPanel.tsx`، `AddFiles.tsx`، `OrderSummary.tsx`، `app/home.css` | میز طرح قدم ۱۱: پرسش چیدمان (`AskLater`)، یک کارت برای هر جزوه با «تنظیمات چاپ» همان جزوه ته کارت (یک جزوه همیشه باز؛ چند جزوه یکی باز و بقیه یک خط)، منوی «جابه‌جایی» ردیف (`RowMenu`)، «افزودن فایل به همین جزوه» متنی درون کارت، «جزوهٔ تازه» خط‌چین کنار «از اول»، و خلاصه و نوار موبایل با «جمع · N جزوه» |
| `components/checkout/Checkout.tsx`، `parts.tsx`، `recap.tsx`، `sum.tsx` (تازه)، `app/checkout.css`، `app/order/[token]/page.tsx` | خلاصهٔ مسیر خرید «2 جزوه، 3 فایل» با فایل‌های هر جزوه، مرور «جزوه‌ها»، یک ردیف قیمت برای هر جزوه، و متن جمع صفحهٔ سفارش («جزوه‌هایت در صف چاپ‌اند»، «… در حال چاپ‌اند»، «… به پست رسیدند»). یک جزوه همان امروز |
| `lib/draft.ts`، `lib/restore.ts`، `components/Restore.tsx` | پیش‌نویس نسخهٔ ۲: فایل‌ها جزوه به جزوه، و چیدمان (شمار فایل و تنظیم هر جزوه، و پرسش)؛ نسخهٔ ۱ یک جزوه با همان تنظیمات |
| تست‌ها | واحد: `layout.test.ts` (تازه)، دروازه، `orderSpec`، کلیدهای صف، پیش‌نویس نسخهٔ ۱ و ۲، و سقف‌های سرور؛ سرتاسری: `jozve.spec.ts` (پرسش، جزوه‌های جدا، منوی ردیف، «جزوهٔ تازه»، ۳۲۰ و ۳۹۰ پیکسل، برگشت چندجزوه و پیش‌نویس نسخهٔ ۱)، `card.spec.ts` و `desk.spec.ts` (هدف لمسی و ترتیب Tab)، و `checkout.spec.ts` (دو جزوه تا «سفارش ثبت شد»، و دو قلم با تنظیمات خودشان در پایگاه داده) |

- **قیمت:** یک `quote()` برای کل سفارش، با یک قلم برای هر جزوه؛ قیمت سر کارت هر جزوه همان قلم ریز قیمت است، و جمع یکی؛ کرایه یک بار با وزن همه
  (همان موتور، سؤال ۱۸۲). سرور همان قلم‌ها را از نو قیمت می‌کند؛ `createOrder`، کارگر و پنل از پیش روی همهٔ قلم‌ها می‌چرخیدند.
- **سقف‌ها:** ۳۰ فایل در کل سفارش، نه در هر جزوه: رابط همان `MAX_SECTIONS_PER_ITEM` امروز را سقف کل می‌گیرد («سفارش بیش از 30 فایل نمی‌گیرد…»)،
  و سرور جمع سندهای همهٔ قلم‌ها را؛ و ۳۰ جزوه.
- **پیش‌نویس:** نسخهٔ ۲ همان جای نسخهٔ ۱ (`jy.draft`) است. زبانه‌ای که پیش از استقرار باز بود با نسخهٔ ۱ برمی‌گردد، یک جزوه با همان تنظیمات. چیدمانی
  که با فایل‌ها نمی‌خواند (دستکاری‌شده) همه را یک جزوه می‌کند، و تنظیم خراب یک جزوه فقط همان را پیش‌فرض.
- **عددها** (build تولیدی، درون صفحه، یکی‌درمیان با main، ۳۰ دور، پردازندهٔ ۴× کند، میانه): اولین قیمت main ۴۲۴٫۹ و ۸٫۲ ۴۱۲٫۳ میلی‌ثانیه؛ قیمت
  کامل سه‌فایلی ۵۷۶٫۹ و ۵۹۰٫۰ (میانگین ۶۰۰٫۸ و ۶۰۴٫۵). کار اسکریپت رشتهٔ اصلی تا قیمت سه‌فایلی حدود ۲۸ میلی‌ثانیه بیشتر است: کارت پرسش، منوی هر
  ردیف و «جزوهٔ تازه». باندل اولیه ۱۰۷٬۵۷۱ بایت (main ۱۰۷٬۶۳۴)؛ تکهٔ رابط پس از فایل ۱۷٬۵۸۵ ← ۲۱٬۶۰۶ بایت فشرده، مسیر خرید ۲۴٬۵۵۲ ← ۲۴٬۹۸۸، و
  برگرداندن ۲٬۴۶۷ ← ۲٬۷۵۹. جزئیات و راه رسیدن به این عددها در `docs/UI.md`، «۸٫۲».
- **پس از استقرار:** خودکار، بی کار دستی. سفارش‌های پیشین همان یک قلم‌اند؛ مسیر خرید سایت زنده همچنان `off`.
- تصمیم‌های اجرا در ADR-030 و ADR-036، «اجرا در ۸٫۲»؛ رابط در `docs/UI.md`، «۸٫۲».

#### ۸٫۳: کاتالوگ چاپ (#69، ادغام شد)

خواسته‌های ۲ و ۴ و سؤال‌های ۱۸۳ تا ۱۸۹؛ طرح میز (`docs/UI.md`، قدم ۱۱؛ سؤال‌های ۲۲۰، ۲۲۱ و ۲۲۴). اندازهٔ کاغذ (A4، A5، A3)، نرخ هر رو برای هر اندازه
و یکرو یا دورو و رنگ، کاغذها با نرخ هر برگ هر اندازه، و صحافی‌ها با کمینه، سقف، «بالای سقف چند جلد یا نمی‌خورد» و بازه‌های هر اندازه؛ از قرارداد و موتور
قیمت تا پایگاه داده، میز سفارش، مسیر خرید، فایل چاپ، برگه و صفحهٔ سفارش پنل، و ویرایشگر کامل تعرفه. «کاور» یک صحافی است که مالک از پنل می‌افزاید (سؤال
۱۸۵، پاسخ صاحب پروژه ۱۴۰۵/۰۷/۲۲)، پس دادهٔ پایه همان تحریر و طلق و سیم است و قیمت هیچ نسخه و سفارشی عوض نمی‌شود. تصمیم‌ها در ADR-054.

| جا | کار |
|---|---|
| `packages/contracts` | `PriceList` شکل ۸٫۳: `printRates[اندازه][رو][رنگ]` (A4 لازم)، `paperTypes[id].sheetRates[اندازه]`، `bindingTypes[id]` با `minSheets`، `splitsVolumes` و `bands[اندازه]`؛ `settings.sheetAreaM2` رفت. `ItemSpec.paperSize` لازم، و در ریز قیمت؛ قلم مسیر خرید `paperSize` با پیش‌فرض `a4` برای زبانه‌ای که پیش از استقرار باز بود. هشدارهای `paper_size_unavailable` و `binding_does_not_fit` |
| `packages/pricing` | نرخ اندازه و روی همان جزوه، نرخ کاغذ همان اندازه، بازه‌های همان اندازه، و وزن با مساحت همان اندازه (`sheetAreaM2`)؛ `PAPER_SIZES`، `offeredSizes`، `sheetsOf`، `volumesOf` و `bindingMisfit` (کمینه روی نازک‌ترین جلد) یک جا برای موتور، میز و پنل. دادهٔ پایه به شکل تازه، با همان قیمت |
| `packages/db` | مهاجرت‌های `0037` (تولیدی، با یک جابه‌جایی دستی)، `0038` (دست‌نویس) و `0039` (تولیدی): `print_rates`، `paper_rates`، اندازه در `binding_rate_bands` و `order_items`، `min_sheets` و `splits_volumes`؛ پر کردن هر نسخهٔ امروز با «یک نرخ برای یکرو و دورو، فقط A4»؛ و پاک شدن `click_rate_*`، `rate_per_sheet_rials` و پیش‌فرض‌های `'a4'`. محافظ‌ها: انجماد دو جدول تازه، `print_rates_complete` (معوق)، `EXCLUDE` بازه‌ها در هر اندازه، `binding_types_sheets`، `print_rates_positive`، `paper_rates_nonnegative`، و اندازه در `order_items_frozen`. `price-list.ts` و `seed.ts` (خواندن و نوشتن)، `tariff.ts` (ذخیرهٔ پیش‌نویس همهٔ ردیف‌ها را از نو می‌نویسد)، `orders.ts` (اندازهٔ قلم) و `panel.ts` (اندازه‌های هر سفارش در فهرست) |
| `apps/web` | `lib/catalog.ts` (تازه): کدام اندازه، کاغذ و صحافی برای این جزوه هست، ارزان‌تر اول، و `effectiveConfig`: انتخابی که دیگر نمی‌خورد در قیمت جایش را به پیش‌فرض همان ردیف می‌دهد، با دلیل، و انتخاب خود جزوه می‌ماند. `ConfigPanel` کاشی اندازه (ردیف سه‌تایی) و کاغذ با بیش از یک گزینه، صحافی با کاشی خاموش و دلیل، و یادداشت جایگزینی؛ `OrderDesk` تنظیمات جزوه‌ای که جایگزینی دارد باز. صفحهٔ اصلی (`Tariff`، `Faq`) هر اندازه، یکرو و دوروی جدا وقتی فرق دارند، و کاغذ و صحافی‌های دیگر. مسیر خرید، پیش‌نویس (اندازه، و A4 برای پیش‌نویس پیش از ۸٫۳) و صفحهٔ سفارش با اندازه در مشخصات («سیاه‌سفید، دورو، A5، منگنه») |
| `packages/ui` | دو جزء کیت (۲۲۱): کاشی خاموش (لبهٔ خط‌چین، عنوان کم‌رنگ) و `jy-tiles--3` (سه‌تایی از ۵۲۱ پیکسل) |
| `services/docworker` | فایل چاپ هر جلد به اندازهٔ جزوه (`printfile.paper_rect`، `PageState.size`)، اندازهٔ ناشناس شکست قطعی `paper_size_unknown` پیش از هر دانلود؛ برگه اندازه را در جعبهٔ حالت دارد |
| `apps/admin` | ویرایشگر کامل (`lib/tariff.ts`، `TariffEditor`، `TariffCards`، `admin.css`): اندازه‌ها با تیک، چهار نرخ هر اندازه، کاغذها و صحافی‌ها با افزودن، حذف و روشن، بازه‌های هر اندازه، پیش‌نمایش گزینه‌های تازه، و «چه عوض می‌شود» کاتالوگ؛ صفحهٔ سفارش اندازه را در مشخصات و ردیف هر جلد دارد، و «چه عوض شد» با اندازهٔ جزوه |
| تست‌ها | واحد: قرارداد (قلم بی اندازه، کاتالوگ)، موتور (نرخ هر اندازه و رو، کاغذ هر اندازه، وزن، کمینه و سقف و «نمی‌خورد»، کمینه روی نازک‌ترین جلد)، `catalog.test.ts` (تازه)، پیش‌نویس پیش از ۸٫۳، سرور مسیر خرید (A5، و زبانهٔ بی اندازه)، و پنل (`tariff.test.ts` بازنویسی برای کاتالوگ، سرویس تعرفه، صفحهٔ سفارش)؛ پایگاه داده: محافظ‌های تازه و `catalog-migration.test.ts` (تازه: تا 0036، دادهٔ شکل قدیم، بقیهٔ مهاجرت‌ها)؛ کارگر: فایل چاپ A5، اندازهٔ ناشناس، برگه؛ سرتاسری: `tariff.spec.ts` پنل (کاتالوگ: A5، کاغذ و صحافی تازه، پیش‌نمایش، پایگاه داده، «چه عوض می‌شود»، حذف و خاموش؛ و گوشی با قاب‌ها و بازه‌ها) و `tariff.spec.ts` سایت (کاتالوگ در صفحهٔ اصلی و میز، ارزان‌تر اول، منگنهٔ جزوهٔ کلفت، و سفارش A5 با منگنه تا پایگاه داده) |

- **قیمت:** هیچ عددی عوض نمی‌شود: دادهٔ پایه و هر نسخهٔ پایگاه داده پس از مهاجرت همان قیمت را می‌دهند (۱۴۷ صفحهٔ دورو سیاه‌سفید ۲۳۵٬۲۰۰ + ۴۵٬۰۰۰ تومان، تست
  مهاجرت از شکل قدیم). نرخ دیگر فقط با نسخهٔ تازه‌ای که مالک فعال کند می‌آید.
- **پیش‌فرض‌های همیشگی:** تحریر و طلق و سیم حذف و خاموش نمی‌شوند و هر اندازهٔ ارائه‌شده را دارند، و طلق و سیم از برگ ۱ چند جلد می‌شود؛ پنل این را پیش از
  ذخیره و فعال کردن می‌سنجد، پس هر جزوه‌ای همیشه کاغذ و صحافی‌ای دارد.
- **روشن و خاموش:** جزو نسخه است (مالک، با فعال کردن)؛ گزینهٔ خاموش در سایت دیده نمی‌شود. لایهٔ زنده (خاموش موقت بی نسخهٔ تازه، مالک و متصدی، با «موقتاً در
  دسترس نیست»؛ سؤال‌های ۱۸۸ و ۲۲۰) و ویرایش حداقل سفارش، مالیات و گرد کردن با ۸٫۴.
- **عددها** (build تولیدی، درون صفحه، یکی‌درمیان با main، پردازندهٔ ۴× کند، میانه): اولین قیمت ۳۰ دور main ۶۲۷٫۵ و ۸٫۳ ۵۹۲٫۸ میلی‌ثانیه؛ قیمت کامل
  سه‌فایلی ۴۰ دور ۸۰۵٫۶ و ۸۱۴٫۱. ماشین آن روز از سنجش ۸٫۲ کندتر بود، پس عددها فقط با main همان روز مقایسه‌پذیرند. باندل اولیه ۱۰۷٬۵۶۸ بایت (main
  ۱۰۷٬۵۶۹)؛ تکهٔ رابط پس از فایل ۲۱٬۶۰۶ ← ۲۲٬۸۹۷ بایت فشرده (کاتالوگ، کاشی‌ها و یادداشت جایگزینی)، مسیر خرید ۲۴٬۹۸۸ ← ۲۵٬۰۱۳؛ HTML صفحهٔ اصلی
  ۵۹٬۶۰۹ ← ۵۹٬۸۲۱ بایت. کل `pnpm test` با پستگرس ۱٬۳۳۲، سرتاسری پنل ۹۰، بی سرور ۱۵۱ از ۱۵۲، «مسیر خرید، سرتاسری» ۳۳ از ۳۴ و تعرفهٔ سایت ۴؛ شاهد جهش
  ۳۰، همه افتادند. جزئیات در `docs/UI.md`، «۸٫۳».
- **پس از استقرار:** خودکار، بی کار دستی: مهاجرت‌های `0037` تا `0039` با بالا آمدن وب، و نسخهٔ فعال همان قیمت. تا مالک A5، کاغذ یا صحافی تازه‌ای در
  نسخهٔ تازه نگذارد و فعالش نکند، سایت همان است. مسیر خرید سایت زنده همچنان `off`.
- تصمیم‌ها در ADR-054، و «اجرا در ۸٫۳» ADR-040 و ADR-043؛ رابط در `docs/UI.md`، «۸٫۳».

#### ۸٫۴: حداقل سفارش، قاعده‌های فایل و خاموش موقت گزینه‌ها (#70، ادغام شد)

خواستهٔ ۱۰، سؤال‌های ۱۸۸ و ۱۹۰ و باقی ۱۸۹ (کارت «بقیه» ویرایشگر)؛ طرح میز (`docs/UI.md`، قدم ۱۱؛ سؤال‌های ۲۲۰، ۲۲۲، ۲۲۳ و ۲۲۴). حداقل سفارش با «ادامه»ی
بسته و مانده؛ فرمت، حجم و صفحهٔ هر فایل از «تنظیمات»؛ خاموش موقت اندازه، کاغذ و صحافی تعرفهٔ فعال از «تعرفه»، بی نسخهٔ تازه؛ و گرد کردن، حداقل سفارش و
وزن بسته‌بندی در ویرایشگر. بی مهاجرت. تصمیم‌ها در ADR-055.

| جا | کار |
|---|---|
| `packages/contracts` | `@jozveyar/contracts/files` (تازه، و از index هم): `FILE_FAMILIES` (Word، پاورپوینت، عکس)، سقف‌های قرارداد (۱٬۵۳۶ مگابایت، ۱٬۵۰۰ صفحه) و `DEFAULT_FILE_RULES`؛ جدا از `constants`، که در پوسته است. چهار تنظیم تازه در `SETTING_SCHEMAS`: `file.formats`، `file.max_mb`، `file.max_pages` و `catalog.paused` (`sizes` فقط A5 و A3؛ شناسه با قاعدهٔ ویرایشگر). کدهای مسیر خرید `too_many_pages` و `option_unavailable` |
| `packages/pricing` | `pausedOf`: فقط گزینهٔ روشن و ارائه‌شدهٔ همین تعرفه، و هرگز A4، کاغذ پیش‌فرض یا صحافی پیش‌فرض؛ `minOrderGapRials`: همان قاعدهٔ `below_min_order` (جمع چاپ، کاغذ و صحافی، پیش از کرایه). یک جا برای میز، صفحهٔ اصلی، سرور مسیر خرید و پنل؛ هیچ‌کدام قیمت را دست نمی‌زند |
| `packages/db` | پیش‌فرض چهار تنظیم در `DEFAULT_SETTINGS`، که دادهٔ پایه با بالا آمدن وب می‌نشاند (همهٔ فرمت‌ها، ۱٬۵۳۶ مگابایت، ۱٬۵۰۰ صفحه، هیچ گزینهٔ خاموش)؛ مجوز `tariff.pause` برای مالک و متصدی |
| `apps/web`، سرور | آپلود خانوادهٔ خاموش را با ۴۱۵ `format_off` و فایل بزرگ‌تر از `file.max_mb` را با ۴۱۳ رد می‌کند (`file.max_bytes`، که هرگز در `settings` ننشسته بود، رفت؛ پیش‌فرض همان ۱٬۵ گیگابایت). قیمت و ثبت سفارش فایلی را که شمارش سرور از `file.max_pages` بیشتر می‌داند با ۴۲۲ `too_many_pages` (با شناسه‌ها و سقف)، و جزوه‌ای را که با گزینهٔ خاموش قیمت خورده با ۴۰۹ `option_unavailable` (با فهرست همین لحظه) رد می‌کنند. صفحهٔ اصلی قاعده‌ها و روزهای فایل آپلود را با ISR می‌خواند (`lib/server/fileRules.ts`)، و گزینه‌های خاموش را همراه JSON تعرفه (`paused`، پس از `pausedOf`) |
| `apps/web`، رابط | کارت بارگذاری و `accept` هر فایل‌گزین فقط خانواده‌های روشن. پوسته فقط حجم را پیش از خواندن می‌سنجد، و سقف صفحه به کارگر تحلیل می‌رود که پیش از رندر می‌ایستد؛ خانوادهٔ خاموش در نمای جزوه؛ هر «پذیرفته نشد» با عدد خود فایل و راه جلو (`lib/fileRules.ts`)، و «اول تکلیف فایل‌های پذیرفته‌نشده را روشن کن». «ادامه» زیر حداقل سفارش بسته با مانده، با یادداشت خلاصه و نوار موبایل. کاشی «موقتاً در دسترس نیست» و جایگزینی با یادداشت (`effectiveConfig` با `paused`). ۴۰۹، ۴۲۲ و `quote_warnings` وسط مسیر خرید: متن خودشان و «برگرد به جزوه و قیمت»، و میز فهرست و سقف همین لحظه را از پاسخ می‌گیرد. ردیف «گرد کردن» در خلاصه، مسیر خرید و صفحهٔ سفارش. صفحهٔ اصلی بی گزینهٔ خاموش، و فرمت‌ها و روزهای فایل از تنظیم |
| `apps/admin` | «تنظیمات»، کارت «فایل‌ها» (فقط مالک، `settings.edit`): سه تیک خانواده، حجم و صفحه با یک «ذخیره»، «همان که دیده شد» برای هر سه، خطای هر عدد زیر خودش، و رویداد `settings.update` با قبل و بعد. «تعرفه»، کارت «در دسترس بودن» (همه می‌بینند؛ مالک و متصدی خاموش و روشن می‌کنند): هر اندازه جز A4 و هر کاغذ و صحافی روشن جز پیش‌فرض‌ها، «موقتاً خاموش کن» و «دوباره روشن کن»، رویداد `tariff.availability`. ویرایشگر: کارت «بقیه» با گرد کردن، حداقل سفارش و وزن بسته‌بندی، «نسخهٔ فعال: ندارد» برای صفر، هشدار ده برابر، و مالیات فقط‌خواندنی؛ «چه عوض می‌شود» و پیش‌نمایش همان‌ها را دارند |
| تست‌ها | واحد: موتور (`pausedOf`، `minOrderGapRials`)، `fileRules.test.ts` و `server/fileRules.test.ts` (تازه)، کارگر تحلیل (`too_many_pages` با شمار صفحه)، صف و نمای جزوه (حجم، صفحه، خانوادهٔ خاموش، رد سرور)، میز (`effectiveConfig` با گزینهٔ خاموش)، JSON صفحه، سرور آپلود و مسیر خرید (۴۱۵، ۴۱۳، ۴۲۲ و ۴۰۹)، و پنل («بقیه»، کارت در دسترس بودن، `togglePaused`، سرویس با مجوز و «همان که دیده شد»، کارت «فایل‌ها» و رویدادها). سرتاسری: `tariff.spec.ts` سایت (حداقل سفارش، گزینهٔ خاموش، Word خاموش و سقف صفحه، ۴۰۹ وسط خرید، برگشت بعد از رفرش، و ردیف «گرد کردن» با کرایه)، `tariff.spec.ts` پنل («بقیه» و در دسترس بودن با مالک، متصدی و گوشی) و `settings.spec.ts` پنل («فایل‌ها») |

- **حداقل سفارش** (۱۹۰، ۲۲۲): روی جمع چاپ، کاغذ و صحافی همهٔ جزوه‌ها، پیش از کرایه (همان `below_min_order`). زیرش «ادامه» «تا حداقل سفارش 32,400 تومان
  مانده» است، بسته ولی در ترتیب Tab؛ یادداشت خلاصه «حداقل سفارش 50,000 تومان است، پیش از ارسال؛ 32,400 تومان مانده. نسخهٔ بیشتر بگیر، یا جزوهٔ دیگری اضافه
  کن.»؛ و نوار موبایل همان مانده به جای خط ارسال. مانده رو به بالا تا تومان گرد می‌شود. سرور همان `quote_warnings` را می‌دهد و مسیر خرید به میز برمی‌گرداند.
- **قاعده‌های فایل** (۱۹۰، ۲۲۳): PDF همیشه. خانوادهٔ خاموش در کارت بارگذاری و `accept` نیست، و فایلش «فایل Word فعلاً پذیرفته نمی‌شود — از Word خروجی PDF
  بگیر و همان را جایش بینداز.»؛ حجم «هر فایل تا 1,024 مگابایت پذیرفته می‌شود — این فایل 1,288 مگابایت است…»، و صفحه همین‌طور با عدد شمارش. فایل رد‌شده در
  قیمت نیست، «جایگزین کن» و «حذف از جزوه» دارد، و «ادامه» تا روشن شدن تکلیفش بسته است. مرورگر همان لحظه می‌سنجد (حجم پیش از خواندن؛ صفحهٔ PDF در کارگر
  تحلیل پیش از رندر، و Word و پاورپوینت با شمارش سرور) و سرور دوباره (قاعدهٔ ۲): آپلود فرمت و حجم را، و ثبت سفارش صفحه را با شمارش خودش. فرمت مثل امروز با
  پسوند سنجیده می‌شود. فایلی که پیش از تغییر تنظیم رسیده دوباره سنجیده نمی‌شود، جز سقف صفحه در ثبت سفارش.
- **خاموش موقت** (۱۸۸، ۲۲۰، ۲۲۴): تنظیم `catalog.paused`، جدا از نسخه و بی کد تازه، چون قیمت را دست نمی‌زند و برگشت‌پذیر است؛ زیر قفل تنظیم‌ها، «همان که
  دیده شد» (حالی که کارت نشان داد) و رویداد در همان تراکنش. خاموشی مال گزینه است، نه نسخه: کار روی یک گزینه بقیهٔ فهرست را دست نمی‌زند، حتی گزینه‌ای که
  در نسخهٔ فعال نیست، پس اندازه یا کاغذی که در نسخهٔ بعد برگردد خاموش برمی‌گردد تا کسی روشنش کند. A4، کاغذ و صحافی پیش‌فرض خاموش نمی‌شوند، پس جای
  هر انتخاب همیشه هست. صفحهٔ اصلی تا یک دقیقه، سرور مسیر خرید همان لحظه. پیش‌نویس رفرش هم همان جایگزینی را با یادداشت می‌گیرد، و انتخاب خود جزوه می‌ماند
  و با روشن شدن دوباره برمی‌گردد. سفارش‌های ثبت‌شده دست نمی‌خورند.
- **مالیات فقط‌خواندنی (سؤال ۲۲۶، طبق پیشنهاد بسته شد، ۱۴۰۵/۰۷/۲۳):** موتور قیمت مالیات را روی چاپ، صحافی و کرایه می‌گیرد، ولی فقط وقتی کرایه معلوم است: «جمع» میز، «ارسال از …» و جمع پیش
  از شهر مالیات ندارند. با مالیاتِ بیش از صفر، مشتری در قدم شهر عددی بزرگ‌تر از آنچه دید می‌دید، که خلاف «قیمت قبل از هویت» و بی‌صدا نبودن است. پس کارت
  «بقیه» مالیات را فقط نشان می‌دهد (امروز صفر)، و صاحب پروژه همین پیشنهاد را تأیید کرد (۱۴۰۵/۰۷/۲۳): **۲۲۶. مالیات.** پیشنهاد: تا نماد الکترونیک و صورت‌حساب
  رسمی نیامده صفر بماند؛ روزی که لازم شد، «جمع» میز هم با مالیات باشد (یک ردیف «مالیات» در خلاصه، با همان موتور) و بعد از پنل عوض‌شدنی. دلیل: مشتری همان
  عدد را از اول تا پرداخت می‌بیند.
- **گرد کردن:** با گام غیرصفر، جمع با ردیف‌ها نمی‌خواند؛ پس خلاصه، مسیر خرید و صفحهٔ سفارش ردیف «گرد کردن» دارند (مثبت، یا «−»)، فقط وقتی صفر نیست و فقط
  روی همان جمعی که زیر ردیف‌هاست.
- **عددها** (build تولیدی، درون صفحه، یکی‌درمیان با main، پردازندهٔ ۴× کند، میانه): اولین قیمت دو دور ۳۰ و ۴۰ تایی، main ۲۹۸٫۵ و ۳۰۲٫۷ و ۸٫۴ ۳۱۲٫۷ و
  ۳۱۷٫۶ میلی‌ثانیه (میانگین ۳۰۶٫۳ و ۳۱۳٫۰ در برابر ۳۱۴٫۸ و ۳۲۳٫۵)؛ قیمت کامل سه‌فایلی ۴۰ دور، ۴۲۳٫۰ و ۴۱۸٫۵ (میانگین ۴۲۵٫۱ و ۴۲۷٫۹). همان DOM و همان سه commit تا
  قیمت؛ پروفایل پردازنده حدود ۵ میلی‌ثانیه کار بیشتر React در هر بار. باندل اولیه ۱۰۷٬۶۰۶ بایت (main ۱۰۷٬۵۶۵ با همان مسیر build)؛ تکهٔ رابط پس از فایل ۲۳٬۰۷۸ ←
  ۲۵٬۹۹۲ بایت فشرده و هنوز یک تکه؛ HTML صفحهٔ اصلی ۵۹٬۸۴۹ ← ۶۰٬۱۳۴ بایت. کل `pnpm test` با پستگرس ۱٬۳۸۱، سرتاسری پنل ۹۴، بی سرور
  ۱۵۲، «مسیر خرید، سرتاسری» ۳۳ از ۳۴ و تعرفهٔ سایت ۵؛ شاهد جهش ۳۵ (۱ پایگاه داده، ۳۲ واحد و ۲ سرتاسری)، همه افتادند. جزئیات در `docs/UI.md`، «۸٫۴».
- **پس از استقرار:** بی مهاجرت و بی کار دستی: دادهٔ پایه چهار تنظیم را با پیش‌فرض می‌نشاند، پس سایت همان امروز است (همهٔ فرمت‌ها، ۱٬۵۳۶ مگابایت، ۱٬۵۰۰
  صفحه، هیچ گزینهٔ خاموش، حداقل سفارش صفر). مالک از «تنظیمات» و «تعرفه» عوضشان می‌کند؛ حداقل سفارش و گرد کردن با نسخهٔ تازهٔ تعرفه و فعال کردنش. مسیر
  خرید سایت زنده همچنان `off`.
- تصمیم‌ها در ADR-055، و «اجرا در ۸٫۴» ADR-040؛ رابط در `docs/UI.md`، «۸٫۴».

#### ۹٫۱: فهرست جمع‌وجور، مشخصات فایل‌ها و zip هر سفارش (#71، ادغام شد)

خواستهٔ ۱۱، سؤال ۱۹۲؛ طرح پنل (`docs/UI.md`، قدم ۱۱، «پیش از ۹٫۱»؛ سؤال‌های ۲۲۷ تا ۲۳۴). «سفارش‌ها» یک ردیف کوتاه برای هر سفارش که با کلیک مشخصات فایل‌های
همان سفارش را باز می‌کند، و «همهٔ فایل‌ها (zip)» هر سفارش در فهرست و صفحهٔ سفارش. بی مهاجرت. تصمیم‌ها در ADR-056.

| جا | کار |
|---|---|
| `packages/db` | ردیف فهرست `partnerName` دارد (نام چاپخانهٔ امروز سفارش، زیرکوئری همان کوئری فهرست) و برگه `storageKey`. `specs(scope, orderIds)` تازه: مشخصات همهٔ ردیف‌های یک صفحه با یک فراخوانی، محدوده در خود کوئری (ADR-042)؛ جزوه‌ها، فایل‌ها، قاعده‌ها، فایل‌های چاپ و هشدارها با `itemsOf` و برگه با `ticketsOf`، که `details()` هم حالا همان‌ها را دارد؛ کار PDF و برگه؛ و آخرین تخصیص و آخرین ویرایش گیرنده به جای همهٔ تخصیص‌ها و رویدادها. ده کوئری برای کل صفحه |
| `apps/admin/lib/server/zip.ts` | تازه: zip جریانی دست‌نویس. روش stored، data descriptor و CRC-32 حین جریان (`zlib.crc32`، و جدول وقتی Node ندارد)، اندازهٔ دقیق از پیش (`zipSize`)، ZIP64 فقط جایی که لازم است: فایلی که به ۴ گیگابایت می‌رسد (extra محلی و descriptor هشت‌بایتی برای همان فایل)، شروع فایل یا فهرست مرکزی بالای آن، یا بیش از ۶۵٬۵۳۴ فایل (extra مرکزی و پایان ZIP64)، زمان DOS به وقت تهران، و نام فقط ASCII. فایلی که کمتر یا بیشتر از اندازه‌اش بدهد جریان را با خطا می‌بندد؛ لغو دانلود خواندن فایلِ باز را هم می‌بندد |
| `apps/admin/lib/orders.ts` | `specLine` و `specSum` (خط مشخصات و خط جمع هر جزوه)؛ `zipView` (پرداخت‌نشده، پاک‌شده، بسته، آماده با فایل‌ها و حجم، منتظر فایل چاپ یا برگه با علت، ساخته نشد) و `zipNote`؛ `ticketView` با آخرین تخصیص و ویرایش هم؛ رویداد `orders.zip_download` در رویدادهای سفارش، از چشم چاپخانه هم؛ و `specWithoutMoney` |
| `apps/admin/lib/server/orders.ts` | فهرست با `specs` (بی مبلغ بی `orders.money`) و `canZip`؛ `downloadZip`: `files.download`، محدوده (بیرون از آن ۴۰۴)، پاک‌شده ۴۱۰، `zip_not_ready` ۴۰۹، HEAD همهٔ فایل‌ها پیش از پاسخ (نبودن یکی ۵۰۳)، رویداد با شمار فایل، و جریان با `Content-Length` دقیق |
| `apps/admin/app`، `components` | مسیر `orders/[number]/zip` (تازه)، با همان برگشت به صفحهٔ سفارش و پیام دانلودهای دیگر؛ «سفارش‌ها» با `OrderFolds` (`details` برای هر ردیف) و `OrderSpec` (کارت هر جزوه، zip و «صفحهٔ کامل سفارش»)؛ `ZipButton` در فهرست و ستون کنار صفحهٔ سفارش؛ `FileWarnings` از صفحهٔ سفارش جدا شد تا مشخصات همان را داشته باشد. «همهٔ فایل‌های سفارش 10033 (zip، 3 فایل) دانلود شد» در «رویدادها» |
| تست‌ها | پایگاه داده: `specs` برابر همان که از `details()` درمی‌آید، شناسهٔ ناشناس و بیرون از محدوده نه، ورودی خالی، ویرایش گیرنده، و نام چاپخانهٔ هر ردیف. واحد: `zip.test.ts` (تازه؛ خوانندهٔ خودش، CRC با `zlib` Node، زمان تهران، ZIP64 با آستانهٔ کوچک، فایل کوتاه، بلند و گم‌شده، لغو، و نام و اندازهٔ نادرست)، خط مشخصات و جمع، آمادگی zip و ترتیب دلیل‌هایش، برگهٔ فهرست، رویداد، و سرویس (مجوز، محدوده، آمادگی، استوریج، رویداد، مشخصات بی مبلغ). سرتاسری: `orders.spec` (باز و بسته شدن ردیف و مشخصات)، `print.spec` (zip بسته تا فایل چاپ و برگهٔ تازه، دو جلد و دو جزوه با sha256 هر فایل درون zip، رویدادها، پس از پاک شدن)، `scope.spec` (چاپخانه: zip سفارش خودش، فهرست بی مبلغ و نام چاپخانه، سفارش دیگری ۴۰۴) و `warnings.spec` (هشدارها فقط در مشخصات باز)، و ۳۲۰، ۳۹۰ و ۱۲۸۰ پیکسل با ردیف‌های باز |

- **ردیف** (۲۲۷، ۲۲۸): `details` با کل ردیف در `summary`؛ کلیک، Enter یا فاصله باز و بسته می‌کند، بی JS، و چند ردیف با هم باز می‌مانند. همان ستون‌ها، با فلش کنار
  شماره و نام چاپخانه زیر وضعیت فقط برای مالک و متصدی. صف پیشخوان پیوند می‌ماند. مشخصات ردیفی که در فاصلهٔ دو کوئری پیدا نشد فقط «صفحهٔ کامل سفارش» است.
- **مشخصات** (۲۲۹، ۲۳۰، ۲۳۴): کارتی برای هر جزوه («جزوهٔ 1» فقط در چندجزوه‌ای) با خط مشخصات (رنگ، یکرو یا دورو، اندازه · کاغذ · صحافی · نسخه)، فایل‌ها به ترتیب
  صحافی با صفحهٔ هر کدام، خط جمع با برگ و جلد از ریز قیمت منجمد، و هشدارهای فایل ۸٫۱. «فرد» فقط در دورو. دانلود تک‌تک و «PDF اصلی جزوه» فقط در صفحهٔ سفارش.
- **zip** (۲۳۱ تا ۲۳۳): `sefaresh-<شماره>.zip`، فایل چاپ همهٔ جلدهای همهٔ جزوه‌ها با نام‌های تکی (`jozve-10033-1.pdf`، `jozve-10033-2-jeld-1.pdf`) و
  `barge-sefaresh-10033.pdf`، به ترتیب جزوه و جلد و برگه در آخر. آماده فقط وقتی هر جلد ساخته شده و برگه تازه است؛ دلیل بسته بودن: «فایل چاپ ساخته نشد؛ در صفحهٔ سفارش
  «دوباره بساز» را بزن.»، «فایل چاپ در حال ساخته شدن است؛ zip پس از آن باز می‌شود.»، «برگهٔ سفارش با نام و نشانی تازه دوباره ساخته می‌شود؛ …» (یا «با چاپخانهٔ تازه»)؛
  اول فایل چاپ، بعد برگه. نشانی مستقیم zip آماده‌نشده به صفحهٔ سفارش برمی‌گردد با «همهٔ فایل‌های این سفارش هنوز آماده نیست؛ دلیلش کنار «همهٔ فایل‌ها (zip)» است…».
  کنار دکمهٔ آماده «3 فایل، 84 مگابایت: فایل چاپ دو جزوه و برگهٔ سفارش».
- **عددها:** کل `pnpm test` با پستگرس تازه ۱٬۳۹۸ (۶ تست استوریج بی S3 رد)، typecheck سبز؛ سرتاسری پنل ۹۴ روی build تولیدی (۸۹ در اجرای کامل و `scope.spec` ۷ از ۷ پس
  از درست شدن فهرست رویدادهایش)؛ شاهد جهش ۲۹، همه افتادند (۴ پایگاه داده، ۲۳ واحد و ۲ سرتاسری)، و یکی هم‌ارز. سایت دست نخورد، پس باندل اولیه و اولین قیمت همان‌اند.
- **پس از استقرار:** بی مهاجرت و بی کار دستی؛ «سفارش‌ها» فهرست جمع‌وجور است و zip برای هر سفارشی که فایل‌هایش ساخته شده، سفارش‌های امروز هم. مسیر خرید سایت زنده
  همچنان `off`.
- تصمیم‌ها در ADR-056؛ رابط در `docs/UI.md`، «۹٫۱».

#### ۹٫۲: قالب HTML برگه‌ها، بیجک و برگهٔ اول (#72، ادغام شد)

سؤال‌های ۱۹۳ و ۱۹۴؛ ADR-057. برگه‌های هر سفارش از قالب HTML (Jinja2 برای WeasyPrint): بیجک روی بسته و برگهٔ اول روی دستهٔ هر جزوه، در یک PDF. مالک
قالب خودش را از پنل بارگذاری می‌کند، پیش‌نمایشش را می‌بیند و با کد تازه فعالش می‌کند؛ بی نسخهٔ فعال، قالب پیش‌فرض با همان محتوای برگهٔ ۵٫۱. طرح نمونهٔ
جدا نداشت (سؤال ۱۸۰ طرح را فقط پیش از ۸٫۲، ۹٫۱، ۱۱٫۱ و ۱۲٫۱ خواسته بود)؛ رابط با کیت پنل و الگوی «تعرفه»، و تصمیم‌های اجرایش سؤال‌های ۲۳۵ تا ۲۴۴
در `docs/UI.md`، «۹٫۲».

| جا | کار |
|---|---|
| ایمیج پایهٔ کارگر | WeasyPrint ۷۰ و Jinja2 ۳٫۱٫۶ (`requirements.txt`)، با Pango و HarfBuzz از apt (`Dockerfile.base`)؛ شناسهٔ پایهٔ تازه، پس یک بار دانلود ایمیج پایه روی سرور (ADR-027). مرحلهٔ دود CI برگهٔ پیش‌فرض سه‌صفحه‌ای را درون همان ایمیج می‌سازد |
| `services/docworker` | `ticket_render.py` (تازه): ساختن هر صفحه در پردازهٔ جدا با `python -I`، `SandboxedEnvironment` با escape خودکار، واکش‌گر فقط `data:` (نشانی ردشده در نتیجه)، بی `base_url`، سقف ۲۰۰ صفحه، و خطا با نوع قالب و خط. `ticket_context.py` (تازه): دادهٔ قالب از `TicketData`، به نام‌های قالب‌های صاحب پروژه (`order.files`، `print_info…`)، و دادهٔ نمونهٔ دوجزوه‌ای. `templates/` (تازه): `bijak.html`، `first_page.html` و `variables.json`. `ticket.py` بازنویسی شد: قالب‌های فعال یا پیش‌فرض، `render` در `sandbox.run_confined` (۹۰ ثانیه، ۱٫۵ گیگابایت حافظه با `RLIMIT_AS` تازهٔ `sandbox`، ۶۴ مگابایت فایل)، ادغام صفحه‌ها با PyMuPDF و PNG خاکستری ۱۵۰ DPI هر صفحه، کلید از sha256 خود PDF، و پیش از ثبت سنجش اثر انگشت داده و قالب‌های فعال زیر قفل اشتراکی (هر کدام عوض شد، از نو). کار تازهٔ `preview_ticket_template` (نمونه، یا یک سفارش با فایل‌هایش و زیر قفل ردیفش) |
| `packages/db` | مهاجرت `0040` (تولیدی): `ticket_templates` (نوع، شماره، متن تا ۲ مگابایت، sha256، نام فایل، سازنده، فعال، اولین فعال شدن، و نتیجهٔ آخرین پیش‌نمایش با کلیدهای فایلش)، با CHECKهای شکل و یک فعال برای هر نوع؛ `order_tickets.page_count` و شناسهٔ قالب هر نوع؛ `jobs.ticket_template_id` با هدف چهارم `jobs_one_target`. `0041` (دست‌نویس): `ticket_templates_guard` (`_insert_state`، `_frozen`، `_append_only`) و `order_tickets_template_kind`. `templates.ts` (تازه): نسخه‌ها با حال کار پیش‌نمایش، بارگذاری زیر قفل با رویداد و کار پیش‌نمایش نمونه، درخواست پیش‌نمایش (نه وقتی در حال ساختن است)، و فعال کردن یا برگشت زیر همان قفل با «همان که دیده شد» و کار برگهٔ «در صف چاپ» دوباره در صف. مجوز تازهٔ `templates.manage` (مالک). برگهٔ پنل با شمار صفحه و شمارهٔ نسخهٔ قالب‌ها |
| `apps/admin` | سرویس `templates.ts` (تازه): سنجش فایل، پیش‌نمایش با سفارش، فعال کردن با کد تازه پس از هر سنجش بی کد، متن قالب و فایل‌های پیش‌نمایش. صفحه‌ها: `/settings/templates` (هر نوع با نسخه‌ها، پیش‌فرض، بارگذاری، و فهرست متغیرها)، `/settings/templates/<نسخه>` (پیش‌نمایش با صفحه‌ها، خطا با خط، نشانی‌های ردشده، «پیش‌نمایش دوباره»)، و `/settings/templates/<نسخه یا default-نوع>/activate`؛ مسیرهای `source` (پیوست، `nosniff`)، `preview?page=` و `pdf`. کارت «قالب برگه‌ها» در «تنظیمات». صفحهٔ برگهٔ سفارش همهٔ صفحه‌ها و قالب‌ها، و ردیف برگهٔ صفحهٔ سفارش شمار برگ. `ticketTemplates.generated.ts` از روی کارگر با تست هم‌خوانی |
| تست‌ها | کارگر: دیوارها و قالب‌های پیش‌فرض (`test_ticket_render.py`، تازه)، و برگه، پیش‌نمایش، قالب وسط ساختن، کلید از محتوا و پیش‌نمایش کنار فایل‌های سفارش روی پستگرس و S3 (`test_ticket.py`). پایگاه داده: محافظ‌ها، بارگذاری هم‌زمان، پیش‌نمایش، فعال کردن و برگشت. واحد: سرویس، رویدادها، تکه‌های خالص و هم‌خوانی قالب‌ها. سرتاسری: `templates.spec.ts` (تازه)، و `print.spec` و `scope.spec` با برگهٔ دوصفحه‌ای |

- **داده** (۱۹۴): مبلغ هرگز. هر مقدار سفارش متن است (escape خودکار)؛ نام فایل مشتری با جهت خودش در قالب پیش‌فرض (`bdi`). پرچم‌های صحافی از شناسهٔ آن در
  تعرفه: `plastic` = `spiral_clear` یا `plastic`، `hot_glue`، `cover`، و `stapler` = `stapler` یا `staple`.
- **فعال کردن:** فقط نسخه‌ای که پیش‌نمایش درست دارد؛ از همان نسخهٔ فعال و همان متن و زمان پیش‌نمایشی که صفحه نشان داد، پیش از کد و دوباره زیر قفل. برگهٔ
  سفارش‌های «در صف چاپ» با قالب تازه از نو ساخته می‌شود، و صفحهٔ فعال کردن شمارشان را می‌گوید؛ «در حال چاپ» و پس از آن همان. برگشت به پیش‌فرض هم با کد تازه.
- **پیش‌نمایش:** با بارگذاری، خودکار با دادهٔ نمونه (دو جزوه)؛ بعد با هر سفارش پرداخت‌شده‌ای که فایل‌هایش هست. پیش‌نمایش با سفارش زیر `orders/<شماره>/`
  است و با فایل‌های همان سفارش پاک می‌شود؛ صفحهٔ نسخه آن وقت «فایل‌های این پیش‌نمایش … پاک شد» می‌گوید، بی تصویر شکسته. پیش‌نمایشی که در حال ساختن است
  دوباره در صف نمی‌رود (کارگر با پایانش «انجام شد» می‌نوشت).
- **عددها:** کل `pnpm test` با پستگرس تازه ۱٬۴۲۳ (۶ تست استوریج بی S3 رد؛ ۹٫۱: ۱٬۳۹۸)، typecheck سبز؛ کارگر ۶۴۳ روی پستگرس و S3 (۲۵ رد بیرون ایمیج
  پایه، LibreOffice)؛ سرتاسری پنل ۱۰۰ روی build تولیدی (۹٫۱: ۹۴)؛ شاهد جهش ۳۹ (۱۵ پایگاه داده، ۱۷ واحد، ۵ کارگر و ۲ سرتاسری)، همه افتادند، و دو جهش هم‌ارز که
  کدشان رفت (`docs/UI.md`، «۹٫۲»).
- **پس از استقرار:** مهاجرت‌های `0040` و `0041` خودکار؛ ایمیج پایهٔ کارگر تازه است و `deploy-bundle.sh` یک بار کاملش را می‌گیرد (ADR-027). بی کار دستی:
  بی نسخهٔ فعال، برگه‌های تازه با قالب پیش‌فرض‌اند. برگهٔ ساخته‌شده پیش از ۹٫۲ (اگر سفارشی باشد) همان یک‌صفحه‌ای می‌ماند تا داده‌اش عوض شود؛ سایت زنده با
  `CHECKOUT_MODE=off` سفارش واقعی ندارد. قالب‌های «چاپ اپکس» بیرون از مخزن‌اند و صاحب پروژه از پنل بارگذاری‌شان می‌کند.
- تصمیم‌ها در ADR-057 (و «افزوده در ۹٫۲» ADR-043)؛ رابط در `docs/UI.md`، «۹٫۲».

#### ۹٫۳: یادداشت داخلی سفارش و ویرایش دستی بی تغییر قیمت (#73، ادغام شد)

سؤال‌های ۱۹۵ و ۱۹۶؛ ADR-058. یادداشت داخلی روی سفارش، فقط افزودنی، با نویسنده و زمان: مالک و متصدی می‌نویسند و همه را می‌بینند (از ۹٫۴ حسابدار هم)،
و کاربر چاپخانه فقط یادداشتی را که «چاپخانه هم ببیند» دارد، روی سفارش‌های خودش. ویرایش دستی همان ویرایش گیرنده (۴٫۳) و دستورها با یادداشت می‌ماند؛ آنچه
قیمت را عوض می‌کند ویرایش درجا نیست (۱۹۶). طرح نمونهٔ جدا نداشت (سؤال ۱۸۰)؛ رابط با کیت پنل، و تصمیم‌های اجرایش سؤال‌های ۲۴۵ تا ۲۵۲ در `docs/UI.md`،
«۹٫۳».

| جا | کار |
|---|---|
| `packages/db` | مهاجرت `0042` (تولیدی): `order_notes` (سفارش، نویسنده، متن، «چاپخانه هم ببیند»، شناسهٔ فرم و زمان)، با CHECK `order_notes_body` (۱ تا ۱٬۰۰۰ نویسه، بی فاصله و خط تازه در لبه) و شاخص یکتای `order_notes_request`. `0043` (دست‌نویس): `order_notes_append_only`، یادداشت عوض و پاک نمی‌شود جز با خود سفارش (مثل `order_assignments_append_only`). `panel.ts`: یادداشت‌ها در `details` و `specs` (۹٫۱) با محدوده در خود کوئری (`notesOf`: در محدودهٔ یک چاپخانه فقط «چاپخانه هم ببیند»)، و `addNote`: فقط سفارشی در محدوده، رویداد در همان تراکنش، و فرمی که یک بار فرستاده شد یادداشت دوم نمی‌سازد. مجوز تازهٔ `orders.notes` (مالک و متصدی) |
| `packages/text` | `tidyInputLinesFa` در `@jozveyar/text/input`: هر خط با `tidyInputFa`، خط تازه یک `\n` (`\r\n` مرورگر هم)، خط خالی نه |
| `apps/admin` | سرویس `addNote` (`lib/server/orders.ts`): مجوز پیش از هر خواندن، متن ۱ تا ۱٬۰۰۰ نویسه پس از نرمال‌سازی، شناسهٔ فرم UUID، و رویداد `orders.note` بی متن. کارت «یادداشت‌ها» در ستون کنار صفحهٔ سفارش، زیر وضعیت (`NotesCard`، `OrderNotes`، `NoteForm`)، و همان یادداشت‌ها در مشخصات فهرست جمع‌وجور (`OrderSpec`)؛ نشان «چاپخانه هم می‌بیند» فقط برای مالک و متصدی. رویداد زیر «سفارش»، بی سطر در «رویدادها»ی سفارش، و از چشم چاپخانه حتی رویدادش نه (`partnerView`). فرم ویرایش گیرنده راه آنچه قیمت را عوض می‌کند می‌گوید |
| تست‌ها | پایگاه داده: محافظ‌ها، یادداشت و رویدادش، همان فرم دو بار (هم‌زمان هم) و با متن، تیک، ادمین یا سفارش دیگر، و محدودهٔ چاپخانه در جزئیات، مشخصات و نوشتن. واحد: سرویس، رویداد، سطر و چشم چاپخانه، و `tidyInputLinesFa`. سرتاسری: `notes.spec.ts` (تازه) |

- **داده:** متن هر یادداشت فقط در `order_notes`؛ رویداد `orders.note` شمارهٔ سفارش، «چاپخانه هم ببیند» و شناسهٔ یادداشت را دارد، نه متن را. نویسنده
  همیشه ادمین است؛ چاپخانه نمی‌نویسد (۱۹۵).
- **دو کلیک:** صفحه با هر بار ساختن فرم شناسهٔ تصادفی تازه‌ای می‌گذارد؛ همان فرم با همان متن، تیک، ادمین و سفارش همان یادداشت است، و دو فرستادن
  هم‌زمان پشت شاخص یکتا می‌ایستند. شناسهٔ همان فرم با چیز دیگر «فرم کهنه» است. پس از نوشتن، صفحه با شناسهٔ تازه برمی‌گردد و فرم خالی است.
- **عددها:** کل `pnpm test` با پستگرس تازه ۱٬۴۳۳ (۶ تست استوریج بی S3 رد؛ ۹٫۲: ۱٬۴۲۳)، typecheck سبز؛ سرتاسری پنل ۱۰۳ روی build تولیدی (۹٫۲: ۱۰۰)؛
  شاهد جهش ۳۲ (۱۶ پایگاه داده، ۱۴ واحد و ۲ سرتاسری)، همه افتادند، و یک جهش هم‌ارز که کدش رفت (`docs/UI.md`، «۹٫۳»).
- **پس از استقرار:** مهاجرت‌های `0042` و `0043` خودکار؛ مجوز تازه را دادهٔ پایهٔ وب با بالا آمدن از کد می‌نشاند (`seedAdminRoles`: `orders.notes` برای
  مالک و متصدی). بی کار دستی و بی ایمیج تازه؛ رابط سایت دست نخورد.
- تصمیم‌ها در ADR-058؛ رابط در `docs/UI.md`، «۹٫۳».

#### ۹٫۴: نقش حسابدار، و عوض کردن نقش ادمین (#74، ادغام شد)

سؤال ۱۹۷؛ ADR-059. نقش چهارم «حسابدار» در کد، و «عوض کردن نقش» ادمین موجود از «ادمین‌ها» با کد تازه؛ «ادمین کل» همان مالک است و «اپراتور هر
چاپخانه» نقش «چاپخانه» (۵٫۳). تسویهٔ چاپخانه‌ها (۱۰٫۳) و خروجی گزارش‌ها (۱۰٫۲) با برش ۱۰ به حسابدار می‌رسند. طرح نمونهٔ جدا نداشت (سؤال ۱۸۰)؛
رابط با کیت پنل، و تصمیم‌های اجرایش سؤال‌های ۲۵۳ تا ۲۶۰ (همه طبق پیشنهاد تأیید شد، ۱۴۰۵/۰۷/۲۴) در `docs/UI.md`، «۹٫۴». با آن برش ۹ تمام است.

| جا | کار |
|---|---|
| `packages/db` | `ADMIN_ROLES.accountant` («حسابدار»): `orders.read`، `orders.money`، `orders.refund`، `orders.notes` و `reports.read`؛ بی مهاجرت، چون نقش‌ها و مجوزهایشان را دادهٔ پایهٔ وب از کد می‌نشاند (`seedAdminRoles`). `changeRole` در `admin.ts`: یک تراکنش زیر قفل ادمین‌ها (همان ساختن و غیرفعال کردن)، فقط از نقشی که مالک دید (`roleSeen`: نقش‌ها و چاپخانه در یک رشته)، با چاپخانهٔ فعال برای نقش «چاپخانه» (`FOR SHARE`)، بی نقش یکسان و بی پایین آوردن آخرین مالک فعال، و رویداد `admins.role` در همان تراکنش. `createInvite` (دستور سرور با نقش صریح) هم آخرین مالک فعال را پایین نمی‌آورد، پیش از هر نوشتن |
| `apps/admin` | سرویس `changeRole` (`lib/server/auth.ts`): مجوز `admins.manage`، خود نه، نقش و چاپخانه، فرم کهنه و نقش یکسان پیش از کد، بعد کد تازه. صفحهٔ «عوض کردن نقش» (`/admins/<id>/role`، `RoleForm`)، کاشی‌های نقش مشترک با «افزودن ادمین» (`RoleFields`، متن هر نقش در `lib/roles.ts`)، پیوند «عوض کردن نقش» در هر ردیف «ادمین‌ها» جز خود، و «نقش … حالا … است» پس از آن. پنل حسابدار: زبانهٔ «گزارش ارسال» برای کسی که گزارش دارد و «ارسال» نه، «این بخش برای حسابدار باز نیست» (`NoAccess` با نشست)، و هشدار پیشخوان فقط برای کسی که کارش را دارد («PDF ساخته نشد»، «بی چاپخانه» و «کد رهگیری ندارد») |
| تست‌ها | پایگاه داده: مجوزهای حسابدار، عوض کردن نقش (فرم کهنه، نقش یکسان، ادمین ناموجود، چاپخانهٔ فعال و غیرفعال، نشست و رویداد)، دو مالکی که هم‌زمان هم را پایین می‌آورند، و دستور سرور. واحد: سرویس، رویداد، پیشخوان، و نام و کاشی هر نقش. سرتاسری: `roles.spec.ts` (تازه)، و چهار نقش در `scope.spec.ts` |

- **نشست:** نقش تازه از درخواست بعدی همان ادمین اثر دارد، چون مجوز و محدوده با هر درخواست از پایگاه داده خوانده می‌شود (`findSession`)؛ پس نشست‌ها
  باز می‌مانند، چه نقش بالا برود چه پایین.
- **آخرین مالک:** از پنل فقط در مسابقه پیش می‌آید، چون مالکی که نقش مالک دیگر را عوض می‌کند خودش مالک است؛ قفل ادمین‌ها دو تغییر هم‌زمان را پشت‌سرهم
  می‌کند و دومی «آخرین مالک فعال پنل نقش دیگری نمی‌گیرد» می‌گیرد. مالک غیرفعال مالک فعال نیست.
- **عددها:** کل `pnpm test` با پستگرس تازه ۱٬۴۴۶ (۶ تست استوریج بی S3 رد؛ ۹٫۳: ۱٬۴۳۳)، typecheck سبز؛ سرتاسری پنل ۱۰۷ روی build تولیدی (۹٫۳: ۱۰۳)؛
  شاهد جهش ۲۹ (۱۰ پایگاه داده، ۱۵ واحد و ۴ سرتاسری)، همه افتادند (`docs/UI.md`، «۹٫۴»). باندل اولیهٔ سایت بایت‌به‌بایت همان (۱۰۷٬۶۰۶ بایت).
- **پس از استقرار:** نقش «حسابدار» و مجوزهایش را دادهٔ پایهٔ وب با بالا آمدن از کد می‌نشاند؛ بی مهاجرت، بی کار دستی و بی ایمیج تازه؛ رابط سایت دست
  نخورد. حسابدار را مالک از «افزودن ادمین» می‌سازد.
- تصمیم‌ها در ADR-059؛ رابط در `docs/UI.md`، «۹٫۴».

#### ۱۰٫۱: تخصیص با فاصله، «شلوغ» و «تعطیل»، و تخصیص دستی (#75، ادغام شد)

سؤال‌های ۱۹۸ تا ۲۰۰؛ ADR-060. سطح سوم تخصیص نزدیک‌ترین چاپخانه با فاصلهٔ خط مستقیم میان دو شهر، به جای «پیش‌فرض»، با مختصات GeoNames درون
`packages/geo`؛ «باز»، «شلوغ» یا «تعطیل از … تا …» برای هر چاپخانه؛ و حالت «دستی» که سفارش پرداخت‌شده را برای سپردن متصدی نگه می‌دارد. طرح نمونهٔ جدا
نداشت (سؤال ۱۸۰)؛ رابط با کیت پنل، و تصمیم‌های اجرایش سؤال‌های ۲۶۱ تا ۲۷۰ در `docs/UI.md`، «۱۰٫۱». روی سایت فقط نوار صفحهٔ اصلی وقتی همهٔ چاپخانه‌ها
تعطیل‌اند (سؤال ۲۰۰).

| جا | کار |
|---|---|
| `packages/geo` | `src/coords.ts` (داده): مختصات ۱٬۱۴۲ شهر از ۱٬۳۲۳، از دو بستهٔ دادهٔ GeoNames (CC BY 4.0) با تطبیق نام فارسی‌نرمال در همان استان و تصمیم دستی برای ناهمخوان‌ها، ساخته با `scripts/import-coords.py` (فقط کتابخانهٔ استاندارد پایتون، یک بار)؛ مجوز در `NOTICE.md`. زیرمسیر فقط‌سرور `@jozveyar/geo/coords` (`src/points.ts`): `cityPoint`، `placePoint` (شهر بی مختصات و جای بی شهر با مرکز استان) و `distanceKm` (هاورساین)؛ تکهٔ مسیر خرید سایت فقط `@jozveyar/geo` را می‌خواند، نه این را |
| `packages/db` | مهاجرت `0044` (تولیدی): `print_partners.availability` (`open`، `busy`، `closed`؛ پیش‌فرض `open`)، `closed_from` و `closed_until` (آغاز روز اول و آغاز روز باز شدن، نیمه‌شب تهران)، `availability_note`؛ CHECK `print_partners_closed` (تعطیل دقیقاً با هر دو روز، آغاز پیش از پایان، تا ۳۶۶ روز) و `print_partners_availability_note` (۱ تا ۲۰۰ نویسه، بی فاصلهٔ لبه، فقط شلوغ و تعطیل)؛ و `order_assignments_actor` تازه: قاعدهٔ سیستم یکی از `city`، `province`، `nearest`، `reopening`، `default` و `oldest` (دو آخری فقط تاریخچه)، و ردیف ادمین بی دلیل فقط وقتی سفارش چاپخانه نداشت. `rank.ts` (خالص، `@jozveyar/db/rank`): `availabilityAt`، `rankPartners`، `choosePartner`، `allClosedWindow` و `closedDays`. `assignAtPayment` حالت را در همان تراکنش می‌خواند (`assignment.mode`؛ دستی یعنی بی تخصیص) و چاپخانه را با `choosePartner(…, at)`؛ `settleWith` روزهای «همه تعطیل» را کنار تعطیلی‌ها از مهلت تحویل به پست کم می‌کند (`OrderStore.partnerHours`). `PartnerStore.setAvailability` زیر قفل چاپخانه‌ها، از همان که دیده شد، با رویداد `partners.availability` (از و به)؛ `partnerBoard(scope)` و `partnerOptions` پنل با در دسترس بودن. مجوز تازهٔ `partners.availability` (مالک، متصدی و چاپخانه)؛ تنظیم تازهٔ `assignment.mode` (پیش‌فرض دادهٔ پایه `auto`) |
| `apps/admin` | کارت «چاپخانه‌ها» پیشخوان (هر چاپخانهٔ فعال با چیپ حال و «عوض کن»؛ کاربر چاپخانه فقط خودش)، صفحهٔ «در دسترس بودن» (`/partners/<id>/availability`، `AvailabilityForm`: کاشی‌های باز، شلوغ و تعطیل، روز اول و آخر و یادداشت فقط با حالی که لازمشان دارد، بی JS با `:has()`)، و پیوندش در ردیف «چاپخانه‌ها» با چیپ همان حال. هشدارهای پیشخوان برای `orders.assign`: «همهٔ چاپخانه‌ها تا … تعطیل‌اند» و «X تعطیل تا … است، و سفارش‌های … هنوز در صفش هستند» با پیوند جابه‌جایی؛ «بی چاپخانه» در حالت دستی خبر. فرم جابه‌جایی و سپردن به ترتیب `rankPartners` برای جای سفارش، با اولی از پیش انتخاب‌شده و «چرا» در هر کاشی (`optionNote`: «هم‌شهر مشتری»، «هم‌استان مشتری، 73 کیلومتر»، «739 کیلومتر»، «شلوغ»، «تعطیل تا …»)؛ سپردن بی دلیل. کارت «تخصیص چاپخانه» در «تنظیمات» (`AssignmentModeForm`، فقط مالک). رویدادها: «چاپخانهٔ «…»: باز ← تعطیل از … تا … (یادداشت)» و «تخصیص چاپخانه: خودکار ← دستی» |
| `apps/web` | نوار «چاپخانه‌ها تا … تعطیل‌اند» بالای صفحهٔ اصلی فقط وقتی همین حالا همهٔ چاپخانه‌های فعال تعطیل‌اند (`lib/server/closure.ts` با همان `allClosedWindow`، `components/ClosureBar.tsx`)، کامپوننت سرور و با همان ISR ۶۰ ثانیه؛ ذخیره‌گاه حافظه‌ای تست همان قاعده و حالت |
| تست‌ها | واحد: `points.test.ts` (مختصات، مرکز استان‌ها، فاصله‌های شناخته)، `assignment.test.ts` (هر سطح، شلوغ، تعطیل، همه تعطیل، اشتراک بازه‌ها)، سرویس و فرم و رویداد و پیشخوان پنل، نوار سایت، و پرداخت سایت با فاصله، حالت دستی و همه تعطیل (مهلت از روز باز شدن). پایگاه داده: محافظ‌ها، تخصیص در پرداخت با هر حال، حالت دستی، `setAvailability` و کارت پیشخوان. سرتاسری: `availability.spec.ts` (تازه)، و فهرست و فرم سپردن تازه در `partners.spec.ts` |

- **ترتیب:** ۱. باز همان شهر، ۲. باز همان استان، ۳ و ۴. شلوغ همان شهر و استان فقط وقتی بازی در استان مشتری نیست، ۵. باز استان‌های دیگر، ۶. بقیهٔ شلوغ‌ها،
  ۷. تعطیل‌ها به ترتیب روز باز شدن؛ در هر سطح نزدیک‌ترین، بعد پیش‌فرض، بعد قدیمی‌ترین. «پیش‌فرض» حالا فقط برابری فاصله است (دو چاپخانهٔ یک شهر)، و همیشه
  یکی هست و غیرفعال نمی‌شود (۵٫۲).
- **روزها:** فرم شمسی و دوسرشامل، از امروز تا ۹۰ روز بعد؛ ستون‌ها نیمه‌شب تهران با پایان انحصاری، مثل مهلت تحویل به پست. تعطیلیِ آینده تا روز اولش «باز»
  است و گذشته دیگر هیچ، با هر خواندن (`availabilityAt`)، بی کار زمان‌بندی‌شده. «شلوغ» تا ادمین عوضش کند.
- **همه تعطیل:** سفارش پیش اولین چاپخانه‌ای می‌رود که باز می‌شود (`reopening`)، و مهلت تحویل به پستش روزهای «همه تعطیل» را نمی‌شمارد؛ صفحهٔ اصلی همان
  روزها می‌گوید «سفارش‌های این روزها از … چاپ می‌شوند».
- **حالت دستی:** در تراکنش پرداخت خوانده می‌شود، پس عوض شدنش از پرداخت بعدی اثر دارد؛ سفارشی که پیش‌تر سپرده شد دست نمی‌خورد، و رفتن به «خودکار»
  سفارش‌های منتظر را نمی‌سپارد.
- **عددها:** کل `pnpm test` با پستگرس تازه ۱٬۴۸۹ (۶ تست استوریج بی S3 رد؛ ۹٫۴: ۱٬۴۴۶)، typecheck سبز؛ سرتاسری پنل ۱۱۳ روی build تولیدی (۹٫۴: ۱۰۷)؛
  شاهد جهش ۳۷ (۱۲ پایگاه داده، ۲۳ واحد و ۲ سرتاسری)، همه افتادند (`docs/UI.md`، «۱۰٫۱»). باندل اولیهٔ سایت بایت‌به‌بایت همان (۱۰۷٬۶۰۶ بایت).
- **پس از استقرار:** مهاجرت `0044` خودکار (هر چاپخانه «باز»، و تخصیص‌های گذشته همان قاعده‌شان)؛ مجوز تازه و تنظیم `assignment.mode` («خودکار») را دادهٔ
  پایهٔ وب با بالا آمدن می‌نشاند. بی کار دستی و بی ایمیج تازه؛ از سایت فقط نوار همه‌تعطیل، که تا کسی تعطیلی نگذارد دیده نمی‌شود.
- تصمیم‌ها در ADR-060؛ رابط در `docs/UI.md`، «۱۰٫۱».

#### ۱۰٫۲: گزارش تولید هر چاپخانه، و خروجی اکسل و PDF گزارش‌ها (#76، ادغام شد)

سؤال‌های ۲۰۱ و ۲۰۲؛ ADR-061. صفحهٔ «گزارش تولید» (زبانهٔ تازهٔ «گزارش‌ها»): سفارش‌های پرداخت‌شدهٔ یک بازه، با احتساب نسخه‌ها، برای مالک و حسابدار (همهٔ
چاپخانه‌ها، با مبلغ) و کاربر چاپخانه (فقط خودش، بی مبلغ)؛ و «خروجی اکسل» و «خروجی PDF» برای همین گزارش و گزارش ارسال (۶٫۴). طرح نمونهٔ جدا نداشت (سؤال ۱۸۰)؛
رابط با کیت پنل، و تصمیم‌های اجرایش سؤال‌های ۲۷۱ تا ۲۸۱ در `docs/UI.md`، «۱۰٫۲». سایت دست نخورد.

| جا | کار |
|---|---|
| `packages/db` | `production.ts` (`createProductionReportStore`): سفارش‌های پرداخت‌شدهٔ بازه (روز پرداخت `>= from AND < to`، یا شمارهٔ سفارش دوسرشامل)، چاپخانهٔ انتخاب‌شده و محدوده در خود کوئری؛ هر جزوه با روهای رنگی و سیاه‌سفید، برگ و جلد یک نسخه از ریز قیمت منجمد (`price_breakdown -> 'items' -> (seq - 1)`؛ ریز قیمت خراب خطاست)، نسخه، صفحه، اندازه و صحافی از ستون‌های منجمد، شمار فایل از بخش‌ها، کاغذهای قاعده‌ها، و «آماده» از `order_print_files`؛ سه کوئری هم‌زمان. چاپخانه‌ها فعال اول و به الفبای فارسی (`localeCompare`، نه collation پایگاه داده). مهاجرت `0045` (تولیدی): جدول `report_exports` (نوع، دادهٔ قالب jsonb تا ۴ مگابایت، نام فایل ASCII، `money` و `print_partner_id` خواهنده، خواهنده و زمان، و PDF، صفحه، sha256 یا خطا با زمان پایان؛ CHECKهای `report_exports_result`، `_file_name`، `_report` و `_context`)، و `jobs.report_export_id` (پاک شدن با خروجی؛ `jobs_one_target` با پنج هدف، و `jobs_report_export_kind` یکتا). `0046` (دست‌نویس): تریگر `report_exports_guard` با `report_exports_frozen` و `report_exports_finish_once`. `exports.ts` (`createReportExportStore`): درخواست با کار `render_report` و رویداد در یک تراکنش، حال (با خطای تلاش قبلی و زیرعنوان از دادهٔ منجمد)، و فایل. مجوز تازهٔ `reports.production` (مالک، حسابدار و چاپخانه) |
| `apps/admin` | `lib/production.ts` (خالص): بازه از نشانی (`readProductionQuery`: چیپ، روز یا شماره، سقف‌ها و خطای هر فیلد)، جمع‌ها و جدول‌ها (`aggregateProduction`)، و سند خروجی (`productionDocument`). `lib/reportDocument.ts`: یک شکل سند برای هر گزارش، برگه‌های اکسل (`documentSheets`) و دادهٔ قالب PDF (`pdfContext`، همه متن آماده، فهرست تا ۳۰۰ ردیف). `lib/shippingDocument.ts`: همان برای گزارش ارسال. `lib/server/xlsx.ts`: کتاب XLSX دست‌نویس (zip با DEFLATE از `node:zlib`، CRC، متن درون‌خطی، قالب هزارگان برای عدد درست، برگهٔ راست‌به‌چپ). سرویس‌ها: `production.ts` (مجوز، محدوده، چاپخانه، مبلغ) و `exports.ts` (اکسل با رویداد، درخواست PDF، و حال و فایل فقط برای خواهنده با همان دسترسی امروز، `mayOpenExport`)؛ `report.ts` گزارش ارسال سند خودش را هم می‌دهد. صفحه‌ها: «گزارش تولید» (`/reports`: چیپ‌ها و دو فرم بازه، چیپ‌های چاپخانه، کاشی‌ها، «⏳ هنوز آماده نیست»، لغوشده‌ها، جدول‌ها و «خروجی»)، `/reports/xlsx` و `/shipments/report/xlsx`، «خروجی PDF» (کار سرور `requestReportPdfAction`) و صفحهٔ خروجی (`/reports/exports/<id>`، با «پیدا نشد» خودش) و فایلش. زبانهٔ «گزارش‌ها» (مالک در بخش‌های مالک، حسابدار و چاپخانه در ردیف؛ زبانه با `also` روی گزارش ارسال حسابدار هم جاری)، چیپ‌های «گزارش تولید» و «گزارش ارسال» (`ReportsNav`)، رویداد `reports.export` با چیپ «گزارش‌ها»، و متن «باز نیست» و کاشی نقش‌ها با گزارش‌ها |
| `services/docworker` | `report.py`: کار `render_report` با همان `ticket.render` (پردازهٔ جدا و مهارشده)، قالب کلی `report_templates/report.html` (خلاصه A4 عمودی، فهرست A4 افقی با سرستون تکرارشونده، شمارهٔ صفحه، فقط سیاه)، نتیجه یک بار روی همان ردیف؛ `mark_export_failed` برای شکست قطعی و آخرین تلاش گذرا؛ و `purge_exports` یک روز پس از خواستن، در دور نگهداری نودی که `render_report` برمی‌دارد. `queue.py` هدف پنجم کار را برمی‌گرداند |
| تست‌ها | واحد: بازه، جمع‌ها، سند، برگه‌ها و دادهٔ PDF (`production.test.ts`)؛ کتاب اکسل با خوانندهٔ خودش و کتاب نمونهٔ `parity/report.xlsx` (`xlsx.test.ts`، بازسازی با `UPDATE_XLSX_FIXTURE=1`)؛ سرویس‌ها و دیوار دانلود (`lib/server/production.test.ts`)؛ رویداد و چیپ. کارگر: همان کتاب نمونه با خوانندهٔ فایل پست (`test_report_xlsx.py`)، و قالب و کار و نگهداری (`test_report.py`). پایگاه داده: گزارش با مرز نیمه‌شب، لغوشده، پرداخت‌نشده، بازهٔ شماره، چاپخانه و محدوده، چرخهٔ خروجی و محافظ‌ها. سرتاسری: `production.spec.ts` (تازه)، خروجی‌های گزارش ارسال در `report.spec.ts`، و زبانه‌ها و متن «باز نیست» تازه در `roles`، `scope`، `partners` و `settings` |

- **عددها با احتساب نسخه‌ها:** صفحه = روی چاپی × نسخه (رنگی و سیاه‌سفید جدا)، برگ = برگ یک نسخه × نسخه، صحافی = جلد × نسخه؛ همه از ریز قیمت منجمد، پس گزارش
  با قیمتی که مشتری پرداخت می‌خواند. شمارهٔ سفارش در اکسل و PDF بی جداکنندهٔ هزارگان است («10027»)، بقیهٔ عددها با آن.
- **خروجی‌ها از همان سند:** صفحه JSX است ولی عددهایش از همان جمع‌هاست، و اکسل و PDF هر دو از یک `ReportDocument`؛ پس سه شکل با هم می‌خوانند. اکسل در خود درخواست
  (حدود ۴۰ میلی‌ثانیه برای صد سفارش، و ۱٫۶ ثانیه برای ۱۰٬۰۰۰، سقف بازهٔ شماره)، و PDF چند ثانیه بعد با کارگر.
- **دانلود PDF:** فقط خواهنده، و فقط اگر امروز هم همان دسترسی را دارد (مجوز همان گزارش، مبلغ، محدوده)؛ وگرنه «این خروجی پیدا نشد»، همان خروجی‌ای که نیست.
- **عددها:** کل `pnpm test` با پستگرس تازه ۱٬۵۲۴ (۶ تست استوریج بی S3 رد؛ ۱۰٫۱: ۱٬۴۸۹)، typecheck سبز، و کارگر ۱۰ تست تازه؛ سرتاسری پنل ۱۲۱ روی build
  تولیدی (۱۰٫۱: ۱۱۳)؛ شاهد جهش ۴۳ (۱۲ پایگاه داده، ۲۱ واحد، ۸ کارگر و ۲ سرتاسری)، همه افتادند (`docs/UI.md`، «۱۰٫۲»). باندل اولیهٔ سایت بایت‌به‌بایت همان
  (۱۰۷٬۶۰۶ بایت).
- **پس از استقرار:** مهاجرت‌های `0045` و `0046` خودکار؛ مجوز تازه را دادهٔ پایهٔ وب با بالا آمدن از کد می‌نشاند (`seedAdminRoles`). کارگر کار تازه را با ایمیج
  همین کد برمی‌دارد (ایمیج پایهٔ تازه لازم نیست: WeasyPrint و Jinja2 از ۹٫۲ در آن است). بی کار دستی؛ سایت دست نخورد.
- تصمیم‌ها در ADR-061؛ رابط در `docs/UI.md`، «۱۰٫۲».

#### ۱۱٫۴: کد تخفیف و تخفیف سفارش بزرگ (#77، ادغام شد)

سؤال‌های ۲۰۹ و ۲۱۰؛ ADR-062. پله‌های تخفیف سفارش بزرگ در تعرفه (با «ارسال رایگان»)، و کدهای تخفیف که مالک از زبانهٔ تازهٔ «تخفیف‌ها» می‌سازد و مشتری در «مرور و
پرداخت» وارد می‌کند؛ هر سفارش یکی، هر کدام بیشتر. پیش از ۱۱٫۱ آمد: به موتور قیمت ۸٫۳ بسته است، نه به ویرایشگر متن (ترتیب ۱۱٫۱ تا ۱۱٫۴ وابستگی نیست). طرح نمونهٔ
جدا نداشت (سؤال ۱۸۰)؛ رابط با کیت سایت و پنل، و تصمیم‌های اجرایش سؤال‌های ۲۹۵ تا ۳۰۴ در `docs/UI.md`، «۱۱٫۴».

| جا | کار |
|---|---|
| `packages/contracts` | `discountTierSchema` و `priceListSchema.discountTiers` (تا ۵، آستانه صعودی و یکتا، درصد ۰ تا ۵۰، دست‌کم یک تخفیف؛ پیش‌فرض خالی)؛ `DiscountCodeTerms`، `BreakdownDiscount` و `CodeOutcome`، و `discount` و `code` ریز قیمت؛ در مسیر خرید `discountCode` قیمت و سفارش، `DiscountCodeReason`، و کدهای خطای `discount_code_invalid` و `discount_unavailable` |
| `packages/pricing` | `quote(spec, list, { code })`: پله (`tierOf`) یا کد (`codeDiscountRials`)، هر کدام به ریال بیشتر (ارسال رایگان با ارزش کرایه)؛ برابر، پله. ارسال رایگان کرایه را صفر و کرایهٔ بخشیده را در ریز قیمت نگه می‌دارد. `nextTierOf` («تا پلهٔ بعد») و `freeShippingOf`. مالیات پس از تخفیف |
| `packages/text` | `normalizeDiscountCode` در `@jozveyar/text/input`: ارقام لاتین، حرف بزرگ، بی فاصله و خط تیره و نویسهٔ نامرئی، حرف صفحه‌کلید فارسی به حرف همان کلید، و شکل `^[A-Z0-9]{3,20}$` |
| `packages/db` | مهاجرت `0047` (تولیدی): `discount_tiers` (کلید نسخه و آستانه؛ CHECKهای `_from`، `_percent` و `_reward`)، `discount_codes` (متن یکتا؛ CHECKهای `_code`، `_terms`، `_min_order`، `_window`، `_limits` و `_note`؛ سازنده بی کلید خارجی، مثل `price_lists.created_by`)، و `orders.discount_code_id` با `orders_discount_rials` و `orders_discount_code`. `0048` (دست‌نویس): `discount_tiers_frozen` و `_max`؛ `discount_codes_guard` (`_append_only` و `_frozen`)؛ `payment_attempt_ttl()`، `discount_code_taken()` و `discount_code_room()`؛ تریگرهای `orders_discount_code_room` (ساختن سفارش و پرداخت شدن) و `payments_discount_code_room` (هر تلاش)؛ و `discount_code_id` در `orders_price_frozen`. `discounts.ts`: کد مسیر خرید برای یک مشتری (`discountForCheckout`)، جا برای تلاش تازه (`discountRoomForOrder`)، محافظ به دلیل (`discountRefusalOf`)، و ذخیره‌گاه پنل (`createDiscountStore`: فهرست با شمار استفاده و رزرو، سفارش‌های هر کد، ساختن و ویرایش با رویداد در همان تراکنش). `orders.ts`: `createOrder` و `insertPayment` با `DiscountRefusedError`؛ `settle` رزرو را پیش از `verify` می‌سنجد (`discountRoom`، `payable`). پله‌ها در خواندن و نوشتن تعرفه. مجوزهای `discounts.manage` و `discounts.read` |
| `apps/web` | سرور: `quote` با کد فقط برای نشست تأییدشده، `placeOrder` با `discount_code_id` فقط وقتی کد روی همان قیمت نشست، و `startPayment` با پیش‌سنجی رزرو. رابط: «تا پلهٔ بعد» و ارسال رایگان در میز، ردیف تخفیف در خلاصهٔ میز، مسیر خرید و صفحهٔ سفارش (`discountLineOf`، `shippingLineOf`)، کد در مرور (`DiscountCode`: شش دلیل زیر فیلد، «به کار نرفت» و «هنوز نمی‌خورد»)، کد پذیرفته در پیش‌نویس، و پله‌ها زیر جدول تعرفهٔ صفحهٔ اصلی |
| `apps/admin` | کارت «تخفیف سفارش بزرگ» ویرایشگر تعرفه و نسخهٔ فقط‌خواندنی؛ زبانهٔ «تخفیف‌ها» (`/discounts`، `/discounts/new`، `/discounts/<id>`): `lib/discounts.ts` (فرم و سنجش، رفت‌وبرگشت ردیف و فرم، متن‌ها) و `lib/server/discounts.ts` (مجوز، کد تازه پس از سنجش‌های بی کد، خاموش کردن بی کد، همان که دیده شد، رویداد)؛ `DiscountForm`؛ ردیف تخفیف کارت مبلغ سفارش (`discountLabel`)؛ رویدادها و چیپ «تخفیف‌ها»؛ متن «باز نیست» |
| تست‌ها | واحد: موتور، قرارداد، یکدست کردن کد، مسیر خرید سرور با درگاه و ذخیره‌گاه حافظه‌ای، حالت مسیر خرید و پیش‌نویس، ویرایشگر تعرفه، فرم و سرویس «تخفیف‌ها»، کارت مبلغ و رویدادها. پایگاه داده: یازده تست روی پستگرس (مهلت رزرو برابر `PAYMENT_ATTEMPT_TTL_MS`، کد منجمد سفارش، پنج درخواست هم‌زمان برای آخرین جا، رزرو تا مهلت، پرداخت‌شده و لغوشده، روز و روشن، شکل، شرط منجمد، کد مسیر خرید، پله‌ها و ذخیره‌گاه پنل). سرتاسری: کد در `checkout.spec.ts`، پله‌ها در `tariff.spec.ts`، و `discounts.spec.ts` پنل (تازه)؛ زبانه‌های تازه در `roles`، `production`، `partners` و `settings` |

- **یکی، بزرگ‌تر:** ارزش پله درصدش به‌علاوهٔ کرایه‌ای است که می‌بخشد؛ کدی که کمتر است روی سفارش نمی‌نشیند و مصرف نمی‌شود. پس مشتری هرگز با زدن کد گران‌تر نمی‌خرد.
- **ظرفیت حکم پایگاه داده:** همه زیر قفل ردیف کد، به ترتیب سفارش و بعد کد؛ سرور پیش از هر کار همان را بی قفل می‌سنجد فقط برای پیام روشن. پولی که پس از رفتن رزرو
  رسید `verify` نمی‌شود و درگاه خودکار برش می‌گرداند (ADR-050)، پس «پول داد ولی کدش نخورد» پیش نمی‌آید.
- **پیش از اولین سفارش واقعی:** مسیر خرید سایت زنده `off` است؛ هیچ کد و هیچ پله‌ای در دادهٔ پایه نیست، پس قیمت هیچ جزوه‌ای عوض نمی‌شود تا مالک خودش بسازد.
- **عددها:** در `docs/UI.md`، «۱۱٫۴».
- **پس از استقرار:** مهاجرت‌های `0047` و `0048` خودکار؛ مجوزهای تازه را دادهٔ پایهٔ وب از کد می‌نشاند. بی کار دستی؛ سایت تا مالک پله یا کدی نسازد همان است.
- تصمیم‌ها در ADR-062؛ رابط در `docs/UI.md`، «۱۱٫۴».

#### ۱۲٫۲: مسدودی موبایل مشتری (#78، ادغام شد)

سؤال ۲۱۲؛ ADR-063. مالک و متصدی موبایل مشتری را با دلیل از صفحهٔ سفارش یا فهرست «شماره‌های مسدود» مسدود می‌کنند؛ با آن کد پیامکی نمی‌رود، و سفارش تازه و تلاش
پرداخت تازه ساخته نمی‌شود. پیش از ۱۲٫۱ آمد: به «سفارش‌های من» و صندوق بسته نیست (طرح ۱۲٫۱ آن روز منتظر تأیید بود)، و به کد پیامکی و مسیر خرید ۳ب بسته است. طرح
نمونهٔ جدا نداشت (سؤال ۱۸۰ طرح را پیش از ۱۲٫۱ خواست، نه ۱۲٫۲)؛ رابط با کیت سایت و پنل، و تصمیم‌های اجرایش سؤال‌های ۳۱۷ تا ۳۲۶ در `docs/UI.md`، «۱۲٫۲».

| جا | کار |
|---|---|
| `packages/contracts` | کد خطای `mobile_blocked` مسیر خرید (۴۰۳؛ در «دوباره پرداخت کن» با `order`) |
| `packages/db` | مهاجرت `0049` (تولیدی): `mobile_blocks` (موبایل، دلیل ۱ تا ۵۰۰ نویسه، سفارش و ادمین‌ها بی کلید خارجی، رفع با چه کسی و کی؛ CHECKهای `_mobile`، `_reason` و `_unblocked`؛ شاخص یکتای جزئی `mobile_blocks_live`). `0050` (دست‌نویس): `mobile_blocks_guard` (`_append_only`، `_insert_state` و `_frozen`)، و تریگرهای `orders_mobile_blocked` و `payments_mobile_blocked` (موبایل صاحب سفارش، از `users`). `auth.ts`: `blocked` در `OtpCounts`، زیر همان قفل صدور کد. `orders.ts`: `mobileBlocked` (بی قفل، برای پیام روشن)، و `MobileBlockedError` از `createOrder` و `insertPayment`. `blocks.ts` (تازه): ذخیره‌گاه پنل (`createBlockStore`: صاحب سفارش در محدوده، مسدودی زندهٔ چند شماره، فهرست زنده‌ها و رفع‌شده‌ها، مسدود کردن و رفع با رویداد در همان تراکنش، دو کلیک یکی). مجوز `customers.block` |
| `apps/web` | `limitHit`: شمارهٔ مسدود پس از دروازهٔ جزوه و پیش از سقف‌ها، ۴۰۳ بی پیامک و بی شمارش. `placeOrder` پیش از حساب، و `payExisting` پیش از درگاه (سفارش پرداخت‌شده همان‌طور)؛ و خطای محافظ میان سنجش و درج همان ۴۰۳. پیام «ثبت سفارش با این شماره ممکن نیست؛ از «تماس» پیام بده.» (`components/checkout/blocked.tsx`، ماژول کوچک مشترک مسیر خرید و صفحهٔ سفارش که در هر دو تکه می‌نشیند و تکهٔ جدا نمی‌سازد) در قدم موبایل، مرور و «دوباره پرداخت کن» |
| `apps/admin` | `lib/server/blocks.ts`: مجوز پیش از هر خواندن، شماره از صاحب سفارش در محدوده یا نوشته‌شده و نرمال، دلیل `tidyInputFa` تا `REASON_MAX`، رویداد با شمارهٔ پوشیده. صفحهٔ سفارش: ردیف مسدودی کارت «ارسال به» (`?do=block` با `BlockForm`، نشان «مسدود»، «رفع مسدودی»). `/orders/blocked` با پیوند «شماره‌های مسدود» در سربرگ «سفارش‌ها». رویدادهای `customers.*` و چیپ «مشتری‌ها» |
| تست‌ها | واحد: سرویس کد پیامکی (مسدود، دروازهٔ جزوه پیش از آن، و «ارسال دوباره» پس از آن)، مسیر خرید سرور با جاسوس درگاه («پرداخت» پیش از حساب، «دوباره پرداخت کن» پیش از درگاه، پرداخت‌شده همان‌طور، محافظ میان سنجش و درج)، سرویس پنل و رویدادها. پایگاه داده: چهار تست روی پستگرس (محافظ‌ها، کد پیامکی، سفارش و تلاش تازه با تلاشی که پیش از مسدودی ساخته شد تا «در صف چاپ»، و ذخیره‌گاه پنل با دو مسدود کردن هم‌زمان). سرتاسری: `checkout.spec.ts` (کد پیامکی، «پرداخت» و «دوباره پرداخت کن» با «تماس») و `blocks.spec.ts` پنل (تازه) |

- **شماره، نه شخص:** هویت مشتری جز موبایل تأییدشده نیست (ADR-033)؛ پس مسدودی همان شماره است، و دیوارهای پایگاه داده موبایل صاحب سفارش را از `users` می‌خوانند، نه
  چیزی که فرم یا سفارش می‌گوید.
- **آینده بسته، گذشته همان:** سفارش پرداخت‌شده چاپ و ارسال می‌شود و تلاشی که پیش از مسدودی ساخته شد پرداخت می‌شود؛ پول مشتری گرفته شده، و لغو و بازپرداخت کار
  جدای پنل است (۴٫۳ و ۷٫۳).
- **عددها:** در `docs/UI.md`، «۱۲٫۲».
- **پس از استقرار:** مهاجرت‌های `0049` و `0050` خودکار؛ مجوز تازه را دادهٔ پایهٔ وب از کد می‌نشاند. بی کار دستی؛ تا کسی مسدود نشود هیچ‌چیز عوض نمی‌شود.
- تصمیم‌ها در ADR-063؛ رابط در `docs/UI.md`، «۱۲٫۲».

#### ۱۲٫۳: رضایت و نظر مشتری (#79، ادغام شد)

سؤال ۲۱۳؛ ADR-064. صاحب سفارش پس از «تحویل پست شد» در صفحهٔ سفارش یک بار نمره و چند کلمهٔ اختیاری می‌دهد؛ مالک در «نظر مشتری‌ها»ی پنل روی سایت
می‌گذارد، پنهان یا پاک می‌کند، و آنچه روی سایت است با نام کوچک و شهر به صفحهٔ اصلی می‌رود. پیش از ۱۲٫۱ آمد: به «سفارش‌های من» و صندوق بسته نیست (طرح ۱۲٫۱
آن روز منتظر تأیید بود)، و به صفحهٔ سفارش ۳ب و «تحویل پست شد» ۴٫۳ بسته است. طرح نمونهٔ جدا نداشت (سؤال ۱۸۰ طرح را پیش از ۱۲٫۱ خواست)؛ رابط با کیت سایت و پنل، و
تصمیم‌های اجرایش سؤال‌های ۳۲۷ تا ۳۳۶ در `docs/UI.md`، «۱۲٫۳».

| جا | کار |
|---|---|
| `packages/contracts` | کدهای خطای `review_not_open`، `review_exists`، `invalid_rating` و `review_too_long`؛ در صفحهٔ سفارش `review` (نمره، متن، و اینکه روی سایت است) و `reviewForm` (نام و شهری که روی سایت می‌آید؛ فقط وقتی فرم باز است) |
| `packages/db` | مهاجرت `0051` (تولیدی): `order_reviews` (نمرهٔ ۱ تا ۵، متن تا ۵۰۰ نویسه بی فاصلهٔ سر و ته، نام کوچک و شهر روی سایت، وضعیت و آخرین تصمیم؛ CHECKهای `_status`، `_content`، `_rating`، `_body`، `_approved_body`، `_public` و `_decided`؛ یکی برای هر سفارش، `order_reviews_order`). `0052` (دست‌نویس): `order_reviews_guard` (`_append_only`، `_insert_state`، `_delivered` با سطر سفارش `FOR SHARE`، `_frozen` و `_flow`). `reviews.ts` (تازه): `createReviewStore` (نوشتن مشتری با `exists` و `not_delivered`، صفحهٔ اصلی فقط «روی سایت»، فهرست، شمار و میانگین پنل، و تصمیم از وضعیتی که دید با رویداد در همان تراکنش: دو کلیک `already`، کهنه `stale` و بی متن `no_body`)، و `PUBLISHED_REVIEWS_LIMIT`. `details()` سفارش نظرش را هم دارد. مجوز `reviews.manage`، فقط مالک |
| `apps/web` | `POST /api/orders/<توکن>/review` (`lib/server/reviews.ts`، `submitReview`): صاحب، «تحویل پست شد»، یکی، نمره، و متنی که هر خطش فارسی‌نرمال است (`tidyInputLinesFa`)؛ نام و شهر از `reviewAttribution` (`checkout.ts`)، همان که فرم نشان داد. صفحهٔ سفارش: «از جزوه راضی بودی؟» (`components/checkout/ReviewForm.tsx`، جزیرهٔ کوچک در تکهٔ صفحهٔ سفارش) و پس از آن «نظرت». صفحهٔ اصلی: «نظر مشتری‌ها» (`components/Reviews.tsx`، کامپوننت سرور؛ `siteReviews` با همان قاعدهٔ build و خطای پایگاه دادهٔ تعرفه) |
| `apps/admin` | `lib/server/reviews.ts`: مجوز پیش از هر خواندن، تصمیم از `seen` با گذارهای همان 0052 پیش از پایگاه داده، «روی سایت» فقط با متن، و رویداد با شمارهٔ سفارش و نمره. «نظر مشتری‌ها» (`/orders/reviews`) با دکمهٔ سربرگ «سفارش‌ها»، چیپ‌ها و میانگین، و «پاک کن» با تأیید (`?delete=`). خبر پیشخوان، رویدادهای `reviews.*` و چیپ «نظرها» |
| تست‌ها | واحد: نوشتن و صفحهٔ سفارش مسیر خرید سرور (حافظه‌ای؛ غریبه، وضعیت، نمره، متن، تکراری و هم‌زمانی)، نام روی سایت، نظرهای صفحهٔ اصلی، نام کوچک و نمره‌ها، سرویس پنل و رویدادها. پایگاه داده: دو تست روی پستگرس (محافظ‌ها، و ذخیره‌گاه از نوشتن تا پاک). سرتاسری: `checkout.spec.ts` (نوشتن نظر در صفحهٔ سفارش) و `reviews.spec.ts` پنل (تازه، با صفحهٔ اصلی وب ۳۱۰۱) |

- **حکم آخر با پایگاه داده:** سرور صاحب و وضعیت را پیش‌تر می‌سنجد فقط برای پیام روشن؛ نظر دوم و سفارشی که همان لحظه از «تحویل پست شد» برگشت را شاخص یکتا و
  `order_reviews_delivered` زیر قفل سطر سفارش می‌گیرند.
- **آنچه مشتری دید:** نام و شهر روی خود نظر منجمد است، پس صفحهٔ اصلی با هیچ ویرایش پنل عوض نمی‌شود؛ و «پاک» نمره و متن را برمی‌دارد و ردیف خالی را نگه می‌دارد.
- **عددها:** در `docs/UI.md`، «۱۲٫۳».
- **پس از استقرار:** مهاجرت‌های `0051` و `0052` خودکار؛ مجوز تازه را دادهٔ پایهٔ وب از کد می‌نشاند. بی کار دستی؛ تا مالک نظری روی سایت نگذارد، صفحهٔ اصلی همان است.
- تصمیم‌ها در ADR-064؛ رابط در `docs/UI.md`، «۱۲٫۳».

#### ۱۱٫۱: متن‌های سایت و اطلاعات تماس از پنل (#80)

سؤال ۲۰۵؛ طرح تأییدشده، سؤال‌های ۲۸۲ تا ۲۹۰ (۱۴۰۵/۰۷/۲۶)؛ ADR-065. مالک شش متن سایت (صفحهٔ اصلی، سؤال‌های پرتکرار، قوانین، حریم خصوصی، دربارهٔ ما، و تماس و
پاورقی) را از زبانهٔ تازهٔ «محتوای سایت» پنل عوض می‌کند: پیش‌نویس با پیش‌نمایش به ظاهر سایت، انتشار با «چه عوض می‌شود» و کد تازه، و «نسخه‌ها» با «برگرداندن…».
نوار اعلان (۱۱٫۳) و لوگو و بنر (۱۱٫۲) جدا می‌آیند، و متصدی زبانه را با نوار می‌گیرد. رابط طبق طرح («محتوای سایت (برش ۱۱)» در `admin.html` و `content.html`)، و
تصمیم‌های اجرایش سؤال‌های ۳۳۷ تا ۳۴۸ در `docs/UI.md`، «۱۱٫۱».

| جا | کار |
|---|---|
| `packages/content` (تازه) | TS خالص، فقط سرور و پنل. `kinds.ts`: شش متن، فیلدهای هر کدام با قالب و سقف (`fieldsOf`)، خواندن JSON (`contentOf`)، فرم (`contentFromFields`)، یکدست کردن (`tidyContent`: فارسی‌نرمال، موبایل و تلفن یازده رقم، شناسه بی @ و بی نشانی) و JSON یکتا (`canonicalContent`). `markdown.ts`: Markdown محدود (`parseMarkdown`، `parseInline` با قالب‌های `plain`، `line`، `emphasis` و `paragraph`) با خطای هر خط، و `linkTarget` (فقط همین سایت، `tel:` و `mailto:`). `check.ts`: `checkContent` (لازم، سقف، شکل هر راه تماس، و خطاهای Markdown با خط و آغاز همان خط). `placeholders.ts` و `facts.ts`: ده جای‌نگهدار و عدد امروزشان از تعرفهٔ فعال و تنظیم‌ها (`factsOf`، `placeholderValues`)، و پیشنهاد نزدیک‌ترین نام. `defaults.ts`: متن پیش‌فرض هر شش، همان متن‌های امروز سایت با جای‌نگهدار. `diff.ts`: «چه عوض می‌شود» بند به بند (`contentDiff`). `contact.ts`: ردیف‌های صفحهٔ تماس و جملهٔ بالایش. `render.tsx` (زیرمسیر `@jozveyar/content/render`): رسم بی HTML برای سایت و پیش‌نمایش پنل |
| `packages/db` | مهاجرت `0053` (تولیدی): نوع `site_content_kind`، `site_content_drafts` (یکی برای هر متن، با پایه؛ CHECKهای `_content` و `_times`) و `site_content_versions` (متن، یا خالی برای برگشت به پیش‌فرض، و برگرداندهٔ کدام نسخه؛ CHECKهای `_content`، `_restored` و `_default`؛ شاخص یکتای `_version`). `0054` (دست‌نویس): `site_content_versions_guard` (`_append_only`، `_frozen`، `_sequence`، `_restored_same` و `_noop`) و `site_content_drafts_guard` (`_base_exists`). `content.ts` (تازه): `createSiteContentStore` (آخرین نسخهٔ هر متن، نسخه‌ها، پیش‌نویس‌ها، ذخیره با پایهٔ ثابت، دور انداختن، و انتشار زیر قفل مشورتی متن‌ها از نسخه‌ای که صفحه دید، با سنجش پیش‌نویس، پاک شدنش و رویداد `content.publish` بی متن در همان تراکنش). مجوز `content.edit`. `settings.ts`: قاعدهٔ روزهای فایل آپلود (`uploadDaysOf`) از وب به پکیج مشترک، تا پنل همان عدد سایت را بگوید |
| `apps/web` | `lib/server/content.ts` (تازه): `loadPublished` و `sitePublished` (یک خواندن در هر رسم؛ build و بی پایگاه داده هیچ، خطای پایگاه داده بالا می‌رود)، `liveText` (نسخهٔ مالک، یا متن پیش‌فرض با عدد امروز و روز تغییرش) و `pageSettings`. صفحهٔ اصلی (قهرمان، سه نوید، سه قدم، سؤال‌ها و `FAQPage` با «<» گریزخورده)، قوانین، حریم خصوصی، دربارهٔ ما (`components/ContentPage.tsx`)، تماس، پاورقی، نقشهٔ سایت و متادیتا (`lib/server/pageMetadata.ts`، جدا از `lib/staticPages.ts` که تست‌های سرتاسری هم می‌خوانند) از متن روی سایت؛ `lib/contact.ts` رفت. `siteChangedAt`: آخرین تغییر تنظیم‌هایی که متن صفحه به کار برده. layout با ISR ۶۰ ثانیه. `pages.css` به `@jozveyar/ui/pages.css` رفت تا پیش‌نمایش پنل همان باشد |
| `apps/admin` | `lib/server/content.ts`: مجوز پیش از هر خواندن، فرم یکدست و سنجیده، پیش‌نویس با خطا هم و همان متن روی سایت بی پیش‌نویس، کار فهرست سؤال‌ها، صفحهٔ انتشار با «چه عوض می‌شود»، پایهٔ کهنه و همان که دیده شد، هر سنجش پیش از کد تازه، و برگرداندن نسخه و متن پیش‌فرض؛ عدد امروز با همان قاعده‌های سایت (`loadContentFacts`). `lib/content.ts`: نوشته‌های صفحه‌ها و پیام هر خطا با راه درست کردن. صفحه‌های `/content`، `/content/<متن>`، `/content/<متن>/publish`، `/content/<متن>/versions` و `/content/<متن>/versions/<N یا default>`؛ `ContentField`، `ContentPreview`، `ContentPublishForm` و `ContentSegs`. زبانهٔ «محتوای سایت» در بخش‌های مالک، رویداد و چیپ «محتوای سایت» |
| تست‌ها | واحد: مدل متن، بارگذار سایت و متادیتا، سرویس پنل با ذخیره‌گاه حافظه‌ای، نوشته‌های پنل و رویداد. پایگاه داده: چهار تست روی پستگرس (پیش‌نویس تا برگرداندن با رویدادها، پنج انتشار و پنج برگشت هم‌زمان، محافظ‌های نسخه و پیش‌نویس). سرتاسری: `content.spec.ts` پنل (تازه، با همان وب ۳۱۰۱)؛ فهرست زبانه‌های مالک در `discounts`، `partners` و `settings`؛ و متن پیش‌فرض در `site`، `home` و `desk` وب |

- **متن پیش‌فرض همان سایت امروز:** هر شش متن پیش‌فرض همان متن‌های امروزند، با جای‌نگهدار به جای عدد ثابت؛ پس تا مالک چیزی منتشر نکند سایت همان است، جز دو واژهٔ
  سؤال‌ها که حالا از جای‌نگهدار می‌آیند («یا» در جملهٔ فرمت‌ها و «2 روز») و توضیح اشتراک صفحهٔ اصلی که حالا «توضیح گوگل» است (سؤال ۳۳۷)، و اصلاح‌های بعدی ما به متنی که مالک دست نزده خودشان می‌رسند.
- **حکم آخر با ذخیره‌گاه:** سرویس پنل همه را پیش از کد می‌سنجد فقط تا کد هدر نرود؛ نسخهٔ روی سایت و پیش‌نویس را زیر قفل همان تراکنش انتشار دوباره می‌سنجد، و
  محافظ‌های پایگاه داده هر نسخهٔ نادرست را رد می‌کنند.
- **عددها:** در `docs/UI.md`، «۱۱٫۱».
- **پس از استقرار:** مهاجرت‌های `0053` و `0054` خودکار؛ مجوز تازه را دادهٔ پایهٔ وب از کد می‌نشاند. بی کار دستی؛ تا مالک متنی منتشر نکند، سایت همان است.
- تصمیم‌ها در ADR-065؛ رابط در `docs/UI.md`، «۱۱٫۱».

#### ۱۱٫۳: نوار اعلان بالای سربرگ سایت (#81)

سؤال ۲۰۸؛ طرح تأییدشده، سؤال‌های ۲۸۲، ۲۸۷ و ۲۹۱ تا ۲۹۴ (۱۴۰۵/۰۷/۲۶)؛ ADR-066. مالک و متصدی از «محتوای سایت» نواری بالای سربرگ همهٔ صفحه‌های سایت
می‌گذارند: «خاموش»، «همیشه» یا «در بازه»، متن یک خطی با پررنگ و جای‌نگهدار، و پیوند اختیاری به همین سایت؛ روشن کردن و هر تغییر نوار روشن با کد تازه،
خاموش کردن بی کد. پیام تعطیلی همهٔ چاپخانه‌ها (۱۰٫۱) جای همین نوار است، در همهٔ صفحه‌ها. رابط طبق طرح (حالت‌های «نوار اعلان»، «بی پیوند» و «تعطیلی جای نوار»
در `content.html`، و «محتوای سایت» و «نوار اعلان» در `admin.html`)؛ تصمیم‌های اجرایش سؤال‌های ۳۴۹ تا ۳۶۰ در `docs/UI.md`، «۱۱٫۳».

| جا | کار |
|---|---|
| `packages/contracts` | `BAR_MODES` و `announcementBarSchema` (کی، آغاز روز اول و پایان انحصاری روز آخر به ISO، متن، پیوند و متن پیوند؛ «در بازه» بی هر دو روز یا با آغازی پس از پایان رد)، و تنظیم تازهٔ `content.bar` در `SETTING_SCHEMAS` |
| `packages/content` | `bar.ts` (تازه، زیرمسیر `@jozveyar/content/bar` برای فرم کلاینتی پنل): سقف‌ها (۹۰ نویسه با عددهای امروز، ۳۰۰ نوشته، متن پیوند ۲۴، ۹۰ روز)، `barVisibleAt` (همین حالا روی سایت) و `barShown` (حالا یا بعداً: کد تازه می‌خواهد)، `barHref` (فقط مسیر همین سایت)، `tidyBar`، `checkBar` (قالب `emphasis`، پیوند درون متن و پررنگ دوم با پیام نوار، و پیوند و متنش) و `canonicalBar`. `render.tsx`: `AnnouncementBar` (با پیوند کل نوار `a`، بی پیوند `aside` با برچسب «اعلان»، پیش‌نمایش پنل بی پیوند)، متن در یک `span` تا فاصلهٔ کنار عدد و پررنگ در flex نیفتد. `markdown.ts`: `linkTarget` «\» را نمی‌پذیرد: مرورگر آن را «/» می‌خواند، پس `/\evil.com` همان `//evil.com` بود و Markdown ۱۱٫۱ را هم دور می‌زد |
| `packages/db` | پیش‌فرض دادهٔ پایهٔ `content.bar` (خاموش و بی متن، `BAR_SETTING`)؛ مجوز `content.bar` برای مالک و متصدی؛ `lastSettingEvent` (آخرین رویداد یک تنظیم با نام کننده، تازه‌تر به شناسه). بی مهاجرت |
| `packages/ui` | `bar.css` (تازه، `@jozveyar/ui/bar.css`): `site-bar` و `site-bar--warn`، مشترک سایت و پیش‌نمایش پنل، مثل `pages.css` |
| `apps/web` | `lib/server/bar.ts` (تازه): `loadSiteBar` (تعطیلی همهٔ چاپخانه‌ها مقدم؛ نوار مالک فقط وقتی همین حالا روشن است؛ پیوند دوباره سنجیده؛ عدد جای‌نگهدار فقط وقتی متن جای‌نگهدار دارد، از همان بارگذارهای صفحه‌ها) و `readSiteBar` (build و بی پایگاه داده هیچ، خطا بالا می‌رود). `components/SiteBar.tsx` در layout پیش از سربرگ: نوار مالک با `site-idle`، پیام تعطیلی بی آن. `ClosureBar` صفحهٔ اصلی و `home-closure` رفتند؛ `lib/server/closure.ts` فقط `loadClosure`. درگاه نمونه نوار را هم پنهان می‌کند (`data-gate`) |
| `apps/admin` | `lib/bar.ts` (تازه): فرم به نوار (`barFormOf`: روزها مثل تعطیلی چاپخانه، با بازهٔ جاری)، نشان حال (`barBadge`)، نام صفحهٔ پیوند، کار هر تغییر و خط آخرین تغییر. `lib/server/content.ts`: `bar`، `saveBar` (مجوز، همان که دیده شد، فرم، همان نوار هیچ، کد تازه فقط برای نواری که حالا یا بعداً روی سایت است، و دوباره زیر قفل) و `barOff` (بی کد). صفحهٔ `/content` با کارت «نوار اعلان» (`BarCard`) برای `content.bar` و کارت متن‌ها برای `content.edit`، و `/content/bar` با `BarForm` (کلاینتی: پیش‌نمایش زنده در گوشی ۳۲۰ و دسکتاپ، شمار نویسه و روز هفتهٔ روز آخر). زبانهٔ «محتوای سایت» متصدی در ردیف پس از «تعرفه» (ردیف بی «بیشتر» در گوشی می‌لغزد)، متن «فقط برای مالک» متصدی، سطر رویداد `content.bar` زیر «محتوای سایت»، و هشدار «همه تعطیل‌اند» پیشخوان با «بالای همهٔ صفحه‌ها» |
| تست‌ها | واحد: مدل نوار و رسم، بارگذار سایت، فرم و نشان‌های پنل، سرویس پنل با ذخیره‌گاه تنظیم‌های حافظه‌ای، و سطر رویداد. پایگاه داده: دادهٔ پایهٔ نوار و آخرین رویداد تنظیم. سرتاسری پنل: `bar.spec.ts` (تازه) با صفحه‌های همان وب ۳۱۰۱؛ `content.spec.ts`، `availability.spec.ts` و فهرست زبانه‌های متصدی چهار spec به‌روز |

- **حکم آخر با ذخیره‌گاه:** سرویس پنل همه را پیش از کد می‌سنجد فقط تا کد هدر نرود؛ نوار را زیر قفل تنظیم‌ها دوباره با همان که دیده شد می‌سنجد و رویداد را در همان
  تراکنش می‌نویسد. سایت پیوند ذخیره‌شده را هم دوباره می‌سنجد.
- **عددها:** در `docs/UI.md`، «۱۱٫۳».
- **پس از استقرار:** دادهٔ پایهٔ وب تنظیم `content.bar` (خاموش) و مجوز تازه را از کد می‌نشاند. بی مهاجرت و بی کار دستی؛ تا کسی نوار را روشن نکند سایت همان است،
  جز پیام تعطیلی همهٔ چاپخانه‌ها، که حالا بالای سربرگ همهٔ صفحه‌هاست، نه درون صفحهٔ اصلی.
- تصمیم‌ها در ADR-066؛ رابط در `docs/UI.md`، «۱۱٫۳».

#### ۱۱٫۲: لوگو و بنر صفحهٔ اصلی از پنل (#82)

سؤال ۲۰۶ (پاسخ «تصویر»، ۱۴۰۵/۰۷/۲۶) و افزودهٔ ADR-031؛ ADR-067. مالک لوگوی سایت را از «محتوای سایت» عوض می‌کند (PNG یا WebP، با نشان اختیاری)، و
کارگر سربرگ، نشانک، آیکون گوشی و تصویر اشتراک را از آن می‌سازد؛ مالک و متصدی بنر صفحهٔ اصلی را (تصویر دسکتاپ و گوشی، متن جایگزین و پیوند) روشن و
خاموش می‌کنند. گذاشتن روی سایت با کد تازه؛ بارگذاری و «خاموش کن» بی کد. طرح جدا نداشت (سؤال ۱۸۰) و با کیت پنل و همان کارت‌های «محتوای سایت» ساخته
شد؛ تصمیم‌های اجرایش سؤال‌های ۳۶۱ تا ۳۷۳ در `docs/UI.md`، «۱۱٫۲».

| جا | کار |
|---|---|
| `packages/contracts` | `siteLogoSchema` (`imageId` یا هیچ) و `siteBannerSchema` (روشن یا خاموش، `imageId`، متن جایگزین و پیوند؛ روشن بی تصویر رد)، و دو تنظیم تازهٔ `content.logo` و `content.banner` در `SETTING_SCHEMAS` |
| `packages/content` | `banner.ts` (تازه، زیرمسیر `@jozveyar/content/banner` برای فرم کلاینتی پنل): `BANNER_ALT_MAX` (۱۲۰)، `tidyBanner` (متن یک خطی فارسی‌نرمال، و نشانی کامل jozveyar.com همان مسیر) و `checkBanner` (متن لازم، و پیوند با قاعدهٔ نوار، `barHref`؛ خطای تازهٔ `banner_href`) |
| `packages/db` | جدول‌های `site_images` (نوع، شمارهٔ هر نوع، فایل اصلی و دوم `bytea` تا ۱ مگابایت با نامشان، سازنده، نتیجهٔ کارگر و `published_at`) و `site_image_files` (نام، نوع، بایت تا ۴ مگابایت، ابعاد تا ۴٬۰۹۶، sha256 و شفافیت)، و `jobs.site_image_id` (مهاجرت `0055` تولیدی، و `0056` دست‌نویس: محافظ‌های `site_images_guard` و `site_image_files_guard`، ADR-067). `siteImages.ts` (تازه): بارگذاری با کار و رویداد `content.upload` در یک تراکنش زیر قفل شمارهٔ نوع، فایل‌ها برای پنل، فایل و فایل‌های روی سایت رفته برای سایت، و `change` (قفل تنظیم‌ها، ردیف تصویر قفل‌شده برای `decide`، و نوشتن، `published_at` و رویداد با هم). پیش‌فرض دادهٔ پایهٔ دو تنظیم (لوگوی برند، بنر خاموش)، و برچسب مجوزها «متن‌ها و لوگوی سایت» و «نوار اعلان و بنر» |
| `services/docworker` | `site_images.py` (تازه): کار `build_site_image` با Pillow، هر فایل از نو: لوگو بریده از حاشیهٔ شفاف و PNG با ۱۲۸ پیکسل ارتفاع، نشانک ICO ۱۶، ۳۲ و ۴۸ (از نشان یا لوگو)، آیکون گوشی ۱۸۰، ۱۹۲ و ۵۱۲ (مربع سفید، ۵۸٪ ارتفاع و درون دایرهٔ امن)، تصویر اشتراک ۱۲۰۰×۶۳۰ (green-50 با لبهٔ green-600)؛ بنر دسکتاپ تا ۲٬۱۶۰ و گوشی تا ۱٬۲۸۰ پیکسل پهنا، JPEG یا PNG. قاعده‌ها و پیام هر شکست همین‌جا (نوع از بایت، ۱۶ مگاپیکسل پیش از رمزگشایی، ابعاد و نسبت)، و نتیجه یک بار زیر قفل ردیف. `purge_images` بارگذاری‌ای را که ۳۰ روز روی سایت نرفت پاک می‌کند، در همان چرخهٔ نگهداری نود کارهای سفارش و گزارش |
| `apps/web` | `app/media/[file]/route.ts` (تازه): فایل روی سایت رفته با sha256، کش همیشگی و `nosniff`. `lib/server/brand.ts` (تازه): `siteBrand` و `siteBanner` (build و بی پایگاه داده هیچ؛ بارگذاری‌ای که فایلی کم دارد هیچ؛ پیوند بنر دوباره سنجیده). `lib/brand.ts` (تازه): نشانک، تصویر اشتراک و آیکون‌های manifest، برند یا مالک. layout با `generateMetadata` و `SiteLogo` در سربرگ و پاورقی (لوگوی پهن در پهنای کم کوچک می‌شود)، `manifest.ts` با ISR، و `HomeBanner` بالای سه قدم صفحهٔ اصلی (`<picture>`، و پس از انداختن فایل کنار می‌رود). فایل‌های برند (`icon.svg`، `favicon.ico`، `apple-icon.png`، `opengraph-image.png`) از `app/` به `public/` با همان نشانی؛ `make-icons.mjs` و `site-icons.test.ts` هم |
| `apps/admin` | `lib/images.ts` (تازه، خالص): نوع از بایت، نام نمایشی، حال هر بارگذاری و نشانش، پیام «ساخته نشد»، متن فرم بارگذاری (با تست برابری با کارگر)، کار هر تغییر بنر و خط آخرین تغییر. `lib/server/images.ts` (تازه): مجوز هر نوع، بارگذاری، فایل پیش‌نمایش، `publishLogo`، `brandLogo`، `saveBanner` و `bannerOff` (همان که دیده شد و آماده بودن پیش از کد، و دوباره زیر قفل). کارت‌های «لوگو» و «بنر صفحهٔ اصلی» در `/content`، صفحه‌های `/content/logo`، `/content/logo/<id>`، `/content/logo/brand`، `/content/banner` و `/content/banner/<id>`، مسیر فایل پیش‌نمایش `/content/images/<id>/<نام>`، و سطر رویدادهای `content.upload`، `content.logo` و `content.banner` زیر «محتوای سایت» |
| تست‌ها | پایگاه داده: دادهٔ پایه، بارگذاری تا روی سایت، و همهٔ محافظ‌ها. کارگر: `test_site_images.py` (تازه). واحد: سرویس و رابط پنل، بارگذارهای سایت و `lib/brand.ts`، سطر رویدادها. سرتاسری پنل: `brand.spec.ts` (تازه) با کارگر واقعی و صفحه‌های همان وب ۳۱۰۱؛ متن «فقط برای مالک» متصدی در `bar`، `partners` و `settings` |

- **حکم آخر با پایگاه داده:** سرویس پنل همه را پیش از کد می‌سنجد فقط تا کد هدر نرود؛ ذخیره‌گاه زیر قفل تنظیم‌ها لوگو یا بنر و ردیف تصویر را دوباره می‌سنجد،
  و محافظ‌ها نتیجهٔ نیمه‌کارهٔ کارگر یا پاک شدن آنچه روی سایت رفت را رد می‌کنند. سایت فقط فایل روی سایت رفته را می‌دهد و پیوند بنر را دوباره می‌سنجد.
- **عددها:** در `docs/UI.md`، «۱۱٫۲».
- **پس از استقرار:** مهاجرت‌های `0055` و `0056` خودکار؛ دادهٔ پایهٔ وب دو تنظیم (لوگوی برند، بنر خاموش) را می‌نشاند. بی ایمیج پایهٔ تازه (Pillow از پیش
  در ایمیج است) و بی کار دستی؛ تا مالک لوگویی روی سایت نگذارد و بنری روشن نشود، سایت همان است.
- تصمیم‌ها در ADR-067؛ رابط در `docs/UI.md`، «۱۱٫۲».

#### ۱۲٫۱: «سفارش‌های من» و پیام به پشتیبانی (#83)

سؤال ۲۱۱ و طرح تأییدشدهٔ قدم ۱۱ (`account.html` و «پشتیبانی (برش ۱۲)» در `admin.html`، سؤال‌های ۳۰۵ تا ۳۱۶)؛ ADR-068. مشتری با همان شماره‌ای که
سفارش داد و همان کد پیامکی وارد «سفارش‌های من» می‌شود (بی رمز)، همهٔ سفارش‌هایش را با کار بعدی هر کدام می‌بیند، و دربارهٔ یک سفارش یا «سؤال کلی» به
پشتیبانی پیام می‌دهد؛ مالک و متصدی از زبانهٔ «پشتیبانی» پاسخ می‌دهند و مشتری پیامک «پاسخ آمد» می‌گیرد. صفحهٔ سفارشی که مال این نشست نیست «این سفارش
توست؟» دارد. تصمیم‌های اجرایش سؤال‌های ۳۷۴ تا ۳۸۹ در `docs/UI.md`، «۱۲٫۱».

| جا | کار |
|---|---|
| `packages/contracts` | `supportMessageSchema` (`requestId`، متن، و مقصد: سفارش با شماره، «سؤال کلی» یا گفت‌وگو) و نوع‌های «سفارش‌های من» |
| `packages/db` | جدول‌های `support_threads` (مشتری، سفارش یا هیچ، حال، `waiting_since`، `last_message_at` و «دیده شد» مشتری) و `support_messages` (نوع مشتری، پشتیبانی یا بستن، ادمین، متن، `request_id` یکتا و پیامک پاسخ)، و `purpose` تازهٔ `support_reply` در `sms_messages` (مهاجرت `0057` تولیدی، و `0058` دست‌نویس: `support_threads_guard`، `support_messages_guard` و `_check` و `_apply`، و `sms_messages_guard` و `sms_messages_live` برای پیامک پاسخ؛ ADR-068). `support.ts` (تازه): سمت مشتری (`customerThreads`، `customerThread`، `post` زیر قفل مشورتی مشتری، `markSeen`) و سمت پنل (`inbox`، `openSummary`، `panelThread`، `orderThread`، `reply` با پیامک در همان تراکنش، `close` از همان که دیده شد، `replySms`، `replySmsFailed`). `account.ts` (تازه): سفارش‌های یک مشتری با کار بعدی (`customerOrders`، و «در حال بررسی» برابر `isChecking`). دروازهٔ تازهٔ کد (`OtpGate`: جزوه یا سفارش) در `auth.ts`؛ مجوز `support.reply` (مالک و متصدی) و کلید هفتم `SMS_SUPPORT_TEMPLATE` |
| `packages/sms` | قالب پنجم `support_reply` («جزوه‌یار: پاسخ پیامت دربارهٔ ‹TOPIC› آمد. jozveyar.com/orders»، متن یک‌منبع با «تنظیمات») و شناسه‌اش در آداپتور sms.ir |
| `apps/web` | `lib/server/auth.ts`: کد «سفارش‌های من» با دروازهٔ سفارش و کد خیالی برای شمارهٔ بی سفارش یا مسدود. `lib/server/account.ts` (تازه): فهرست، «پیام تازه»، گفت‌وگو با «دیده شد» و پیام. مسیرهای `/api/account/otp`، `/otp/verify`، `/logout` (با `next` برای «ورود با شمارهٔ دیگر») و `/messages`؛ صفحه‌های `/orders`، `/orders/messages/new` و `/orders/messages/<id>` (کامپوننت سرور، و جزیره‌های `AccountLogin` و `MessageForm`)؛ کارت «سؤالی دربارهٔ این سفارش داری؟» و «این سفارش توست؟» صفحهٔ سفارش؛ پیوند سربرگ و پاورقی (`lib/staticPages.ts`)؛ `account.css` |
| `apps/admin` | `lib/server/support.ts` (تازه): صندوق، گفت‌وگو، پاسخ با پیامک پس از commit، بستن، «دوباره بفرست»، هشدارهای پیشخوان و کارت سفارش. `lib/support.ts` (تازه، خالص): برچسب‌ها، زمان‌ها و «پیامک تازه می‌رود؟». صفحه‌های `/support` و `/support/<id>`، زبانهٔ «پشتیبانی» با شمار، هشدار پیشخوان، کارت «پیام‌های مشتری» صفحهٔ سفارش، کلید هفتم در «تنظیمات»، رویدادهای `support.*` با چیپ «پشتیبانی»، و متن «باز نیست» حسابدار و چاپخانه |
| تست‌ها | پایگاه داده: محافظ‌ها، سقف‌ها با پیام‌های هم‌زمان، ذخیره‌گاه از پیام تا بستن، پیامک پاسخ، دروازهٔ کد و فهرست سفارش‌ها. واحد: کد خیالی، سرویس حساب و `next`، سرویس و رابط پنل، پیامک پاسخ، رویدادها. سرتاسری: `account.spec.ts` (تازه) در مرحلهٔ «مسیر خرید» و `support.spec.ts` (تازه) در پنل؛ پیوند سربرگ و پاورقی در `site` و `home`؛ زبانه‌های پنل در `admin`، `bar`، `discounts`، `partners`، `roles` و `settings`؛ متن «باز نیست» چاپخانه در `scope`، کلید هفتم در `settings`، و پیوندهای گوشی سربرگ در `brand` |

- **حکم آخر با پایگاه داده:** سقف‌های مشتری (زیر قفل مشورتی خود محافظ، نه فقط ذخیره‌گاه)، حال گفت‌وگو، ترتیب پیام‌ها، بستن یک‌باره و پیامک پاسخ همه در محافظ‌ها؛
  سرویس‌ها فقط پیام روشن می‌دهند.
- **عددها:** در `docs/UI.md`، «۱۲٫۱».
- **پس از استقرار:** مهاجرت‌های `0057` و `0058` خودکار؛ بی ایمیج پایهٔ تازه. «سفارش‌های من» همان لحظه روی سایت است (پشت حالت مسیر خرید نیست) و پیوندش در
  سربرگ و پاورقی. **کار دستی صاحب پروژه:** قالب پنجم «جزوه‌یار: پاسخ پیامت دربارهٔ #TOPIC# آمد. jozveyar.com/orders» در sms.ir، و شناسه‌اش در «تنظیمات» با
  پیامک آزمایشی؛ تا آن روز پاسخ‌ها می‌روند و پیامکشان «نرفت» با هشدار پیشخوان است، و پس از گذاشتن شناسه «دوباره بفرست».
- تصمیم‌ها در ADR-068؛ رابط در `docs/UI.md`، «۱۲٫۱».

#### ۱۰٫۳: تسویهٔ چاپخانه‌ها، سهم درصدی منجمد و دفتر پرداخت (#84)

سؤال ۲۰۳ (پاسخ «درصدی از سفارش»، ۱۴۰۵/۰۷/۲۶)؛ ADR-069. هر چاپخانه درصدی دارد که مالک با کد تازه می‌گذارد؛ سهم هر سفارش هنگام سپردن روی همان سفارش منجمد
می‌شود و با «تحویل پست شد» بدهی قطعی است؛ مالک و حسابدار پرداخت به چاپخانه و اصلاح را در دفتری فقط افزودنی ثبت می‌کنند، و کاربر چاپخانه صورت‌حساب خودش را
می‌بیند، بی مبلغ مشتری. طرح نمونهٔ جدا نداشت (سؤال ۱۸۰)؛ رابط با کیت پنل، و تصمیم‌های اجرایش سؤال‌های ۳۹۰ تا ۴۰۳ در `docs/UI.md`، «۱۰٫۳». سایت و کارگر دست نخوردند:
PDF صورت‌حساب را همان قالب کلی گزارش‌های ۱۰٫۲ می‌سازد.

| جا | کار |
|---|---|
| `packages/db` | مهاجرت `0059` (تولیدی): `print_partners.share_bp` (صدم درصد، CHECK `print_partners_share`)، `order_assignments.share_bp` و `share_rials` (CHECK `order_assignments_share`: هر دو یا هیچ، ریال نامنفی و مضرب ده)، جدول `partner_ledger` (چاپخانه، نوع پرداخت یا اصلاح، مبلغ ریال با نشانه برای اصلاح، روز، «بابت» با پایان انحصاری، کد پیگیری، یادداشت یا دلیل، سفارش، سازنده، `request_id` یکتا، و باطل با زمان، کس و دلیل؛ CHECKهای `partner_ledger_kind`، `_shape`، `_period`، `_texts` و `_void`)، و `report_exports_report` با `settlement`. `0060` (دست‌نویس): تریگر `order_assignments_share` پیش از درج هر تخصیص (درصد همان لحظهٔ چاپخانه و سهم از `orders.subtotal_rials`، به تومان گرد با نیم رو به بالا؛ هر چه کد بفرستد نادیده)، و `partner_ledger_guard` (`_insert_state`، `_order`، `_append_only`، `_frozen` و `_void_once`). `settlement.ts` (`createSettlementStore`): نمای کلی (ماندهٔ امروز، در راه، بی سهم و آخرین پرداخت هر چاپخانه)، صورت‌حساب یک بازه در یک تراکنش `repeatable read` فقط‌خواندنی، دفتر زیر قفل `FOR NO KEY UPDATE` ردیف چاپخانه از نسخه‌ای که ادمین دید با رویداد در همان تراکنش، `byRequest`، باطل، چاپخانه‌های فعال بی درصد، و `shareRialsOf` همان حساب تریگر. `partners.ts`: `setShare` زیر قفل از درصدی که دیده شد. `production.ts`: سهم منجمد هر سفارش در گزارش تولید. مجوزهای تازهٔ `settlements.read` (مالک، حسابدار و چاپخانه) و `settlements.manage` (مالک و حسابدار) |
| `apps/admin` | `lib/settlement.ts` (خالص): بازه از نشانی (این ماه، ماه قبل، روزها تا ۴۰۰)، درصد تایپ‌شده و متنش، فرم‌های پرداخت، اصلاح و باطل با خطای هر فیلد، متن مانده و دفتر، جمع‌ها، و سند خروجی (`settlementDocument`، پایهٔ سهم فقط با مبلغ). سرویس `lib/server/settlement.ts`: مجوز پیش از هر خواندن، محدودهٔ چاپخانه، پایهٔ سهم فقط با `orders.money`، و ترتیب سنجش‌ها پیش از کد تازه (مجوز، چاپخانه، شکل فرم، فرمی که پیش‌تر نوشته شد، فیلدها، سفارش اصلاح، نسخهٔ دفتر، کد خالی، کد تازه). `lib/server/partners.ts`: `setShare` با کد تازه. صفحه‌ها: «درصد سهم» (`/partners/<id>/share`، `ShareForm`)، «تسویهٔ چاپخانه‌ها» (`/reports/settlement`)، صورت‌حساب (`/reports/settlement/<id>`) و فرم‌هایش (`payment`، `adjustment?order=` و `void/<entry>`، `SettlementForms`)، اکسل (`xlsx`) و PDF از همان `requestReportPdfAction` و صفحهٔ خروجی ۱۰٫۲. نشان و پیوند درصد در «چاپخانه‌ها»، هشدار پیشخوان برای مالک، چیپ «تسویه» در `ReportsNav`، «سهم چاپخانه» در گزارش تولید و خروجی‌هایش، رویدادهای `partners.share` و `settlements.*` با چیپ «تسویه»، و متن «باز نیست» چاپخانه و حسابدار |
| تست‌ها | پایگاه داده: تریگر سهم (درصد، گرد کردن، تعیین‌نشده، جابه‌جایی با درصد تازه، نادیده گرفتن ستون‌های فرستاده‌شده)، محافظ‌ها و CHECKهای دفتر، ذخیره‌گاه از پرداخت تا باطل با نسخه و `request_id` و رویداد، صورت‌حساب با مرزهای بازه و لغو پس از شروع چاپ، نمای کلی و محدودهٔ کاربر چاپخانه، و `shareRialsOf` برابر تریگر. واحد: بازه، درصد، مبلغ و روزها، فرم‌ها، مانده، جمع‌ها و سند (`lib/settlement.test.ts`)، سرویس با ذخیره‌گاه ساختگی (`lib/server/settlement.test.ts`)، درصد سهم سرویس چاپخانه‌ها، رویدادها و گزارش تولید با سهم. سرتاسری: `settlement.spec.ts` (تازه)، و نشان درصد، چیپ «تسویه» و متن «باز نیست» تازه در `partners`، `production`، `report` و `scope` |

- **سهم منجمد در پایگاه داده:** هر راه تخصیص (پرداخت وب و استعلام خودکار، جابه‌جایی و سپردن پنل، و تست‌هایی که سفارش را با SQL می‌نشانند) از همان تریگر می‌گذرد؛
  پس هیچ کدی سهم دیگری نمی‌نویسد، و هیچ صفحه‌ای درصد امروز را در مبلغ سفارش ضرب نمی‌کند. سفارش‌های پیش از ۱۰٫۳ تخصیصشان بی سهم است، و تا مالک برای هر چاپخانه
  درصدی نگذارد سفارش تازه هم.
- **یک عکس برای صورت‌حساب:** مانده از پیش، جمع‌های بازه، مانده پایان بازه، ماندهٔ امروز و فهرست‌ها از یک تراکنش `repeatable read`؛ پس با هم می‌خوانند حتی وقتی
  سفارشی همان لحظه تحویل پست می‌شود.
- **دفتر:** نسخه = شمار ردیف‌ها به‌علاوهٔ باطل‌ها، که فقط بالا می‌رود؛ «همان که دیده شد» پیش از کد و دوباره زیر قفل. قفل `FOR NO KEY UPDATE` است، نه `FOR UPDATE`،
  تا درج سفارش و تخصیصی که فقط کلید چاپخانه را می‌خواهد پشتش نماند.
- **عددها:** در `docs/UI.md`، «۱۰٫۳».
- **پس از استقرار:** مهاجرت‌های `0059` و `0060` خودکار؛ مجوزهای تازه را دادهٔ پایهٔ وب با بالا آمدن از کد می‌نشاند. **کار دستی صاحب پروژه:** درصد سهم هر چاپخانهٔ
  فعال از «چاپخانه‌ها» (هشدار پیشخوان تا آن روز می‌ماند؛ چاپخانهٔ خود جزوه‌یار 0). سفارش‌هایی که پیش از آن سپرده شوند بی سهم‌اند، و اگر سهمی دارند با «اصلاح».
- تصمیم‌ها در ADR-069؛ رابط در `docs/UI.md`، «۱۰٫۳».

#### ۱۰٫۴: موجودی کاغذ چاپخانه‌ها، کم شدن با «شروع چاپ» و هشدار کمبود (این PR)

سؤال ۲۰۴ (پاسخ «همهٔ چاپخانه‌ها»، ۱۴۰۵/۰۷/۲۸)؛ ADR-070. هر چاپخانه برای هر کاغذ و اندازه‌ای که بخواهد موجودی به برگ نگه می‌دارد: پیگیری با شمارش اول شروع می‌شود، «شروع
چاپ» هر سفارش برگ‌هایش را خودش کم می‌کند و برگرداندن به صف برمی‌گرداند، و ورود، ضایعات و شمارش دستی و فقط افزودنی‌اند؛ آستانهٔ هر قلم و کمبود برای سفارش‌های صف هشدار
پیشخوان دارند. طرح نمونهٔ جدا نداشت (سؤال ۱۸۰)؛ رابط با کیت پنل، و تصمیم‌های اجرایش سؤال‌های ۴۰۴ تا ۴۲۰ در `docs/UI.md`، «۱۰٫۴». سایت و کارگر دست نخوردند.

| جا | کار |
|---|---|
| `packages/db` | مهاجرت `0061` (تولیدی): `paper_stock_items` (چاپخانه، شناسهٔ کاغذ، اندازه، آستانهٔ اختیاری، سازنده؛ شاخص یکتای `paper_stock_items_key` برای چاپخانه × کاغذ × اندازه؛ CHECKهای `paper_stock_items_paper` و `_threshold`) و `paper_stock_moves` (قلم، نوع، تغییر برگ با نشانه، موجودی شمرده، سفارش، ردیف چاپی که برمی‌گرداند، یادداشت یا دلیل، سازنده، `request_id` یکتا؛ CHECKهای `paper_stock_moves_kind`، `_shape` برای شکل هر نوع و `_note`؛ شاخص یکتای `_undoes`). `0062` (دست‌نویس): تابع `order_paper_sheets(سفارش)` (برگ × نسخهٔ هر جزوه از `price_breakdown.items`، با کاغذ قاعدهٔ اول و اندازهٔ جزوه)، تریگر `orders_paper_stock` پس از تغییر وضعیت سفارش (کم شدن «در صف چاپ» ← «در حال چاپ» برای قلم‌های پیگیری‌شدهٔ همان چاپخانه، و برگشت هر ردیف چاپی برنگشته با رسیدن به «در صف چاپ»)، `paper_stock_moves_guard` (`_append_only`، `_automatic`، `_order`، `_undo`، قفل `FOR NO KEY UPDATE` قلم پیش از هر درج، و تغییر شمارش از موجودی همان لحظه)، و `paper_stock_items_guard` (`_no_delete` و `_frozen`). `inventory.ts` (`createInventoryStore`): نمای کلی، صفحهٔ چاپخانه و قلم در یک تراکنش `repeatable read` فقط‌خواندنی (موجودی، نام کاغذ از نسخه‌های فعال‌شده، «در تعرفه»، نیاز صف از همان `order_paper_sheets`، و ردیف‌ها با موجودی پس از هر کدام)، «کاغذ تازه»، ثبت و آستانه زیر قفل قلم با رویداد در همان تراکنش، `request_id` (همان فرم همان ردیف، با چیز دیگر `conflict`)، و هشدارها. مجوزهای تازهٔ `inventory.read` و `inventory.manage` (مالک، متصدی و کاربر چاپخانه) |
| `apps/admin` | `lib/inventory.ts` (خالص): خواندن فرم‌ها (ارقام فارسی و جداکننده، مرزها، دلیل لازم ضایعات و شمارش)، عدد با منهای واقعی، تغییر با نشانه، نام قلم، نام نوع ردیف، حال قلم و دلیل هشدار. سرویس `lib/server/inventory.ts`: مجوز پیش از هر خواندن، محدودهٔ چاپخانه (چاپخانه و قلم دیگر همان «نیست»)، ترتیب سنجش‌ها (مجوز، چاپخانه، شناسهٔ فرم، فیلدها، قلم)، و کدهای خطا. صفحه‌ها: «موجودی کاغذ» (`/inventory`، نمای کلی؛ کاربر چاپخانه یکراست به صفحهٔ خودش)، صفحهٔ چاپخانه (`/inventory/<id>`، کاغذها و «کاغذ تازه») و صفحهٔ قلم (`/inventory/<id>/<قلم>`، کاشی‌ها، «ثبت»، آستانه و ردیف‌ها)، `InventoryForms` و `StockTable`. زبانهٔ «موجودی کاغذ» پس از «ارسال»، هشدار پیشخوان، رویدادهای `inventory.*` با چیپ «موجودی کاغذ»، و متن «باز نیست» چاپخانه و حسابدار |
| تست‌ها | پایگاه داده: `order_paper_sheets`، کم شدن و برگشت در هر راه وضعیت، لغو و برگشت لغو، محافظ‌ها (درج چاپ و برگشت از بیرون تریگر، و از درون تریگر ساختگی: سفارش چاپخانهٔ دیگر، برگشت ناهمخوان و برگشت دوم)، CHECKها، ذخیره‌گاه از «کاغذ تازه» تا آستانه با `request_id` و رویداد، صفحه‌ها و محدوده، و هشدارها. واحد: فرم‌ها و نمایش (`lib/inventory.test.ts`)، سرویس با ذخیره‌گاه ساختگی (`lib/server/inventory.test.ts`)، مجوزهای نقش‌ها و رویدادها. سرتاسری: `inventory.spec.ts` (تازه)، و زبانهٔ تازه و متن «باز نیست» در `admin`، `bar`، `discounts`، `partners`، `production`، `roles`، `scope`، `settings` و `settlement` |

- **کم شدن در پایگاه داده:** هر راه «شروع چاپ» (دکمهٔ پنل، «همین است» فایل پست که در صف را با شروع چاپ و تحویل پست با هم می‌برد، و تست‌هایی که وضعیت را با SQL عوض
  می‌کنند) و هر برگرداندن از همان تریگر می‌گذرد؛ پس هیچ کدی کم شدن را فراموش نمی‌کند و ردیف چاپ و برگشت را جز همان تریگر کسی نمی‌نویسد.
- **قفل‌ها:** محافظ پیش از هر درج قلم را `FOR NO KEY UPDATE` قفل می‌کند، پس شمارش و «شروع چاپ» هم‌زمان پشت هم‌اند و تغییر شمارش از موجودی درست حساب می‌شود؛ تریگر
  ردیف‌ها را به ترتیب شناسهٔ قلم می‌نویسد تا دو «شروع چاپ» هم‌زمان قلم‌ها را به یک ترتیب قفل کنند.
- **عددها:** در `docs/UI.md`، «۱۰٫۴».
- **پس از استقرار:** مهاجرت‌های `0061` و `0062` خودکار؛ مجوزهای تازه را دادهٔ پایهٔ وب با بالا آمدن از کد می‌نشاند؛ بی ایمیج پایهٔ تازه و بی کار دستی. تا کسی «کاغذ تازه»
  نزند هیچ قلمی نیست و «شروع چاپ» هیچ ردیفی نمی‌نویسد؛ هر چاپخانه‌ای که بخواهد، از روزی که کاغذش را شمرد.
- تصمیم‌ها در ADR-070؛ رابط در `docs/UI.md`، «۱۰٫۴».

---

## ۹. قیدهای استقرار

- **بیلد از داخل ایران گیر می‌کند.** راه اصلی: ایمیج را روی سرور خارج یا در CI بساز،
  بعد `docker save` → SFTP → `docker load`. کندتر ولی هیچ‌وقت شکست نمی‌خورد.
  راه دوم: آینهٔ رجیستری و npm ایرانی در فایل بیلد. هر دو در `infra/`.
- **هیچ منبع خارجی در زمان اجرا.** قلم وزیرمتن لوکال و ساب‌ست‌شده. بدون Google Fonts،
  بدون Cloudflare.
- **توسعه روی ویندوز، دیپلوی با SSH/SFTP.** هیچ ابزاری که بیلد بومی روی ویندوز
  لازم داشته باشد انتخاب نشده.
- **پنل ادمین** روی ساب‌دامین جدا + مسیر پایهٔ محرمانه + رمز (argon2id) + TOTP (ADR-037). کانتینر جدا؛ Nginx نامش را
  هنگام درخواست حل می‌کند، پس نبودن پنل سایت را پایین نمی‌آورد.
- **پیکربندی Nginx پوشه‌ای وصل می‌شود** (`infra/nginx/conf.d/`)، نه تک‌فایل: تک‌فایل پس از `git pull` کهنه می‌ماند. استقرار
  آن را با `infra/nginx-apply.sh` به کار می‌اندازد: سنجش، بعد reload بی قطع یا ساختن دوبارهٔ کانتینر (ADR-037، «افزوده»).
- **درگاه و پیامک واقعی (برش ۷):** وب و پنل به `gateway.zibal.ir` و `api.sms.ir` درخواست می‌دهند. زیبال IP درخواست‌دهنده را با پنلش
  می‌سنجد (کد ۱۱۵، ADR-050)، پس IP سرور، و با انتقال یا نود تازه IP تازه، در پنل زیبال ثبت می‌شود؛ و IP بیرون از ایران را نمی‌پذیرد: سایت از
  ۱۴۰۵/۰۷/۰۸ روی پارس‌پک است و IP آن ثبت شد (سؤال ۱۱۳). کلید sms.ir هم به IP بستنی است. ۷٫۱ پنل را فقط با `SMS_PROVIDER=smsir` به sms.ir وصل
  می‌کند؛ ۷٫۲ «استعلام از درگاه» و «آزمایش» کد پذیرندهٔ پنل را به `ZIBAL_API_URL` (پیش‌فرض زیبال) می‌برد، و پنل ۱۱۵ را پیشخوان می‌کند. ۷٫۳ درخواستی به زیبال نمی‌افزاید، و نخواهد افزود: زیبال API بازپرداخت ندارد (۱۴۰۵/۰۷/۱۰).
