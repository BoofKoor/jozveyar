# معماری جزوه‌یار

سند کامل معماری. دلیل هر تصمیم در `docs/DECISIONS.md`. تعرفه و فرمول قیمت در `docs/PRICING.md`.

**وضعیت:** معماری تأیید شد. برش ۰ و ۱ ساخته و تست شده؛ برش ۲الف تا آپلود پیش رفته — جدول برش‌ها را ببینید.

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
| کش و نرخ | Redis (فقط کش و محدودیت OTP) | — |
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
│  ├─ text/             نرمال‌سازی فارسی، ارقام، تاریخ شمسی
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

-- انتخاب: «کاربر چه می‌خواهد». حالت فعلی = یک سطر. حالت ترکیبی = چند سطر.
CREATE TABLE print_rules (
  id            uuid PRIMARY KEY,
  document_id   uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  seq           smallint NOT NULL,
  page_ranges   jsonb NOT NULL,             -- [[1,11],[13,14],[16,150]]
  color_mode    color_mode NOT NULL,        -- color | bw
  paper_type_id uuid NOT NULL REFERENCES paper_types(id),
  UNIQUE (document_id, seq)
);
-- قاعده‌های یک سند باید ۱..page_count را دقیقاً و بدون همپوشانی بپوشانند.
-- در اپ و با یک trigger اعتبارسنجی می‌شود.

