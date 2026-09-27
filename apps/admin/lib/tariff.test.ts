/**
 * تعرفه به زبان پنل (`tariff.ts`، برش ۴٫۵): فرم پیش‌نویس و سنجشش با پیام دقیق طرح، هشدار ده برابر، پیش‌نمایش با همان
 * `quote()` سایت و عددهای طرح، فهرست تغییرها، و دوره‌های فعال بودن. عددهای تصمیم صریح‌اند، نه از ثابت کد.
 */

import { describe, expect, it } from 'vitest';

import type { PriceList } from '@jozveyar/contracts';
import { SHIPPING_ZONES } from '@jozveyar/geo';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

import type { Seg } from './orders';
import {
  activePeriods,
  bandIssues,
  canonicalJson,
  checkPriceList,
  diffText,
  draftFormFromEntries,
  draftFormOf,
  draftLabel,
  parseWhole,
  periodsText,
  previewRows,
  rateRows,
  readDraft,
  restRows,
  tariffChanges,
  weightLabel,
  ZONES,
  type DraftForm,
} from './tariff';

/** متن تکه‌ها، مثل آنچه صفحه نشان می‌دهد. */
const text = (segs: readonly Seg[]) => segs.map((s) => (typeof s === 'string' ? s : 'num' in s ? s.num : s.ltr)).join('');

const V1 = SEED_PRICE_LIST;
const form = (over: Partial<DraftForm> = {}): DraftForm => ({ ...draftFormOf(V1), ...over });
const errorsOf = (f: DraftForm) => readDraft(f, V1, V1).errors.map((e) => [e.field, text(e.text)]);

