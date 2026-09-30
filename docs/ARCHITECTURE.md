# معماری جزوه‌یار

سند کامل معماری. دلیل هر تصمیم در `docs/DECISIONS.md`. تعرفه و فرمول قیمت در `docs/PRICING.md`.

**وضعیت:** معماری تأیید شد. برش ۰ تا ۶ ساخته، تست و مستقر شده، و مرحلهٔ طراحی رابط کاربری جز قدم ۵ تمام است (`docs/UI.md`). برش ۶ (ارسال و رهگیری) تمام شد: برنامه (#51) و ۶٫۱ تا ۶٫۴ (#52 تا #55) ادغام و مستقر شدند. برش ۷ (پیامک و درگاه واقعی، و باز شدن مسیر خرید روی سایت زنده) برنامه‌اش تأیید شد (۱۴۰۵/۰۷/۰۸)؛ برنامه و وضعیتش در بخش ۸، «برش ۷».

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
-- `stamp`ش همان `order_ticket_stamp(orders)` امروز است (نام، موبایل، نشانی و کد پستی گیرنده).
CREATE TABLE order_tickets (
  order_id    uuid PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  storage_key text NOT NULL,                -- orders/<شماره>/ticket-<اثر انگشت>.pdf
  size_bytes  bigint NOT NULL,
  sha256      text NOT NULL,
  preview_key text NOT NULL,                -- همان صفحه، PNG برای پنل
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

-- برنامهٔ برش ۷ (ADR-050): `payments` (از ۳الف) محافظ‌های خودش را می‌گیرد، و دو ستون تازه:
--   gateway_order_id      text    -- شناسهٔ تلاش نزد درگاه («10027-3f9c2a1b»)؛ یکتا برای هر درگاه
--   verified_amount_rials bigint  -- مبلغی که درگاه تأیید کرد؛ CHECK `payments_success_amount`: موفق یعنی برابر amount_rials
-- مبلغ در درج برابر orders.total_rials (`payments_amount_is_total`)؛ سفارش، درگاه، مبلغ و شناسه‌ها منجمد؛ فقط pending ← succeeded | failed،
-- و هر دو نهایی (`payments_flow`).

-- برنامهٔ برش ۷ (ADR-051): بازپرداخت سفارش لغوشده. فقط افزودنی؛ جمع بازپرداخت‌های موفق و در جریان هر پرداخت ≤ مبلغ آن؛ یکی در جریان برای هر
-- پرداخت؛ و سفارشی که بازپرداخت زنده دارد از «لغو شد» برنمی‌گردد (`orders_status_flow`).
CREATE TABLE refunds (
  id            uuid PRIMARY KEY,
  order_id      uuid NOT NULL REFERENCES orders(id),
  payment_id    uuid NOT NULL REFERENCES payments(id),    -- فقط پرداخت موفقِ سفارش «لغو شد»
  amount_rials  bigint NOT NULL,                          -- نسخهٔ اول: کل مبلغ پرداخت
  method        text NOT NULL,                            -- gateway | manual (سؤال ۱۲۳)
  status        text NOT NULL,                            -- pending ← succeeded | failed
  reference     text,                                     -- کد پیگیری درگاه یا بانک
  reason        text NOT NULL,
  admin_user_id uuid NOT NULL REFERENCES admin_users(id), -- فقط مالک، با کد تازه
  raw           jsonb,                                    -- پاسخ درگاه، بی کلید
  created_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
```

### بقیهٔ جدول‌ها

| حوزه | جدول‌ها | نکتهٔ طراحی |
|---|---|---|
| تعرفه | `price_lists` `paper_types` `binding_types` `binding_rate_bands` `shipping_methods` `shipping_rates` | ✅ ساخته شد. نسخه‌دار با `version` و دقیقاً یکی فعال. بازه‌های صحافی و وزن با `EXCLUDE` — دیتابیس اجازهٔ همپوشانی نمی‌دهد. `print_rates` و `pricing_settings` جدول جدا نشدند؛ دلیل در ADR-021. `discount_tiers` هنوز ساخته نشده. ✅ ۴٫۵ (ADR-040): `activated_at`، `created_by` و `based_on`؛ نسخه‌ای که یک بار فعال شد با تریگرهای `price_lists_frozen` و `price_list_rows_frozen` عوض و پاک نمی‌شود، جز `is_active` (`0013_price_list_guards.sql`)، و CHECK `price_lists_active_activated`: نسخهٔ فعال زمان فعال شدن دارد |
| سند | `documents` `document_analyses` `document_pages` | ✅ ساخته شد. سند = فایل آپلودشده، قبل از اینکه سفارشی باشد. مالکش هش کوکی نشست ناشناس است (`session_hash`) و شناسهٔ آپلود چندتکه کنارش می‌ماند. تحلیل مرورگر و سرور **هر دو** ذخیره می‌شوند تا واگرایی قابل اندازه‌گیری باشد. `document_pages` اعداد خام رنگ را نگه می‌دارد، نه فقط بولین |
| سفارش | `order_items` `order_item_sections` `order_status_events` `payments` | ✅ جدول‌ها و محافظ‌ها در ۳الف (ADR-034). `order_items` یک ردیف به‌ازای هر **جزوه**، نه هر سند؛ `order_item_sections` سندها را به ترتیب صحافی نگه می‌دارد و PDF ادغام‌شده از همان ساخته می‌شود (ADR-030)، با کار `prepare_order` (`jobs.order_id`). `payments` هر تلاش پرداخت، و حداکثر یک پرداخت موفق برای هر سفارش. ✅ سرور در ۳ب: ساختن در یک تراکنش، برگشت از درگاه زیر قفل پرداخت و سفارش، و `prepare_order` کارگر (پایین، «۳ب»). ✅ ۴٫۳: `order_status_events.admin_user_id` برای گذار ادمین (CHECK `order_status_events_admin`: actor ادمین یعنی شناسهٔ ادمین)، و دلیل لغو و برگرداندن در `note`. ✅ ۵٫۱ (ADR-043): `order_print_files`، فایل چاپ هر جلد، و `order_tickets`، برگهٔ سفارش با کار جدای `prepare_ticket`؛ ADR-044: فایل‌های سفارش N روز پس از پست یا لغو پاک می‌شوند و `orders.files_deleted_at` ردش را نگه می‌دارد. برنامهٔ برش ۷ (بالا؛ ADR-050، ADR-051): محافظ‌های `payments` و `refunds` |
| ارسال | `shipping_methods` `shipping_zones` `provinces` `cities` `shipping_rates` `shipments` | روش‌ها فلگ فعال/غیرفعال دارند. نرخ = (روش × منطقه × بازهٔ وزن). ✅ منطقه‌ها، استان‌ها و شهرها در ۳الف، از `@jozveyar/geo` (۳۱ استان، ۱۳۲۳ شهر)؛ منطقه مال استان است: استان تهران `tehran`، بقیه `other`. `shipments`: ✅ ۶٫۱ (بالا، ADR-045)، هر بسته با بارکد، وزن، کرایه و مالیات واقعی |
| رهگیری | `shipment_imports` `shipment_import_rows` | هر آپلود یک تراکنش قابل بازگشت. سطر کم‌اطمینان بدون تأیید ادمین پیامک نمی‌شود. ✅ ۶٫۱ (بالا؛ ADR-045، ADR-046): پیش‌نمایش پیش از «ثبت»، «قطعی» با شماره، نام، مقصد، وضعیت و روز، «ثبت» زیر قفل با همان حکم‌ها، و برگرداندن کل ورود با یک کلیک (مالک). ✅ ۶٫۲ (ADR-046، «اجرا در ۶٫۲»): صف تأیید با مالک و متصدی (نامزدها، «همین است»، «هیچ‌کدام»، دادن دستی)، کنار گذاشتن یک کد، و ورود چاپخانه فقط برای سفارش‌های خودش |
| دسترسی | `admin_users` `admin_invites` `admin_sessions` `admin_login_attempts` `roles` `permissions` `role_permissions` `admin_user_roles` `admin_events` `print_partners` `order_assignments` | نقش‌محور + محدودسازی سطر با `scope` (ADR-007). ✅ در ۴٫۱ (ADR-037، ADR-038): ادمین با رمز argon2id و رمز برنامهٔ تأیید مهروموم‌شده، پیوند ثبت یک‌باره، نشست و تلاش ورود فقط با هش؛ نقش‌ها از کد؛ رویداد فقط افزودنی، ادمین پاک‌نشدنی و پیوند مصرف‌شده دست‌نخوردنی با تریگر (`0008_admin_guards.sql`)؛ در ۴٫۲ نمایهٔ رویدادهای یک هدف، برای رویدادهای هر سفارش (`0009_admin_events_target.sql`). `scope` تا برش ۵ فقط `NULL`. ✅ در ۵٫۲ (ADR-042): `print_partners`، `order_assignments` و `orders.print_partner_id` با محافظ‌هایشان (`0017`، `0018`)، و مجوزهای `orders.assign` و `partners.manage`. ✅ در ۵٫۳ (ADR-042): `scope` jsonb جایش را به ستون نوع‌دار `admin_user_roles.print_partner_id` با کلید خارجی داد (CHECK `admin_user_roles_partner`: نقش چاپخانه یعنی دقیقاً یک چاپخانه؛ EXCLUDE `admin_user_roles_partner_alone`: کاربر چاپخانه فقط همین نقش)، نقش سوم `print_partner` و مجوزهای `orders.cancel` و `orders.money` (`0019`، `0020`). برش ۶ (ADR-046، ADR-048): ✅ ۶٫۱ مجوزهای `shipments.import` (مالک و متصدی) و `shipments.revert` (مالک)؛ ✅ ۶٫۲ `shipments.review` (مالک و متصدی) و `shipments.import` چاپخانه در محدودهٔ خودش؛ ✅ ۶٫۴ `reports.read` (فقط مالک). برنامهٔ برش ۷: `orders.refund` (فقط مالک، کار حساس؛ ADR-051) |
| هویت | `users` `otp_requests` `sessions` | ✅ جدول‌ها در ۳الف، سرویس کد و نشست در ۳ب (ADR-033). موبایل نرمال‌شده. محدودیت نرخ روی شماره، IP و کل سایت، از شمردن `otp_requests` زیر یک قفل مشورتی. کد و IP فقط HMAC |
| عملیات | `jobs` `sms_messages` `settings` `service_secrets` | پیامک توسعه در دیتابیس می‌نشیند (✅ `sms_messages` در ۳الف، پیامک کنسولی در ۳ب). `settings` کلید/مقدار تایپ‌شده با zod (✅ `SETTING_SCHEMAS` در قرارداد، ۳ب؛ مقدار خراب به پیش‌فرض برمی‌گردد و لاگ می‌شود؛ ✅ از ۴٫۶ از پنل، زیر قفل و با رویداد). ✅ ۴٫۶ (ADR-041): `service_secrets` کلیدهای سرویس‌ها که مالک از پنل گذاشته، مهروموم با `SECRETS_KEY` و جای ردیف؛ CHECK نام (فقط سه کلید) و شکل مهروموم (`0014_service_secrets.sql`)؛ مقدار پنل بر `.env` مقدم. برش ۶: ✅ کار `read_post_file` کارگر (۶٫۱، ADR-045، `jobs.shipment_import_id`)؛ ✅ پیامک رهگیری از پنل با `purpose` تازهٔ `tracking` (۶٫۳، ADR-047؛ ردیف منتظر در تراکنش مرسوله، فرستادن بعد از commit)؛ ✅ تنظیم `report.weight_bands` (۶٫۴، ADR-048): بازه‌های وزن گزارش ارسال، پیش‌فرض `'tariff'`. برنامهٔ برش ۷: پیامک پرداخت هم از صف و `sms_messages.cost`، دو کلید تازهٔ قالب در `service_secrets` (ADR-049)، `checkout_previews` (ADR-052)، و تنظیم‌های پایین |
| سئو و آمار | `landing_pages` `landing_templates` `flow_events` | `flow_events` قیف و نرخ رها کردن سبد را می‌سازد |

### تنظیمات کلیدی در `settings`

```
order.sla_days                          = 2       # روز کاری تا تحویل به پست؛ ✅ پیش‌فرضش را seedReferenceData می‌نشاند؛ از ۴٫۴ صفحهٔ اصلی و مسیر خرید هم؛ از ۴٫۶ از پنل
calendar.holidays                       = [...]   # تعطیلی‌های رسمی ۱۴۰۵ و ۱۴۰۶، `{ date: '1405/10/02', title }`؛ ✅ همان‌طور؛ از ۴٫۶ از پنل
calendar.official_through               = 1405    # تعطیلی‌ها تا پایان این سال با تقویم رسمی تطبیق داده شده‌اند؛ ✅ ۴٫۶ (هشدار قمری پنل)
otp.site_hourly_limit                   = 300     # سقف کد پیامکی کل سایت در ساعت (ADR-033)؛ ✅ از ۳ب؛ از ۴٫۶ از پنل
otp.site_daily_limit                    = 2000    # برنامهٔ برش ۷ (ADR-049): ترمز آخر روزانهٔ کد پیامکی کل سایت؛ از پنل
sms.credit_alert                        = ?       # برنامهٔ برش ۷ (ADR-049): آستانهٔ هشدار اعتبار sms.ir، پیش‌فرض اعتبار ۱٬۰۰۰ تکه
checkout.audience                       = preview # برنامهٔ برش ۷ (ADR-052): مخاطب مسیر خرید در live: paused | preview | everyone؛ فقط مالک
order.files_retention_days              = 30      # فایل‌های سفارش چند روز پس از «تحویل پست شد» یا «لغو شد» پاک می‌شوند (ADR-044)؛ ✅ ۵٫۱، ۷ تا ۳۶۵، از پنل؛ ✅ ۶٫۱ فایل خام پست هم (ADR-045)، و ۶٫۲ متن سطر «هیچ‌کدام»
order.min_order_rials                   = 0
file.max_pages                          = 1500
file.max_bytes                          = 1_610_612_736   # 1.5 GiB
file.retention_days                     = 2
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
| 7 | پیامک و درگاه واقعی — برنامه تأیید شد | آداپتور sms.ir و زیبال پشت همان اینترفیس‌ها (پنل پیامک sms.ir از ۱۴۰۵/۰۷/۰۸، نه کاوه‌نگار)، استعلام و بازپرداخت، صفحه‌های ثابت (قدم ۵)، و باز شدن مسیر خرید روی سایت زنده (`live`). شش PR پس از طرح نمونه (پایین، «برش ۷») |
| 8 | پنل کاربری و آمار | سفارش‌های قبلی، سفارش مجدد، پیگیری زنده، داشبورد قیف و درآمد |
| 9 | موتور سئو و انتقال به ایران | CMS لندینگ، صفحات استانی، انتقال به پارس‌پک |

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
- **پرداخت:** هر تلاش یک ردیف `payments`، و نیم ساعت اعتبار. برگشت زیر قفل ردیف پرداخت و سفارش؛ موفق در یک
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
| طرح | طرح نمونهٔ سایت و پنل برش ۷، بیرون از گیت و پیش از ۷٫۱ (`docs/UI.md`، بخش ۱۰) | هیچ | مانده |
| ۷٫۱ | پیامک sms.ir: آداپتور پشت `SmsTransport` برای کد، پرداخت و رهگیری؛ دو کلید تازهٔ قالب (مهاجرت `0027`)؛ کلید با هر استفاده (`readServiceKey`)؛ پیامک پرداخت از صف؛ سقف کد و اعتبار پیامک؛ «آزمایش» کلید و قالب؛ سرور ساختگی sms.ir | مشتری هیچ (مسیر خرید `off`)؛ پنل: کلیدهای قالب، «آزمایش»، کارت اعتبار؛ پیامک رهگیری واقعی فقط با `SMS_PROVIDER=smsir` | مانده |
| ۷٫۲ | درگاه زیبال: پکیج مشترک `packages/payments`؛ شروع، برگشت با پارامترهای زیبال، استعلام پیش از `verify`، «پرداخت در حال بررسی است»، استعلام خودکار «پرداخت بی برگشت»؛ محافظ‌های `payments` (مهاجرت `0028`)؛ «آزمایش» کد پذیرنده؛ سرور ساختگی زیبال | مشتری هیچ؛ پنل: جزئیات پرداخت و «استعلام از درگاه» | مانده |
| ۷٫۳ | بازپرداخت سفارش لغوشده: از درگاه اگر زیبال API دارد، وگرنه ثبت دستی؛ `refunds` (مهاجرت `0029`)؛ صفحهٔ سفارش مشتری | مشتری هیچ تا سفارشی نیست؛ پنل: بازپرداخت در سفارش لغوشده | مانده؛ شکلش بسته به مستند (سؤال ۱۲۳) |
| ۷٫۴ | قدم ۵: `/terms`، `/privacy`، `/about` و `/contact`، با پیوند در پاورقی و نقشهٔ سایت | چهار صفحهٔ تازه | منتظر اطلاعات تماس (سؤال ۴)؛ هر وقت رسید، حتی پیش از ۷٫۱ |
| ۷٫۵ | روشن کردن `live`: آمادگی زمان اجرا به جای `LIVE_ADAPTERS_READY`، دامنهٔ مسیر خرید از پنل (پیش‌نمایش مالک، همه، متوقف)، برگشت و استعلام در `off` هم، و سرتاسری `live` با دو سرور ساختگی | با `.env` امروز هیچ؛ بعد پیش‌نمایش مالک، بعد همه | مانده؛ پس از ۷٫۱ تا ۷٫۴ و کارهای دستی |
| ۷٫۶ | پیامک به چاپخانه، برای چاپخانه‌ای که موبایل اعلان دارد | فقط همان چاپخانه | مانده؛ پس از `live` (سؤال ۱۲۶) |

**وابستگی‌ها:** ۷٫۱ و ۷٫۲ به هم بند نیستند و هر کدام با سرور ساختگی خودش سنجیده می‌شود؛ ۷٫۳ پس از ۷٫۲ (همان پکیج درگاه)؛ ۷٫۴ فقط به
اطلاعات تماس بند است؛ ۷٫۵ آخر، پس از همه و کارهای دستی پایین؛ ۷٫۶ پس از باز شدن مسیر خرید. تا ۷٫۵ مسیر خرید سایت زنده `off` است و
هیچ PR رفتار امروز مشتری را عوض نمی‌کند، جز صفحه‌های ثابت ۷٫۴.

**سنجیده پیش از برنامه** (هیچ درخواستی به API زیبال یا sms.ir نرفت؛ جزئیات و منبع هر ادعا در ADR-049 و ADR-050):
- صفحه‌های مستند (`help.zibal.ir`، `docs.zibal.ir`، `zibal.ir`، `sms.ir`، `app.sms.ir`) از این محیط باز نشدند: سیاست شبکهٔ محیط بستشان.
- جایش بستهٔ رسمی هر دو خوانده شد، فقط فایل، نه نصب و نه اجرا: زیبال `zibal` ۲٫۰٫۰ (نگه‌دارنده `zibalco`، 2026-08-22؛
  https://www.npmjs.com/package/zibal)؛ sms.ir `smsir-js` ۱٫۳٫۳ («Official sms.ir npm package»، نگه‌دارنده `ipecompany`؛
  https://www.npmjs.com/package/smsir-js) و `smsir-python` ۱٫۰٫۸ از همان مخزن سازمانی (https://pypi.org/project/smsir-python/).
- از آنها: نشانی‌ها و شکل درخواست `request`، `verify` و شروع پرداخت زیبال، کدهای `result` و `status`، کد ۱۱۵ «IP درخواست‌دهنده در پنل کاربری
  ثبت نشده است»، سرآیند `Referer` که صفحهٔ پرداخت زیبال می‌خواهد، و merchant آزمایشی `zibal`؛ نشانی پایه، سرآیند کلید، ارسال با قالب، گزارش
  یک پیامک و اعتبار sms.ir.
- **هنوز باز، منتظر متن مستند رسمی:** پارامترهای برگشت زیبال (نام و معنا)، شکل `inquiry` و «Lazy»، API بازپرداخت و شرطش، زمان برگشت
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

**جریان پول (پیشنهاد):** «پرداخت» ← سفارش و تلاش پرداخت با مبلغ منجمد ← `request` زیبال ← صفحهٔ پرداخت، با Referer دامنهٔ ما ← برگشت با
شناسهٔ تلاش ← زیر قفل: استعلام، و `verify` فقط برای «پرداخت‌شده، تأییدنشده» با مبلغ و شناسهٔ همان تلاش ← «در صف چاپ» و پیامک پرداخت ←
(لغو ← بازپرداخت). بی پاسخ درگاه: «پرداخت در حال بررسی است»، و استعلام خودکار تا نتیجه.

**سؤال‌ها** (تأیید ۱۴۰۵/۰۷/۰۸، همه طبق پیشنهاد؛ جزئیات در ADR‌ها). مستند رسمی هنوز از این محیط باز نمی‌شود (۱۴۰۵/۰۷/۰۸، دوباره با `https://sms.ir/web-service/` و `https://help.zibal.ir/#docs` که صاحب
پروژه داد)؛ پیشنهادهای شرطی (۱۱۳، ۱۱۵ شکل روز تحویل، ۱۱۸، ۱۱۹ آزمایش کد پذیرنده، ۱۲۰ ترتیب استعلام و `verify`، ۱۲۱ و ۱۲۳) با
متن مستند قطعی می‌شوند: sms.ir پیش از ۷٫۱، زیبال پیش از ۷٫۲.
- **۱۱۲. ترتیب PRها.** پیشنهاد: همان جدول؛ ۷٫۴ هر وقت اطلاعات تماس رسید و حتماً پیش از ۷٫۵. دلیل: هر PR جدا با سرور ساختگی سنجیدنی و
  روی سایت زنده بی‌اثر است؛ `live` PR کوچک آخری است که فقط تکه‌های آماده را کنار هم می‌گذارد، پس برگشتش هم ساده است.
- **۱۱۳. سرور بیرون از ایران.** زیبال IP درخواست‌دهنده را با پنل می‌سنجد (کد ۱۱۵)؛ دسترسی از IP بیرون ایران و شرط میزبانی داخلی سنجیده
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
- **۱۱۸. تماس صوتی** (سؤال ۱۰). پیشنهاد: اگر مستند sms.ir ندارد، سؤال ۱۰ بسته: «پیامک نرسید» همان «ارسال دوباره» و «عوضش کن»؛ اگر دارد، در
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
- **۱۲۱. مهلت تلاش و پول تأییدنشده.** پیشنهاد: مهلت هر تلاش (امروز ۳۰ دقیقه) کمتر از زمان برگشت خودکار پول تأییدنشدهٔ زیبال بماند؛ پس از
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

**داده و محافظ‌ها** (مهاجرت تازه، هر محافظ با شاهد جهش؛ طرحشان در بخش ۵):
- `0027` (۷٫۱): CHECK `service_secrets_name` با `SMS_PAID_TEMPLATE` و `SMS_TRACKING_TEMPLATE` (و در ۷٫۶ `SMS_PARTNER_TEMPLATE`)؛ `sms_messages`: گذار
  منتظر و در حال فرستادن برای پیامک پرداخت هم (`sms_messages_guard`)، و `cost` اگر سؤال ۱۱۶ آری؛ نمایهٔ `otp_requests` روی مرورگر (`session_hash`)
  برای سقف هر مرورگر؛ کد و پارامترهایش با پنل واقعی هرگز در پایگاه داده. شماره‌ها به ترتیب ادغام.
- `0028` (۷٫۲): روی `payments`: مبلغ در درج برابر `orders.total_rials` همان سفارش (`payments_amount_is_total`)؛ سفارش، درگاه، مبلغ و شناسهٔ تلاش پس
  از درج منجمد؛ گذار فقط در انتظار ← موفق یا ناموفق، و این دو نهایی (`payments_flow`)؛ ستون تازهٔ `verified_amount_rials` با CHECK «موفق یعنی
  برابر مبلغ» (`payments_success_amount`)؛ و `gateway_order_id` (شناسهٔ تلاش نزد درگاه) یکتا. موجودها می‌مانند: یک موفق برای هر سفارش
  (`payments_one_success`)، و موفق با کد پیگیری (`payments_success_has_ref`).
- `0029` (۷٫۳): `refunds` فقط افزودنی؛ فقط برای پرداخت موفق سفارش لغوشده؛ جمع بازپرداخت‌های زنده ≤ مبلغ پرداخت؛ یکی در جریان؛ و سفارشی که
  بازپرداخت زنده دارد از «لغو شد» برنمی‌گردد (`orders_status_flow`).
- `0030` (۷٫۵): `checkout_previews` (پیوند یک‌باره و کوکی پیش‌نمایش، فقط هش، مثل `admin_invites`). تنظیم `checkout.audience` و سقف‌های تازه
  با `SETTING_SCHEMAS` و دادهٔ پایه، بی مهاجرت (مثل ۴٫۶).
- ۷٫۶: `print_partners.notify_mobile` و `purpose` تازهٔ پیامک چاپخانه.
- **یک پرداخت موفق، برگشت تکراری یا هم‌زمان:** همان قفل ردیف پرداخت و سفارش (`settlePayment`) و `payments_one_success`؛ دو برگشت یک تلاش
  پشت‌سرهم و درگاه یک بار؛ برگشت و استعلام خودکار هم همان قفل؛ دو تلاش پرداخت‌شدهٔ یک سفارش: اولی موفق، دومی هرگز `verify` (سؤال ۱۲۱).
- **مبلغ فقط از سرور، قیمت منجمد:** مبلغ درگاه `payments.amount_rials` است که پایگاه داده برابر `orders.total_rials` منجمد می‌خواهد
  (قاعده‌های ۲ و ۶)؛ `verify` مبلغ و شناسهٔ تلاش را با همان می‌سنجد؛ «دوباره پرداخت کن» همان مبلغ.

**امنیت:**
- **برگشت جعلی یا دست‌ساز:** نشانی برگشت فقط شناسهٔ تلاش را می‌دهد؛ تلاشی که در پایگاه داده نیست ۴۰۴؛ «موفق» فقط از استعلام و `verify`
  سرور به سرور، با مبلغ و شناسهٔ همان تلاش؛ پارامتر «موفق» یا «ناموفق» نشانی هیچ‌وقت خوانده نمی‌شود، پس برگشت زودرس با «ناموفق» پرداخت را
  نمی‌سوزاند (زیبال هنوز «در انتظار» می‌گوید).
- **هر درگاه فقط پرداخت‌های خودش** (`payments.provider`): درگاه نمونه هرگز روی jozveyar.com (ADR-035)، و `live` هرگز با درگاه نمونه.
- **کلیدها فقط مهروموم پنل یا `.env`** (ADR-041)، با هر استفاده؛ مقدار تازهٔ «آزمایش» فقط در حافظهٔ همان درخواست.
- **هیچ مقدار کلید در لاگ، رویداد، خطا یا HTML**، جز ۴ نویسهٔ آخر در «تنظیمات»: آداپتورها سرآیند و بدنهٔ درخواست را لاگ نمی‌کنند؛ خطا فقط
  کد خودش و کد عددی سرویس؛ `payments.raw` فقط پاسخ درگاه (بی کد پذیرنده)؛ کد تأیید و پارامترش در پایگاه داده نه؛ و CI مقدار کلیدهای ساختگی
  را در لاگ وب و پنل می‌جوید (مثل ۴٫۶).
- **پیوند پیش‌نمایش** یک‌باره، ۱۵ دقیقه، و فقط هشش در پایگاه داده؛ کوکی `HttpOnly` و `Secure`.

**راه‌اندازی مرحله‌ای و ترمز** (ADR-052):
1. ۷٫۱ تا ۷٫۴ مستقر؛ `.env` همان امروز (`off`، `mock`، `console`).
2. کارهای دستی (پایین) و «آزمایش» هر کلید در «تنظیمات».
3. ۷٫۵ مستقر؛ `.env`: `PAYMENT_PROVIDER=zibal`، `SMS_PROVIDER=smsir`، `CHECKOUT_MODE=live`. مخاطب پیش‌فرض «پیش‌نمایش مالک»: مردم همچنان «ثبت سفارش
   آنلاین به‌زودی» می‌بینند.
4. پیش‌نمایش: یک سفارش واقعی کوچک خودت تا پیامک رهگیری (پرداخت، پیامک پرداخت، چاپ، فایل پست، پیامک رهگیری)، و یک سفارش دیگر تا لغو و
   بازپرداخت.
5. «همه» در پنل، با کد تازه. پیشخوان در روزهای اول: «پرداخت بی برگشت»، «مبلغ ناهمخوان»، اعتبار پیامک و سقف کد.
6. **ترمز:** «متوقف» در پنل، همان لحظه و بی SSH؛ `CHECKOUT_MODE=off` در `.env` دیوار دوم. در هر دو، برگشت از درگاه و استعلام پرداخت‌های در راه
   کار می‌کنند.

**سنجش‌ها** (هر محافظ با شاهد جهش، مثل برش ۶):
- ۷٫۱: واحد آداپتور روی سرور ساختگی sms.ir (نام پارامترها، قالب هر هدف، خطاها و سقف زمان، کد و کلید نه در لاگ و نه در ردیف)؛ سقف‌های کد با ساعت
  ساختگی و پستگرس (دروازهٔ جزوه، هر مرورگر، روزانه، هم‌زمانی)؛ پیامک پرداخت از صف؛ «آزمایش» (رد ذخیره نمی‌شود)؛ سرتاسری پنل با پیامک رهگیری
  به سرور ساختگی.
- ۷٫۲: واحد آداپتور روی سرور ساختگی زیبال (هر `result` و `status`، ۲۰۱، ۲۰۲، ۱۱۵، سقف زمان)؛ پستگرس (هر محافظ `0028` با نام محدودیت، دو برگشت
  هم‌زمان، برگشت و استعلام هم‌زمان، دو تلاش پرداخت‌شده)؛ برگشت دست‌ساز «موفق» و برگشت زودرس «ناموفق» (شاهد: خواندن پارامتر نشانی)؛ مبلغ یا
  شناسهٔ ناهمخوان (شاهد: برداشتن سنجش).
- ۷٫۳: پستگرس (جمع، یکی در جریان، برگشت لغو)؛ سرتاسری پنل با کد تازه.
- ۷٫۴: `site.spec.ts` (هیچ منبع بیرونی، پیوندها، نقشهٔ سایت)؛ باندل اولیه همان ۱۰۷٬۶۳۳ بایت.
- ۷٫۵: سرتاسری `live` روی `127.0.0.1` با دو سرور ساختگی: کد، پرداخت، برگشت، «در حال بررسی» و استعلام، «دوباره پرداخت کن» با Referer، «متوقف» وسط
  پرداخت؛ مخاطب «پیش‌نمایش» بی کوکی «به‌زودی» می‌بیند؛ `mock` روی jozveyar.com همچنان خاموش؛ و مقدار کلیدهای ساختگی نه در لاگ.

**بیرون از برش ۷:** انتقال سرور به ایران (برش ۹؛ مگر پاسخ سؤال ۱۱۳ آن را پیش بیندازد)؛ خواندن گزارش تحویل پیامک (سؤال ۱۱۶)؛ پیامک تبلیغاتی،
فهرست مشترک و ایمیل؛ درگاه دوم یا جابه‌جایی خودکار درگاه؛ «Lazy» زیبال (مگر مستند نشان دهد برگشت بی مرورگر را حل می‌کند)؛ بازپرداخت بخشی؛
تسویه و گزارش مالی زیبال؛ کد تخفیف و پنل کاربری (برش ۸)؛ وضعیت بسته درون صفحه (سؤال ۷۴)؛ تماس صوتی (سؤال ۱۱۸).

**دست نمی‌خورد:** تز محصول؛ قیمت و کرایهٔ منجمد و تعرفه (مبلغ درگاه همان جمع منجمد است)؛ باندل اولیهٔ سایت (۱۰۷٬۶۳۳ بایت در ۵ اسکریپت): مسیر خرید
در تکهٔ جدای خودش می‌ماند، صفحهٔ سفارش و صفحه‌های ثابت کامپوننت سرورند، و مرورگر حالت را همان‌طور از `GET /api/checkout` می‌گیرد؛ ایمیج پایهٔ
کارگر (کارگر دست نمی‌خورد)؛ و درگاه نمونه با مرحلهٔ `mock` CI.

**کار دستی صاحب پروژه:**
- **متن مستند رسمی:** sms.ir پیش از ۷٫۱ و زیبال پیش از ۷٫۲ (یا باز کردن همان پنج دامنه در تنظیمات شبکهٔ محیط: منوی محیط ابری در نوار
  عنوان سشن، Edit، Network access)؛ قیمت هر تکهٔ پیامک از تعرفه یا پنل sms.ir؛ و آنچه زیبال هنگام تأیید درگاه دربارهٔ IP، دامنه یا میزبانی گفت.
- **پیش از ۷٫۱:** سنجش اتصال سؤال ۱۱۳؛ ساختن سه قالب در sms.ir با متن و نام پارامترهای ADR-049 و فرستادن برای تأیید؛ ثبت IP سرور
  در پنل زیبال (و محدودیت IP کلید sms.ir، اگر هست).
- **پیش از ۷٫۴:** اطلاعات تماس (سؤال ۴)، و خواندن پیش‌نویس قوانین و حریم خصوصی.
- **پیش از ۷٫۵ و در آن:** شارژ اعتبار sms.ir؛ شناسهٔ سه قالب و کلیدها در «تنظیمات»، هر کدام با «آزمایش»؛ `.env` قدم ۳ بالا؛ پیش‌نمایش و بعد «همه».
- **تا پایان ۱۴۰۵:** تطبیق تعطیلی‌های قمری ۱۴۰۶ از پنل با انتشار تقویم رسمی (سؤال ۱۲۵).
- **همیشه:** نسخهٔ پشتیبان `.env`.

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
- **درگاه و پیامک واقعی (برنامهٔ برش ۷):** وب و پنل به `gateway.zibal.ir` و `api.sms.ir` درخواست می‌دهند. زیبال IP درخواست‌دهنده را با پنلش
  می‌سنجد (کد ۱۱۵، ADR-050)، پس IP سرور، و با انتقال یا نود تازه IP تازه، در پنل زیبال ثبت می‌شود. دسترسی از بیرون ایران و شرط میزبانی داخلی
  هنوز سنجیده نشده (سؤال ۱۱۳).