-- سفارش: قیمت برای همیشه منجمد می‌شود، هیچ‌وقت بازمحاسبه نمی‌شود.
CREATE TABLE orders (
  id                  uuid PRIMARY KEY,
  order_number        integer UNIQUE NOT NULL,  -- انسانی، همین در فایل پست می‌رود
  public_token        uuid UNIQUE NOT NULL,     -- برای URL، غیرقابل شمارش
  user_id             uuid REFERENCES users(id),
  status              order_status NOT NULL,
  price_list_version  integer NOT NULL,
  price_breakdown     jsonb NOT NULL,           -- عکس کامل محاسبه
  quote_snapshot      jsonb,                    -- آنچه مرورگر نشان داده بود
  subtotal_rials      bigint NOT NULL,
  discount_rials      bigint NOT NULL DEFAULT 0,
  shipping_rials      bigint NOT NULL DEFAULT 0,
  vat_rials           bigint NOT NULL DEFAULT 0,
  total_rials         bigint NOT NULL,
  est_weight_grams    integer NOT NULL,
  sla_days            smallint NOT NULL,
  paid_at             timestamptz,
  post_handoff_due_at timestamptz,              -- ساعت تعهد تحویل به پست
  print_partner_id    uuid REFERENCES print_partners(id),
  shipping_method_id  uuid NOT NULL,
  city_id             integer NOT NULL,
  recipient_name      text NOT NULL,
  recipient_phone     text NOT NULL,
  address_text        text NOT NULL,
  postal_code         text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
```

### بقیهٔ جدول‌ها

| حوزه | جدول‌ها | نکتهٔ طراحی |
|---|---|---|
| تعرفه | `price_lists` `paper_types` `binding_types` `binding_rate_bands` `shipping_methods` `shipping_rates` | ✅ ساخته شد. نسخه‌دار با `version` و دقیقاً یکی فعال. بازه‌های صحافی و وزن با `EXCLUDE` — دیتابیس اجازهٔ همپوشانی نمی‌دهد. `print_rates` و `pricing_settings` جدول جدا نشدند؛ دلیل در ADR-021. `discount_tiers` هنوز ساخته نشده |
| سند | `documents` `document_analyses` `document_pages` | ✅ ساخته شد. سند = فایل آپلودشده، قبل از اینکه سفارشی باشد. مالکش هش کوکی نشست ناشناس است (`session_hash`) و شناسهٔ آپلود چندتکه کنارش می‌ماند. تحلیل مرورگر و سرور **هر دو** ذخیره می‌شوند تا واگرایی قابل اندازه‌گیری باشد. `document_pages` اعداد خام رنگ را نگه می‌دارد، نه فقط بولین |
| سفارش | `order_items` `document_sources` `order_status_events` `payments` | `order_items` یک ردیف به‌ازای هر سند. `document_sources` ادغام چند PDF را می‌سازد |
| ارسال | `shipping_methods` `shipping_zones` `provinces` `cities` `shipping_rates` `shipments` | روش‌ها فلگ فعال/غیرفعال دارند. نرخ = (روش × منطقه × بازهٔ وزن) |
| رهگیری | `shipment_imports` `shipment_import_rows` | هر آپلود یک تراکنش قابل بازگشت. سطر کم‌اطمینان بدون تأیید ادمین پیامک نمی‌شود |
| دسترسی | `admin_users` `roles` `permissions` `role_permissions` `admin_user_roles` `print_partners` `order_assignments` | نقش‌محور + محدودسازی سطر با `scope` |
| هویت | `users` `otp_requests` `sessions` | موبایل نرمال‌شده. محدودیت نرخ روی شماره و IP |
| عملیات | `jobs` `sms_messages` `settings` | پیامک توسعه در دیتابیس می‌نشیند. `settings` کلید/مقدار تایپ‌شده با zod |
| سئو و آمار | `landing_pages` `landing_templates` `flow_events` | `flow_events` قیف و نرخ رها کردن سبد را می‌سازد |

### تنظیمات کلیدی در `settings`

```
order.sla_days                          = 2
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
3. برآورد رنگ کاغذ = رنگ مُد در ۱۰٪ روشن‌ترین پیکسل‌ها.
4. **تعادل سفیدی روی همان** — ته‌رنگ زرد یکدست خنثی می‌شود، هایلایت واقعی نمی‌شود.
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

فایل پست **جدول HTML با پسوند `.xls`** است. فرمت از محتوا تشخیص داده می‌شود
(جدول HTML، `.xls` واقعی، `.xlsx`، `.csv`).

ستون‌های مفید: `بارکد` (کد رهگیری ۲۴ رقمی)، `نام گ` (نام خانوادگی + کد سفارش)،
`مقصد`، `وزن`، `کرایه پستی`، `مالیات`. ستون `آدرس گ` همیشه خالی است.

### خط لوله

1. ردیف «جمع کل» را دور بریز (بارکدش عددی نیست).
2. سلول را فارسی‌نرمال کن: ي→ی، ك→ک، ارقام فارسی و عربی به لاتین، نیم‌فاصله.
3. کد سفارش را **فقط** از `نام گ` با الگوی عدد در انتهای رشته بردار ← تطبیق قطعی.
4. نبود ← نمره‌دهی با نام خانوادگی + شهر + بازهٔ وزن + تاریخ ← صف «نیازمند تأیید».
5. تأیید ادمین ← ذخیرهٔ کد رهگیری، ارسال پیامک، نمایش در پنل کاربری.
6. فایل خام و همهٔ سطرها می‌مانند تا یک ورود اشتباه با یک کلیک برگردد.

**هیچ‌وقت در همهٔ ستون‌ها نگرد.** جزئیات و دلیل در ADR-010.

---

## ۸. مسیر ساخت

هر برش قابل دیپلوی و قابل نشان دادن است. برش بعدی شروع نمی‌شود تا برش قبلی
روی سرور بالا و قابل استفاده باشد.

| # | برش | محتوا |
|---|---|---|
| 0 | ✅ اسکلت قابل دیپلوی | Docker Compose، Nginx، Dockerfile چندمرحله‌ای، `deploy.sh`، `setup-tls.sh`، سلامت سرویس |
| 1 | ✅ **لحظهٔ جادو** | فایل بینداز ← مرورگر می‌خواند ← قیمت زنده با تعرفهٔ واقعی ← تنظیمات. بدون دیتابیس و حساب. + پایه‌های سئو (رندر ایستا، متا، نقشهٔ سایت، JSON-LD). ۱۲۳ تست واحد + ۱۵ تست سرتاسری |
| 2 | سرور منبع حقیقت | ✅ اسکیمای سند و تعرفه، ✅ آپلود presigned و chunked (Garage)، ✅ تحلیل کامل کارگر پایتون و هم‌ترازی قیمت (ADR-025)؛ ۲ب: ✅ ایمیج پایه با LibreOffice و فونت‌ها (ADR-027)، ✅ تبدیل Word/PPT/عکس با پیش‌فاکتور فوری (ADR-028)، بعد هشدارها و چند فایل در یک جزوه |
| 3 | سفارش کامل با پرداخت جعلی | شهر و آدرس، نرخ ارسال، OTP، ساخت سفارش، درگاه نمونه، صفحهٔ تأیید |
| 4 | پنل ادمین نسخهٔ ۱ | TOTP روی ساب‌دامین جدا، فهرست و جزئیات سفارش، دانلود فایل، تغییر وضعیت، ویرایش تعرفه، ساعت SLA |
| 5 | چاپخانه و خروجی چاپ | نقش چاپخانه با دسترسی محدود، تخصیص سفارش، تولید PDF آمادهٔ چاپ |
| 6 | ارسال و رهگیری | ورود فایل پست، تطبیق، صف تأیید، نمایش رهگیری، گزارش حاشیهٔ ارسال |
| 7 | پیامک و درگاه واقعی | جایگزینی آداپتورها — تغییر `.env` و یک کلاس |
| 8 | پنل کاربری و آمار | سفارش‌های قبلی، سفارش مجدد، پیگیری زنده، داشبورد قیف و درآمد |
| 9 | موتور سئو و انتقال به ایران | CMS لندینگ، صفحات استانی، انتقال به پارس‌پک |

---

## ۹. قیدهای استقرار

- **بیلد از داخل ایران گیر می‌کند.** راه اصلی: ایمیج را روی سرور خارج یا در CI بساز،
  بعد `docker save` → SFTP → `docker load`. کندتر ولی هیچ‌وقت شکست نمی‌خورد.
  راه دوم: آینهٔ رجیستری و npm ایرانی در فایل بیلد. هر دو در `infra/`.
- **هیچ منبع خارجی در زمان اجرا.** قلم وزیرمتن لوکال و ساب‌ست‌شده. بدون Google Fonts،
  بدون Cloudflare.
- **توسعه روی ویندوز، دیپلوی با SSH/SFTP.** هیچ ابزاری که بیلد بومی روی ویندوز
  لازم داشته باشد انتخاب نشده.
- **پنل ادمین** روی ساب‌دامین جدا + مسیر پایهٔ محرمانه + رمز (argon2id) + TOTP.