describe('فرم پیش‌نویس', () => {
  it('از روی نسخه: تومان با جداکننده، بازه‌ها بر حسب برگ، کرایهٔ هر منطقه و وزن', () => {
    const f = draftFormOf(V1);
    expect(f.label).toBe('تعرفهٔ پایه — شهریور ۱۴۰۵');
    expect([f.bw, f.color]).toEqual(['1,600', '2,000']);
    expect(f.bands[0]).toEqual({ from: '1', to: '150', price: '45,000' });
    expect(f.bands.at(-1)).toEqual({ from: '701', to: '800', price: '78,000' });
    expect(f.ship).toEqual({
      'tehran:0': '129,500',
      'tehran:1000': '150,000',
      'tehran:3000': '200,000',
      'other:0': '137,750',
      'other:1000': '161,812',
      'other:3000': '207,200',
    });
  });

  it('همان فرم، همان تعرفه: رفت‌وبرگشت بی خطا و بی هشدار؛ فقط ارقام نام لاتین می‌شوند (ورودی فارسی‌نرمال)', () => {
    const check = readDraft(draftFormOf(V1), V1, V1);
    expect(check.errors).toEqual([]);
    expect(check.warnings).toEqual([]);
    expect(check.list).toEqual({ ...V1, label: 'تعرفهٔ پایه — شهریور 1405' });
  });

  it('فرم از فیلدهای HTML: ردیف‌ها به ترتیب شماره، کرایه با کلید، بقیه نادیده', () => {
    const entries: [string, unknown][] = [
      ['gate', '/x'],
      ['label', 'مهر'],
      ['band.10.to', '800'],
      ['band.2.from', '1'],
      ['band.2.to', '300'],
      ['band.2.price', '50,000'],
      ['band.10.from', '301'],
      ['band.10.price', '60,000'],
      ['bw', '1,700'],
      ['color', '2,200'],
      ['ship.tehran:0', '130,000'],
      ['ship.x;y:0', '1'],
      ['band.1000.from', '1'],
      ['file', new Blob(['x'])],
      ['intent', 'save'],
    ];
    expect(draftFormFromEntries(entries)).toEqual({
      label: 'مهر',
      bw: '1,700',
      color: '2,200',
      bands: [
        { from: '1', to: '300', price: '50,000' },
        { from: '301', to: '800', price: '60,000' },
      ],
      ship: { 'tehran:0': '130,000' },
    });
    // فرم کامل ویرایشگر، رفت‌وبرگشت.
    const f = draftFormOf(V1);
    const fields: [string, string][] = [
      ['label', f.label],
      ['bw', f.bw],
      ['color', f.color],
      ...f.bands.flatMap((band, i): [string, string][] => [
        [`band.${i}.from`, band.from],
        [`band.${i}.to`, band.to],
        [`band.${i}.price`, band.price],
      ]),
      ...Object.entries(f.ship).map(([key, value]): [string, string] => [`ship.${key}`, value]),
    ];
    expect(draftFormFromEntries(fields)).toEqual(f);
    expect(draftFormFromEntries([['label', 'ا'.repeat(500)]]).label).toHaveLength(200);
  });

  it('عدد تومان: جداکنندهٔ لاتین و فارسی و فاصله، ارقام فارسی؛ اعشار و واحد نه؛ سقف', () => {
    expect(parseWhole('1,700', 100)).toEqual({ ok: false, error: 'too_big' });
    expect(parseWhole('1,700', 100_000_000)).toEqual({ ok: true, value: 1700 });
    expect(parseWhole('۱٬۷۰۰', 100_000_000)).toEqual({ ok: true, value: 1700 });
    expect(parseWhole(' 1 700 ', 100_000_000)).toEqual({ ok: true, value: 1700 });
    expect(parseWhole('1700.5', 100_000_000)).toEqual({ ok: false, error: 'invalid' });
    expect(parseWhole('1700 تومان', 100_000_000)).toEqual({ ok: false, error: 'invalid' });
    expect(parseWhole('-5', 100_000_000)).toEqual({ ok: false, error: 'invalid' });
    expect(parseWhole('  ', 100_000_000)).toEqual({ ok: false, error: 'empty' });
    expect(parseWhole('100000000', 100_000_000)).toEqual({ ok: true, value: 100_000_000 });
    expect(parseWhole('100000001', 100_000_000)).toEqual({ ok: false, error: 'too_big' });
  });

  it('تومان به ریال، نام یکدست؛ هرچه فرم ندارد از پیش‌نویس ذخیره‌شده', () => {
    const base: PriceList = { ...V1, version: 2, settings: { ...V1.settings, packagingWeightGrams: 120 } };
    const check = readDraft(form({ label: '  تعرفهٔ   مهر ۱۴۰۵ ', bw: '1,700', color: '۲۲۰۰' }), base, V1);
    expect(check.errors).toEqual([]);
    expect(check.list).toMatchObject({ version: 2, label: 'تعرفهٔ مهر 1405', clickRates: { bw: 17_000, color: 22_000 } });
    expect(check.list!.settings.packagingWeightGrams).toBe(120);
    expect(check.list!.paperTypes).toEqual(V1.paperTypes);
  });

  it('نام: خالی نه؛ حداکثر 60 نویسه، پس از یکدست شدن', () => {
    expect(errorsOf(form({ label: '   ' }))).toEqual([['label', 'نام نسخه را بنویس.']]);
    expect(errorsOf(form({ label: 'ا'.repeat(60) }))).toEqual([]);
    expect(errorsOf(form({ label: 'ا'.repeat(61) }))).toEqual([['label', 'نام حداکثر 60 نویسه باشد.']]);
  });

  it('نرخ چاپ: عدد، بیش از صفر، و تا 100,000,000 تومان', () => {
    expect(errorsOf(form({ bw: '', color: '0' }))).toEqual([
      ['bw', 'عدد را بنویس.'],
      ['color', 'نرخ چاپ صفر نمی‌شود.'],
    ]);
    expect(errorsOf(form({ bw: '1.5' }))).toEqual([['bw', 'فقط رقم بنویس، بی اعشار و بی واحد.']]);
    expect(errorsOf(form({ bw: '100,000,001' }))).toEqual([['bw', 'بیش از 100,000,000 تومان است؛ شاید صفر اضافه دارد.']]);
    expect(errorsOf(form({ bw: '100,000,000' }))).toEqual([]);
  });

  it('هشدار ده برابر، نه خطا: همان پیام طرح؛ درست ده برابر نه', () => {
    const check = readDraft(form({ bw: '17,000', color: '20,000' }), V1, V1);
    expect(check.errors).toEqual([]);
    expect(check.list).not.toBeNull();
    expect(check.warnings.map((w) => [w.field, text(w.text)])).toEqual([
      ['bw', '17,000 تومان؟ بیش از ده برابر نسخهٔ فعال (1,600) است؛ شاید ریال نوشته‌ای.'],
    ]);
    // بازه با بازهٔ فعالی که همان «از» را می‌پوشاند؛ کرایه با همان خانه.
    const more = readDraft(form({ bands: [...form().bands.slice(0, 5), { from: '701', to: '800', price: '780,001' }], ship: { ...form().ship, 'other:0': '1,377,501' } }), V1, V1);
    expect(more.warnings.map((w) => w.field)).toEqual(['band.5.price', 'ship.other:0']);
    // بی نسخهٔ فعال، هشداری نیست.
    expect(readDraft(form({ bw: '17,000' }), V1, null).warnings).toEqual([]);
  });
});

