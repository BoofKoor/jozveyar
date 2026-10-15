/*
 * قالب‌های پیش‌فرض برگه‌ها و فهرست متغیرهایشان، ساخته‌شده از روی services/docworker/docworker/templates؛ دستی ویرایش نکنید.
 * قالب یا متغیر تازه: همان‌جا عوض کنید و `UPDATE_TICKET_TEMPLATES=1 pnpm test` بزنید.
 */

export const DEFAULT_TICKET_TEMPLATES = {
  bijak: "<!DOCTYPE html>\n<html lang=\"fa\" dir=\"rtl\">\n<head>\n<meta charset=\"utf-8\">\n<title>بیجک سفارش {{ order.number }}</title>\n{#- نام یا نشانی بلند (تا ۱۰۰ و ۵۰۰ نویسه): قلم کوچک‌تر و جای بیشتر برای برچسب، تا با فهرست جزوه‌ها روی هم نیفتد. #}\n{%- set long = order.label_name|length > 40 or order.address|length > 140 %}\n<style>\n  /* قالب پیش‌فرض بیجک جزوه‌یار (برش ۹٫۲): همان سر و برچسب پست برگهٔ سفارش ۵٫۱، با فهرست جزوه‌ها. فقط سیاه (رنگ پیش‌فرض متن و خط‌ها)، برای چاپ تک‌رنگ. */\n  @page { size: A4; margin: 15mm; }\n  /* برچسب پست همیشه پایین صفحهٔ اول، برای بریدن: در حاشیهٔ پایین همان صفحه، و فهرست بالای آن (و اگر بلند است، صفحهٔ بعد). */\n  @page :first {\n    margin-bottom: {{ '152mm' if long else '118mm' }};\n    @bottom-center { content: element(label); vertical-align: bottom; }\n  }\n  html { font-family: Vazirmatn, sans-serif; font-size: 13pt; line-height: 1.6; }\n  body { margin: 0; }\n  p { margin: 0; }\n  .ltr { direction: ltr; unicode-bidi: isolate; }\n  .k { font-size: 12pt; }\n  .no { font-size: 60pt; font-weight: 600; line-height: 1.05; }\n  .due { font-size: 18pt; font-weight: 600; margin-top: 10pt; }\n  .rule { border-top: 1.8pt solid; margin: 14pt 0 10pt; }\n  table { border-collapse: collapse; width: 100%; }\n  tr { break-inside: avoid; }\n  th { font-size: 11pt; font-weight: 600; text-align: start; padding: 0 0 4pt; border-bottom: 1pt solid; }\n  td { vertical-align: top; padding: 5pt 6pt 5pt 0; border-bottom: 0.6pt solid; }\n  td.n { font-weight: 600; width: 22pt; }\n  .c { white-space: nowrap; text-align: end; }\n  .file { font-size: 10pt; }\n  .total { margin-top: 8pt; font-weight: 600; }\n  .bottom { position: running(label); width: 100%; padding-bottom: 15mm; }\n  .cutline { border-top: 1.8pt dashed; margin-bottom: 3pt; }\n  .cut { font-size: 11pt; text-align: center; margin-bottom: 10pt; }\n  .label { border: 2.4pt solid; padding: 14pt 18pt; }\n  .name { font-size: 24pt; font-weight: 600; line-height: 1.4; }\n  .addr { font-size: 17pt; margin-top: 4pt; }\n  .long .name { font-size: 18pt; }\n  .long .addr { font-size: 12pt; }\n  .row { font-size: 17pt; margin-top: 6pt; }\n  .row span { white-space: nowrap; margin-inline-end: 24pt; }\n  .foot { font-size: 10pt; margin-top: 6pt; }\n</style>\n</head>\n<body>\n  {#- برچسب اول می‌آید تا صفحهٔ اول بگیردش (`position: running`)، هر قدر فهرست بلند باشد. #}\n  <div class=\"bottom\">\n    <div class=\"cutline\"></div>\n    <p class=\"cut\">برچسب پست: از اینجا ببر</p>\n    <div class=\"label{% if long %} long{% endif %}\">\n      <p class=\"k\">گیرنده</p>\n      <p class=\"name\">{{ order.label_name }}</p>\n      <p class=\"addr\">{{ order.address }}</p>\n      <p class=\"row\">\n        {%- if order.postal_code %}<span>کد پستی {{ order.postal_code }}</span>{% endif -%}\n        <span>موبایل <bdi class=\"ltr\">{{ order.phone_display }}</bdi></span><span>{{ order.shipping }}</span>\n      </p>\n    </div>\n    <p class=\"foot\">شمارهٔ کنار نام را متصدی پست در نام گیرنده می‌نویسد؛ کد رهگیری با همین پیدا می‌شود.</p>\n  </div>\n\n  <p class=\"k\">جزوه‌یار · بیجک سفارش</p>\n  <p class=\"no\">{{ order.number }}</p>\n  <p class=\"due\">تحویل به پست تا {{ order.due_day }}</p>\n  <p class=\"k\">\n    {%- if order.partner %}{{ order.partner.name }}، {{ order.partner.city }}{% endif -%}\n    {%- if order.partner and order.paid_at %} · {% endif -%}\n    {%- if order.paid_at %}پرداخت {{ order.paid_at }}{% endif -%}\n  </p>\n  <div class=\"rule\"></div>\n  <table>\n    <tr><th></th><th>جزوه</th><th>چاپ</th><th>صحافی</th><th class=\"c\">تعداد</th></tr>\n    {%- for f in order.files %}\n    <tr>\n      <td class=\"n\">{{ f.seq }}</td>\n      <td>{{ f.file_count }} فایل، {{ f.pages }} صفحه<br><span class=\"file ltr\">{{ f.saved_file_name }}</span></td>\n      <td>{{ f.mode }}<br><span class=\"file\">{{ f.papers }}</span></td>\n      <td>{{ f.binding }}{% if f.volume_count > 1 %} · {{ f.volume_words }} جلد{% endif %}</td>\n      <td class=\"c\">{{ f.copies }} نسخه</td>\n    </tr>\n    {%- endfor %}\n  </table>\n  <p class=\"total\">{{ order.jozve_count }} جزوه · {{ total_copies }} نسخه</p>\n</body>\n</html>\n",
  first_page: "<!DOCTYPE html>\n<html lang=\"fa\" dir=\"rtl\">\n<head>\n<meta charset=\"utf-8\">\n<title>برگهٔ اول جزوهٔ {{ jozve.seq }}، سفارش {{ order.number }}</title>\n<style>\n  /* قالب پیش‌فرض برگهٔ اول جزوه‌یار (برش ۹٫۲): روی دستهٔ هر جزوه، همان مشخصات جزوهٔ برگهٔ سفارش ۵٫۱. فقط سیاه (رنگ پیش‌فرض متن و خط‌ها)، برای چاپ تک‌رنگ. */\n  @page { size: A4; margin: 15mm; }\n  html { font-family: Vazirmatn, sans-serif; font-size: 14pt; line-height: 1.6; }\n  body { margin: 0; }\n  p { margin: 0; }\n  .ltr { direction: ltr; unicode-bidi: isolate; }\n  .k { font-size: 13pt; }\n  .no { font-size: 60pt; font-weight: 600; line-height: 1.05; }\n  .of { font-size: 22pt; font-weight: 600; margin-top: 6pt; }\n  .who { font-size: 16pt; margin-top: 4pt; }\n  .rule { border-top: 1.8pt solid; margin: 14pt 0 12pt; }\n  .mode { display: inline-block; font-size: 20pt; font-weight: 600; border: 2.1pt solid; padding: 2pt 12pt; margin-bottom: 12pt; }\n  table { border-collapse: collapse; width: 100%; }\n  td { vertical-align: top; padding: 3pt 0; }\n  td.dt { font-weight: 600; width: 80pt; }\n  td.pg { white-space: nowrap; text-align: end; }\n  .copies { font-size: 22pt; font-weight: 600; margin-top: 14pt; }\n  .foot { position: absolute; bottom: 0; width: 100%; font-size: 10pt; }\n</style>\n</head>\n<body>\n  <p class=\"k\">جزوه‌یار · برگهٔ اول</p>\n  <p class=\"no\">{{ order.number }}</p>\n  <p class=\"of\">جزوهٔ {{ jozve.seq }} از {{ jozve.of }}</p>\n  <p class=\"who\">{{ order.receiver_name }} · تحویل به پست تا {{ order.due_day }}</p>\n  <div class=\"rule\"></div>\n  <p class=\"mode\">{{ jozve.mode }}</p>\n  <table>\n    <tr>\n      <td class=\"dt\">فایل‌ها</td>\n      <td>\n        <table>\n          {%- for file in jozve.files %}\n          <tr><td>{{ file.n }}. <bdi>{{ file.name }}</bdi></td><td class=\"pg\">صفحهٔ {{ file.first_page }}{% if file.last_page != file.first_page %} تا {{ file.last_page }}{% endif %}</td></tr>\n          {%- endfor %}\n        </table>\n      </td>\n    </tr>\n    <tr><td class=\"dt\">چاپ</td><td>{{ jozve.pages }} صفحه، {{ jozve.sheets }} برگ · {{ jozve.papers }}{% if jozve.odd %} · فرد: پشت برگ آخر سفید{% endif %}</td></tr>\n    <tr><td class=\"dt\">صحافی</td><td>{{ jozve.binding }} · {{ jozve.volume_words }} جلد</td></tr>\n    <tr>\n      <td class=\"dt\">{% if jozve.volume_count > 1 %}جلدها{% else %}فایل چاپ{% endif %}</td>\n      <td>\n        <table>\n          {%- for v in jozve.volumes %}\n          <tr>\n            <td><bdi class=\"ltr\">{{ v.file_name }}</bdi></td>\n            {%- if jozve.volume_count > 1 %}<td class=\"pg\">صفحهٔ {{ v.first_page }} تا {{ v.last_page }} · {{ v.sheets }} برگ</td>{% endif %}\n          </tr>\n          {%- endfor %}\n        </table>\n      </td>\n    </tr>\n  </table>\n  <p class=\"copies\">{{ jozve.copies }} نسخه</p>\n  <p class=\"foot\">این برگه روی دستهٔ جزوهٔ {{ jozve.seq }} می‌آید؛ بیجک سفارش روی بسته.</p>\n</body>\n</html>\n",
} as const;