describe('بازه‌های صحافی', () => {
  const bands = (...rows: [string, string, string][]) => form({ bands: rows.map(([from, to, price]) => ({ from, to, price })) });
  const six: [string, string, string][] = [
    ['1', '150', '45,000'],
    ['151', '300', '50,000'],
    ['301', '450', '55,000'],
    ['451', '600', '62,000'],
    ['601', '700', '68,000'],
    ['701', '800', '78,000'],
  ];

  it('شکاف: پیام دقیق طرح روی «از» همان ردیف', () => {
    const rows = six.map((r) => [...r] as [string, string, string]);
    rows[2]![0] = '302';
    expect(errorsOf(bands(...rows))).toEqual([['band.2.from', 'برگ 301 قیمت ندارد: بازهٔ قبلی تا 300 است. «از» را 301 کن.']]);
    rows[2]![0] = '310';
    expect(errorsOf(bands(...rows))).toEqual([['band.2.from', 'برگ‌های 301 تا 309 قیمت ندارند: بازهٔ قبلی تا 300 است. «از» را 301 کن.']]);
  });

  it('همپوشانی: برگ دو قیمت؛ آغاز نه از 1؛ پایان نه تا 800 یا بیشتر', () => {
    const rows = six.map((r) => [...r] as [string, string, string]);
    rows[2]![0] = '300';
    expect(errorsOf(bands(...rows))).toEqual([['band.2.from', 'برگ 300 دو قیمت دارد: بازهٔ قبلی تا 300 است. «از» را 301 کن.']]);
    rows[2]![0] = '290';
    expect(errorsOf(bands(...rows))).toEqual([['band.2.from', 'برگ‌های 290 تا 300 دو قیمت دارند: بازهٔ قبلی تا 300 است. «از» را 301 کن.']]);
    const first = six.map((r) => [...r] as [string, string, string]);
    first[0]![0] = '2';
    expect(errorsOf(bands(...first))).toEqual([['band.0.from', 'برگ 1 قیمت ندارد: اولین بازه از 2 است. «از» را 1 کن.']]);
    const short = six.map((r) => [...r] as [string, string, string]);
    short[5]![1] = '799';
    expect(errorsOf(bands(...short))).toEqual([['band.5.to', 'برگ 800 قیمت ندارد: آخرین بازه تا 799 است. «تا» را 800 کن.']]);
    expect(errorsOf(bands(...six.slice(0, 5)))).toEqual([['band.4.to', 'برگ‌های 701 تا 800 قیمت ندارند: آخرین بازه تا 700 است. «تا» را 800 کن.']]);
    const long = six.map((r) => [...r] as [string, string, string]);
    long[5]![1] = '801';
    expect(errorsOf(bands(...long))).toEqual([['band.5.to', 'بالای 800 برگ جلد تازه است: «تا»ی آخرین بازه 800 باشد.']]);
  });

  it('ترتیب ردیف‌ها آزاد است: بازه‌ها مرتب ذخیره می‌شوند؛ ردیف تمام‌خالی نادیده', () => {
    const shuffled = [six[3]!, six[0]!, ['', '', ''] as [string, string, string], six[5]!, six[1]!, six[4]!, six[2]!];
    const check = readDraft(bands(...shuffled), V1, V1);
    expect(check.errors).toEqual([]);
    expect(check.list!.bindingTypes.spiral_clear!.bands).toEqual(V1.bindingTypes.spiral_clear!.bands);
    // بازهٔ تازه با تقسیم یک بازه، و قیمت صفر پذیرفته است.
    const split = readDraft(bands(['1', '100', '0'], ['101', '150', '45,000'], ...six.slice(1)), V1, V1);
    expect(split.errors).toEqual([]);
    expect(split.list!.bindingTypes.spiral_clear!.bands.slice(0, 2)).toEqual([
      { minSheets: 1, maxSheets: 100, priceRials: 0 },
      { minSheets: 101, maxSheets: 150, priceRials: 450_000 },
    ]);
  });

  it('خطای ردیف: خانهٔ خالی، برگ صفر، «تا» کمتر از «از»؛ پوشش فقط وقتی همه عددند', () => {
    expect(errorsOf(bands(['1', '', '45,000'], ...six.slice(1)))).toEqual([['band.0.to', 'عدد را بنویس.']]);
    expect(errorsOf(bands(['0', '150', '45,000'], ...six.slice(1)))).toEqual([['band.0.from', 'برگ از 1 شروع می‌شود.']]);
    expect(errorsOf(bands(['150', '1', '45,000'], ...six.slice(1)))).toEqual([['band.0.to', '«تا» از «از» کمتر است.']]);
    expect(errorsOf(bands(['1', '150', 'x'], ...six.slice(1)))).toEqual([['band.0.price', 'فقط رقم بنویس، بی اعشار و بی واحد.']]);
    expect(errorsOf(bands())).toEqual([['bands', 'دست‌کم یک بازه لازم است.']]);
    const many = Array.from({ length: 21 }, (_, i) => [String(i + 1), String(i + 1), '1'] as [string, string, string]);
    expect(errorsOf(bands(...many))).toEqual([['bands', 'حداکثر 20 بازه.']]);
  });

  it('bandIssues: یک بازهٔ تنها از 1 تا 800 درست است؛ چند خطا با هم', () => {
    expect(bandIssues([{ from: 1, to: 800 }], 800)).toEqual([]);
    const issues = bandIssues(
      [
        { from: 5, to: 100 },
        { from: 90, to: 700 },
      ],
      800,
    );
    expect(issues.map((i) => [i.index, i.part, text(i.text)])).toEqual([
      [0, 'from', 'برگ‌های 1 تا 4 قیمت ندارند: اولین بازه از 5 است. «از» را 1 کن.'],
      [1, 'from', 'برگ‌های 90 تا 100 دو قیمت دارند: بازهٔ قبلی تا 100 است. «از» را 101 کن.'],
      [1, 'to', 'برگ‌های 701 تا 800 قیمت ندارند: آخرین بازه تا 700 است. «تا» را 800 کن.'],
    ]);
  });

  it('هر پیش‌نویس بی خطا را موتور قیمت برای هر جلد 1 تا 800 برگی بی هشدار قیمت می‌دهد', async () => {
    const { quote, wholeDocumentRule } = await import('@jozveyar/pricing');
    const check = readDraft(bands(['1', '10', '1,000'], ['11', '799', '50,000'], ['800', '800', '60,000']), V1, V1);
    expect(check.errors).toEqual([]);
    for (let sheets = 1; sheets <= 800; sheets += 1) {
      const result = quote(
        {
          items: [{ sections: [{ documentId: 'x', pageCount: sheets }], rules: wholeDocumentRule(sheets, 'bw', 'tahrir80'), copies: 1, sidesMode: 'single', bindingTypeId: 'spiral_clear' }],
          shipping: null,
        },
        check.list!,
      );
      expect(result.warnings, `${sheets}`).toEqual([]);
    }
  });
});