export const TICKET_TEMPLATE_VARIABLES: readonly {
  title: string;
  prefix: string;
  in: readonly ('bijak' | 'first_page')[];
  fields: readonly (readonly [string, string, string])[];
}[] = [
  {
    "title": "سفارش، در هر دو قالب",
    "prefix": "order",
    "in": [
      "bijak",
      "first_page"
    ],
    "fields": [
      [
        "id",
        "شمارهٔ سفارش",
        "10027"
      ],
      [
        "number",
        "شمارهٔ سفارش (همان id)",
        "10027"
      ],
      [
        "receiver_name",
        "نام گیرنده",
        "مریم کاظمی"
      ],
      [
        "label_name",
        "نام گیرنده با شمارهٔ سفارش کنارش، برای «نام گ» پست؛ کد رهگیری با همین پیدا می‌شود",
        "مریم کاظمی 10027"
      ],
      [
        "phone",
        "موبایل گیرنده",
        "09152345678"
      ],
      [
        "phone_display",
        "موبایل با فاصله",
        "0915 234 5678"
      ],
      [
        "postal_code",
        "کد پستی؛ خالی اگر نداده",
        "9187654321"
      ],
      [
        "address",
        "نشانی کامل: استان، شهر و نشانی",
        "خراسان رضوی، مشهد، بلوار سجاد، سجاد 18، پلاک 42، واحد 6"
      ],
      [
        "province",
        "استان",
        "خراسان رضوی"
      ],
      [
        "city",
        "شهر",
        "مشهد"
      ],
      [
        "address_line",
        "نشانی بی استان و شهر",
        "بلوار سجاد، سجاد 18، پلاک 42، واحد 6"
      ],
      [
        "shipping",
        "روش ارسال",
        "پست پیشتاز"
      ],
      [
        "due_day",
        "روز تحویل به پست",
        "دوشنبه 13 مهر 1405"
      ],
      [
        "paid_at",
        "روز و ساعت پرداخت",
        "شنبه 11 مهر، 14:05"
      ],
      [
        "partner.name",
        "نام چاپخانهٔ سفارش؛ خالی اگر بی چاپخانه",
        "چاپ نور"
      ],
      [
        "partner.city",
        "شهر چاپخانه",
        "مشهد"
      ],
      [
        "files",
        "فهرست جزوه‌ها، به ترتیب؛ هر کدام با فیلدهای «جزوه» پایین",
        "[…]"
      ],
      [
        "jozve_count",
        "شمار جزوه‌ها",
        "2"
      ],
      [
        "total_copies",
        "جمع نسخه‌های همهٔ جزوه‌ها",
        "3"
      ]
    ]
  },
  {
    "title": "هر دو قالب",
    "prefix": "",
    "in": [
      "bijak",
      "first_page"
    ],
    "fields": [
      [
        "total_copies",
        "جمع نسخه‌های همهٔ جزوه‌ها (همان order.total_copies)",
        "3"
      ]
    ]
  },
  {
    "title": "جزوه: هر ردیف order.files، و در برگهٔ اول jozve و print_info.file_info",
    "prefix": "f",
    "in": [
      "bijak",
      "first_page"
    ],
    "fields": [
      [
        "seq",
        "شمارهٔ جزوه در سفارش",
        "1"
      ],
      [
        "of",
        "شمار جزوه‌های سفارش",
        "2"
      ],
      [
        "file_name",
        "نام فایل؛ چند فایل: نام اولی و شمار بقیه",
        "ریاضی ۲ - جلسه ۱.pdf و 2 فایل دیگر"
      ],
      [
        "saved_file_name",
        "نام فایل چاپ، همان که دانلود می‌شود؛ چند جلد: پیشوند مشترک جلدها",
        "jozve-10027-1.pdf"
      ],
      [
        "files",
        "فایل‌های جزوه به ترتیب صحافی؛ هر کدام n، name، pages، first_page و last_page",
        "[…]"
      ],
      [
        "files[].n",
        "شمارهٔ فایل در جزوه",
        "1"
      ],
      [
        "files[].name",
        "نام فایلی که مشتری فرستاد",
        "ریاضی ۲ - جلسه ۱.pdf"
      ],
      [
        "files[].pages",
        "صفحهٔ همین فایل",
        "48"
      ],
      [
        "files[].first_page",
        "اولین صفحهٔ فایل در جزوه",
        "1"
      ],
      [
        "files[].last_page",
        "آخرین صفحهٔ فایل در جزوه",
        "48"
      ],
      [
        "file_count",
        "شمار فایل‌های جزوه",
        "3"
      ],
      [
        "pages",
        "صفحهٔ جزوه",
        "120"
      ],
      [
        "sheets",
        "برگ جزوه",
        "60"
      ],
      [
        "copies",
        "نسخه",
        "2"
      ],
      [
        "one_side",
        "یکرو",
        "false"
      ],
      [
        "two_sides",
        "دورو",
        "true"
      ],
      [
        "sides",
        "«یکرو» یا «دورو»",
        "دورو"
      ],
      [
        "color",
        "صفحهٔ رنگی دارد",
        "false"
      ],
      [
        "black_white",
        "صفحهٔ سیاه‌سفید دارد",
        "true"
      ],
      [
        "color_text",
        "«رنگی»، «سیاه‌سفید» یا «رنگی و سیاه‌سفید»",
        "سیاه‌سفید"
      ],
      [
        "paper_size",
        "اندازهٔ کاغذ",
        "A4"
      ],
      [
        "a3",
        "اندازهٔ A3",
        "false"
      ],
      [
        "a4",
        "اندازهٔ A4",
        "true"
      ],
      [
        "a5",
        "اندازهٔ A5",
        "false"
      ],
      [
        "papers",
        "کاغذ",
        "تحریر ۸۰ گرم"
      ],
      [
        "binding",
        "نام صحافی",
        "طلق و سیم"
      ],
      [
        "binding_id",
        "شناسهٔ صحافی در تعرفه",
        "spiral_clear"
      ],
      [
        "plastic",
        "صحافی با شناسهٔ spiral_clear یا plastic",
        "true"
      ],
      [
        "hot_glue",
        "صحافی با شناسهٔ hot_glue",
        "false"
      ],
      [
        "cover",
        "صحافی با شناسهٔ cover",
        "false"
      ],
      [
        "stapler",
        "صحافی با شناسهٔ stapler یا staple",
        "false"
      ],
      [
        "volumes",
        "جلدها؛ هر کدام n، first_page، last_page، sheets و file_name",
        "[…]"
      ],
      [
        "volumes[].n",
        "شمارهٔ جلد",
        "1"
      ],
      [
        "volumes[].first_page",
        "اولین صفحهٔ جلد",
        "1"
      ],
      [
        "volumes[].last_page",
        "آخرین صفحهٔ جلد",
        "120"
      ],
      [
        "volumes[].sheets",
        "برگ جلد",
        "60"
      ],
      [
        "volumes[].file_name",
        "نام فایل چاپ همین جلد",
        "jozve-10027-1.pdf"
      ],
      [
        "volume_count",
        "شمار جلد",
        "1"
      ],
      [
        "volume_words",
        "شمار جلد به حروف",
        "یک"
      ],
      [
        "odd",
        "دورو با صفحهٔ فرد: پشت برگ آخر سفید",
        "false"
      ],
      [
        "mode",
        "رنگ، رو و اندازه در یک خط",
        "سیاه‌سفید · دورو · A4"
      ]
    ]
  },
  {
    "title": "فقط برگهٔ اول",
    "prefix": "",
    "in": [
      "first_page"
    ],
    "fields": [
      [
        "jozve",
        "همین جزوه، با فیلدهای «جزوه» بالا",
        "{…}"
      ],
      [
        "print_info.order_id",
        "شمارهٔ سفارش",
        "10027"
      ],
      [
        "print_info.receiver_name",
        "نام گیرنده",
        "مریم کاظمی"
      ],
      [
        "print_info.file_info",
        "همین جزوه (همان jozve)",
        "{…}"
      ],
      [
        "print_info.files_summary.total",
        "شمار جزوه‌های سفارش",
        "2"
      ],
      [
        "print_info.files_summary.plastic",
        "شمار جزوه‌های با پرچم plastic",
        "1"
      ],
      [
        "print_info.files_summary.hot_glue",
        "شمار جزوه‌های با پرچم hot_glue",
        "1"
      ],
      [
        "print_info.files_summary.cover",
        "شمار جزوه‌های با پرچم cover",
        "0"
      ],
      [
        "print_info.files_summary.stapler",
        "شمار جزوه‌های با پرچم stapler",
        "0"
      ],
      [
        "print_info.files_summary.bindings",
        "هر صحافی سفارش با شمارش؛ هر کدام name و count",
        "[…]"
      ],
      [
        "print_info.files_summary.bindings[].name",
        "نام صحافی",
        "طلق و سیم"
      ],
      [
        "print_info.files_summary.bindings[].count",
        "شمار جزوه‌های همین صحافی",
        "1"
      ]
    ]
  }
];