describe('کرایه و نسخه', () => {
  it('کرایه: هر خانه عدد؛ وزن‌ها و منطقه‌ها همان پیش‌نویس', () => {
    expect(errorsOf(form({ ship: { ...form().ship, 'tehran:1000': '' } }))).toEqual([['ship.tehran:1000', 'عدد را بنویس.']]);
    const check = readDraft(form({ ship: { ...form().ship, 'tehran:0': '135,000', 'mars:0': '1' } }), V1, V1);
    expect(check.list!.shippingRates.find((r) => r.zoneId === 'tehran' && r.minWeightGrams === 0)!.priceRials).toBe(1_350_000);
    expect(check.list!.shippingRates).toHaveLength(V1.shippingRates.length);
  });

  it('checkPriceList: پیش‌فرض‌های خاموش، نرخ صفر، پوشش صحافی و کرایهٔ هر منطقه', () => {
    expect(checkPriceList(V1)).toEqual([]);
    const off: PriceList = {
      ...V1,
      clickRates: { bw: 0, color: 20_000 },
      paperTypes: { tahrir80: { ...V1.paperTypes.tahrir80!, enabled: false } },
      bindingTypes: { spiral_clear: { ...V1.bindingTypes.spiral_clear!, bands: V1.bindingTypes.spiral_clear!.bands.slice(1) } },
      shippingRates: V1.shippingRates.filter((r) => !(r.zoneId === 'other' && r.maxWeightGrams === null)),
    };
    expect(checkPriceList(off).map(text)).toEqual([
      'کاغذ پیش‌فرض (tahrir80) در این نسخه نیست یا خاموش است.',
      'نرخ چاپ سیاه‌سفید و رنگی هر دو بیش از صفر باشند.',
      'صحافی: برگ‌های 1 تا 150 قیمت ندارند: اولین بازه از 151 است. «از» را 1 کن.',
      'کرایهٔ پست پیشتاز برای بقیهٔ کشور همهٔ وزن‌ها را، از صفر و بی سقف، پشت‌سرهم نمی‌پوشاند.',
    ]);
    const noPost: PriceList = { ...V1, shippingMethods: { ...V1.shippingMethods, post: { nameFa: 'پست پیشتاز', enabled: false } } };
    expect(checkPriceList(noPost).map(text)).toEqual(['پست پیشتاز (post) در این نسخه نیست یا خاموش است.']);
  });

  it('منطقه‌ها همان SHIPPING_ZONES بستهٔ geo', () => {
    expect(ZONES).toEqual(SHIPPING_ZONES.map((z) => ({ id: z.id, name: z.name })));
  });

  it('نام پیش‌فرض پیش‌نویس: ماه و سال تهران', () => {
    // «حالا»ی طرح: دوشنبه 13 مهر 1405، ساعت 11:20 تهران.
    expect(draftLabel(new Date('2026-10-05T07:50:00Z'))).toBe('تعرفهٔ مهر 1405');
    // 30 مهر ساعت 23:59 تهران هنوز مهر است، و دو دقیقه بعد 1 آبان (نه UTC).
    expect(draftLabel(new Date('2026-10-22T20:29:00Z'))).toBe('تعرفهٔ مهر 1405');
    expect(draftLabel(new Date('2026-10-22T20:31:00Z'))).toBe('تعرفهٔ آبان 1405');
  });
});

describe('پیش‌نمایش و نمایش', () => {
  it('چهار جزوهٔ نمونهٔ طرح، با همان عددهای طرح از quote()', () => {
    const v2 = readDraft(form({ bw: '1,700', color: '2,200' }), { ...V1, version: 2 }, V1).list!;
    expect(previewRows(V1, v2).map((row) => [text(row.label), row.activeRials / 10, row.draftRials / 10, diffText(row.diffRials)])).toEqual([
      ['147 صفحه، سیاه‌سفید، دورو', 280_200, 294_900, '+14,700'],
      ['120 صفحه، رنگی، دورو', 285_000, 309_000, '+24,000'],
      ['3 فایل، 300 صفحه، یکرو', 530_000, 560_000, '+30,000'],
      ['1,650 صفحه، دو جلد', 2_750_000, 2_915_000, '+165,000'],
    ]);
    expect(diffText(-30_000)).toBe('−3,000');
    expect(diffText(0)).toBe('0');
  });

  it('جدول کرایه و «بقیه»، و نام بازهٔ وزن', () => {
    expect(rateRows(V1).map((r) => [text(weightLabel(r.minGrams, r.maxGrams)), ...r.prices.map((p) => p! / 10)])).toEqual([
      ['تا 1 کیلو', 129_500, 137_750],
      ['1 تا 3 کیلو', 150_000, 161_812],
      ['بالای 3 کیلو', 200_000, 207_200],
    ]);
    expect([text(weightLabel(1000, 3000, true)), text(weightLabel(3000, null, true)), text(weightLabel(0, null))]).toEqual(['1 تا 3', 'بالای 3', 'همهٔ وزن‌ها']);
    expect(text(weightLabel(1500, 2250))).toBe('1.5 تا 2.3 کیلو');
    expect(restRows(V1).map((r) => [r.label, text(r.value)])).toEqual([
      ['مالیات', '0٪'],
      ['گرد کردن', 'ندارد'],
      ['حداقل سفارش', 'ندارد'],
      ['وزن بسته‌بندی', '100 گرم'],
    ]);
  });
});

describe('تغییرها نسبت به نسخهٔ فعال', () => {
  const changesOf = (to: PriceList, from: PriceList = V1) => {
    const changes = tariffChanges(from, to);
    return { lines: changes.lines.map((l) => [text(l.key), text(l.value)]), unchanged: changes.unchanged };
  };

  it('فقط نرخ چاپ: همان خطوط طرح، و «صحافی، پست و بقیه» بی تغییر', () => {
    const v2 = readDraft(form({ bw: '1,700', color: '2,200', label: 'تعرفهٔ مهر 1405' }), { ...V1, version: 2 }, V1).list!;
    expect(changesOf(v2)).toEqual({
      lines: [
        ['چاپ سیاه‌سفید، هر رو', '1,600 ← 1,700 تومان'],
        ['چاپ رنگی، هر رو', '2,000 ← 2,200 تومان'],
      ],
      unchanged: ['صحافی', 'پست', 'بقیه'],
    });
    // برگشت: همان خطوط، برعکس.
    expect(changesOf(V1, v2).lines).toEqual([
      ['چاپ سیاه‌سفید، هر رو', '1,700 ← 1,600 تومان'],
      ['چاپ رنگی، هر رو', '2,200 ← 2,000 تومان'],
    ]);
    expect(changesOf({ ...V1, version: 3, label: 'فقط نام' })).toEqual({ lines: [], unchanged: ['چاپ', 'صحافی', 'پست', 'بقیه'] });
  });

  it('صحافی: هم‌بازه با قیمت دیگر، بازهٔ تازه، و بازهٔ برداشته؛ کرایه و بقیه', () => {
    const f = form();
    const bands = [{ from: '1', to: '100', price: '40,000' }, { from: '101', to: '150', price: '45,000' }, ...f.bands.slice(1)];
    bands[3] = { ...bands[3]!, price: '58,000' };
    const v2 = readDraft({ ...f, bands, ship: { ...f.ship, 'tehran:0': '135,000' } }, { ...V1, version: 2 }, V1).list!;
    const v2b: PriceList = { ...v2, settings: { ...v2.settings, vatPercent: 9, roundingStepRials: 10_000 } };
    expect(changesOf(v2b)).toEqual({
      lines: [
        ['صحافی، 1 تا 100 برگ', 'تازه: 40,000 تومان'],
        ['صحافی، 101 تا 150 برگ', 'تازه: 45,000 تومان'],
        ['صحافی، 301 تا 450 برگ', '55,000 ← 58,000 تومان'],
        ['صحافی، 1 تا 150 برگ', 'برداشته شد'],
        ['پست پیشتاز، استان تهران، تا 1 کیلو', '129,500 ← 135,000 تومان'],
        ['مالیات', '0٪ ← 9٪'],
        ['گرد کردن', 'ندارد ← به 1,000 تومان'],
      ],
      unchanged: ['چاپ'],
    });
  });

  it('هرچه خط خودش را ندارد، «جزئیات دیگر»؛ ترتیب ردیف‌ها تغییر نیست', () => {
    const renamed: PriceList = { ...V1, version: 2, paperTypes: { tahrir80: { ...V1.paperTypes.tahrir80!, gsm: 70 } } };
    expect(changesOf(renamed)).toEqual({ lines: [['جزئیات دیگر', 'عوض شد (کاغذ، وزن جلد یا روش‌های ارسال)']], unchanged: ['چاپ', 'صحافی', 'پست'] });
    const reordered: PriceList = { ...V1, shippingRates: [...V1.shippingRates].reverse(), shippingMethods: Object.fromEntries(Object.entries(V1.shippingMethods).reverse()) };
    expect(changesOf(reordered).lines).toEqual([]);
    expect(canonicalJson(reordered.shippingMethods)).toBe(canonicalJson(V1.shippingMethods));
  });
});

describe('دوره‌های فعال بودن', () => {
  it('هر فعال شدن تا فعال شدن بعدی؛ آخری باز', () => {
    const t = (minute: number) => new Date(Date.UTC(2026, 9, 5, 7, minute));
    const periods = activePeriods([
      { version: 1, at: t(0), adminName: null },
      { version: 2, at: t(10), adminName: 'سارا' },
      { version: 1, at: t(20), adminName: 'سارا' },
    ]);
    expect(periods.get(1)).toEqual([
      { from: t(0), to: t(10), by: null },
      { from: t(20), to: null, by: 'سارا' },
    ]);
    expect(periods.get(2)).toEqual([{ from: t(10), to: t(20), by: 'سارا' }]);
    expect(periods.get(3)).toBeUndefined();
  });

  it('متن فهرست نسخه‌ها: «فعال از» طرح، «فعال بود»، ساعت‌ها در یک روز، و «و پیش‌تر» برای نسخهٔ دوباره فعال‌شده', () => {
    // 1405/06/20 ساعت 09:30 تهران، و 1405/07/05 ساعت‌های 10:48 و 11:02
    const shahrivar20 = new Date('2026-09-11T06:00:00Z');
    const at1048 = new Date('2026-09-27T07:18:00Z');
    const at1102 = new Date('2026-09-27T07:32:00Z');
    expect(text(periodsText([{ from: shahrivar20, to: null, by: null }], true))).toBe('فعال از 1405/06/20');
    const periods = activePeriods([
      { version: 1, at: shahrivar20, adminName: null },
      { version: 2, at: at1048, adminName: 'سارا' },
      { version: 1, at: at1102, adminName: 'سارا' },
    ]);
    expect(text(periodsText(periods.get(2)!, false))).toBe('فعال بود 1405/07/05، 10:48 تا 11:02');
    expect(text(periodsText(periods.get(1)!, true))).toBe('فعال از 1405/07/05، و پیش‌تر 1405/06/20 تا 1405/07/05');
    expect(text(periodsText([], false))).toBe('');
  });

  it('is_active بر دوره‌ها مقدم است: فعال کردن بیرون از پنل (SQL) رویداد ندارد', () => {
    const at1048 = new Date('2026-09-27T07:18:00Z');
    const at1102 = new Date('2026-09-27T07:32:00Z');
    // نسخهٔ ۱ با SQL دوباره فعال شد: آخرین دورهٔ ثبت‌شده‌اش بسته است، ولی فعال است.
    expect(text(periodsText([{ from: at1048, to: at1102, by: null }], true))).toBe('فعال، و پیش‌تر 1405/07/05، 10:48 تا 11:02');
    // و نسخه‌ای که همان SQL خاموشش کرد: پایانش ثبت نشده.
    expect(text(periodsText([{ from: at1102, to: null, by: 'سارا' }], false))).toBe('فعال بود از 1405/07/05');
    expect(text(periodsText([], true))).toBe('فعال');
  });
});
