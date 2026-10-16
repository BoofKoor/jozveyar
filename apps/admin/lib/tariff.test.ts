/**
 * تعرفه به زبان پنل (`tariff.ts`، برش ۴٫۵؛ کاتالوگ از ۸٫۳): فرم پیش‌نویس و سنجشش با پیام دقیق طرح، اندازه‌ها، کاغذها و
 * صحافی‌ها، هشدار ده برابر، پیش‌نمایش با همان `quote()` سایت و عددهای طرح، فهرست تغییرها، و دوره‌های فعال بودن. عددهای
 * تصمیم صریح‌اند، نه از ثابت کد.
 */

import { describe, expect, it } from 'vitest';

import type { PriceList } from '@jozveyar/contracts';
import { SHIPPING_ZONES } from '@jozveyar/geo';
import { quote, wholeDocumentRule } from '@jozveyar/pricing';
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
  newTier,
  tierRows,
  newBinding,
  newOptionId,
  newPaper,
  OPTION_ID,
  parseWhole,
  periodsText,
  previewRows,
  rateRows,
  readDraft,
  restRows,
  tariffChanges,
  weightLabel,
  ZONES,
  type BandInput,
  type BindingInput,
  type DraftForm,
  type PaperInput,
  type RestInput,
} from './tariff';

/** متن تکه‌ها، مثل آنچه صفحه نشان می‌دهد. */
const text = (segs: readonly Seg[]) => segs.map((s) => (typeof s === 'string' ? s : 'num' in s ? s.num : 'ltr' in s ? s.ltr : 'name' in s ? s.name : s.barcode)).join('');

const V1 = SEED_PRICE_LIST;
const form = (over: Partial<DraftForm> = {}): DraftForm => ({ ...draftFormOf(V1), ...over });
const issuesOf = (list: readonly { field: string; text: Seg[] }[]) => list.map((e) => [e.field, text(e.text)]);
const errorsOf = (f: DraftForm) => issuesOf(readDraft(f, V1, V1).errors);

/** نرخ هر رو یک اندازه در فرم: یکرو و دورو یک نرخ. */
const rates = (bw: string, color: string) => ({ single: { bw, color }, double: { bw, color } });
const emptyRates = () => rates('', '');
/** صحافی پیش‌فرض فرم با تغییر. */
const spiral = (patch: Partial<BindingInput>): BindingInput => ({ ...form().bindings[0]!, ...patch });
const tahrir = (patch: Partial<PaperInput>): PaperInput => ({ ...form().papers[0]!, ...patch });
const band = (from: string, to: string, price: string): BandInput => ({ from, to, price });

/** فرم با A5 ارائه‌شده: نرخ چاپ، نرخ تحریر و یک بازهٔ طلق و سیم. */
function withA5(over: Partial<DraftForm> = {}): DraftForm {
  const f = form();
  return {
    ...f,
    sizes: { a4: true, a5: true, a3: false },
    print: { ...f.print, a5: rates('1,200', '1,500') },
    papers: [tahrir({ rates: { a4: '0', a5: '0', a3: '' } })],
    bindings: [spiral({ bands: { ...f.bindings[0]!.bands, a5: [band('1', '800', '40,000')] } })],
    ...over,
  };
}

/** فیلدهای فرم HTML، همان که ویرایشگر می‌فرستد: فقط اندازه‌های ارائه‌شده؛ تیک خاموش فرستاده نمی‌شود. */
function fieldsOf(f: DraftForm): [string, string][] {
  const sizes = (['a4', 'a5', 'a3'] as const).filter((size) => size === 'a4' || f.sizes[size]);
  return [
    ['label', f.label],
    ...sizes.filter((size) => size !== 'a4').map((size): [string, string] => [`size.${size}`, 'on']),
    ...sizes.flatMap((size) =>
      (['double', 'single'] as const).flatMap((sides) =>
        (['bw', 'color'] as const).map((color): [string, string] => [`print.${size}.${sides}.${color}`, f.print[size][sides][color]]),
      ),
    ),
    ...f.papers.flatMap((paper, i): [string, string][] => [
      [`paper.${i}.id`, paper.id],
      [`paper.${i}.name`, paper.name],
      [`paper.${i}.gsm`, paper.gsm],
      ...(paper.enabled ? [[`paper.${i}.enabled`, 'on'] as [string, string]] : []),
      ...sizes.map((size): [string, string] => [`paper.${i}.rate.${size}`, paper.rates[size]]),
    ]),
    ...f.bindings.flatMap((binding, i): [string, string][] => [
      [`binding.${i}.id`, binding.id],
      [`binding.${i}.name`, binding.name],
      ...(binding.enabled ? [[`binding.${i}.enabled`, 'on'] as [string, string]] : []),
      [`binding.${i}.min`, binding.min],
      [`binding.${i}.max`, binding.max],
      [`binding.${i}.splits`, binding.splits ? '1' : '0'],
      [`binding.${i}.weight`, binding.weight],
      ...sizes.flatMap((size) =>
        binding.bands[size].flatMap((b, j): [string, string][] => [
          [`binding.${i}.band.${size}.${j}.from`, b.from],
          [`binding.${i}.band.${size}.${j}.to`, b.to],
          [`binding.${i}.band.${size}.${j}.price`, b.price],
        ]),
      ),
    ]),
    ...Object.entries(f.ship).map(([key, value]): [string, string] => [`ship.${key}`, value]),
    ...Object.entries(f.rest)
      .filter((entry): entry is [string, string] => entry[1] !== null)
      .map(([key, value]): [string, string] => [`rest.${key}`, value]),
    // پله‌های تخفیف (۱۱٫۴): نشانهٔ کارت، و هر پله با تیک «ارسال رایگان» فقط وقتی زده شده
    ...(f.tiers === null
      ? []
      : [
          ['tiers', '1'] as [string, string],
          ...f.tiers.flatMap((tier, i): [string, string][] => [
            [`tier.${i}.from`, tier.from],
            [`tier.${i}.percent`, tier.percent],
            ...(tier.freeShipping ? [[`tier.${i}.free`, 'on'] as [string, string]] : []),
          ]),
        ]),
  ];
}

/** «بقیه»ای که فرم نفرستاد (زبانهٔ پیش از ۸٫۴): همان پیش‌نویس. */
const NO_REST: RestInput = { rounding: null, minOrder: null, packaging: null };

/** قیمت یک جزوه بی کرایه با یک تعرفه؛ هشدارها جدا. */
function priced(list: PriceList, item: { pages: number; size?: 'a4' | 'a5' | 'a3'; paper?: string; binding?: string; color?: 'bw' | 'color'; sides?: 'single' | 'double' }) {
  const result = quote(
    {
      items: [
        {
          sections: [{ documentId: 'x', pageCount: item.pages }],
          rules: wholeDocumentRule(item.pages, item.color ?? 'bw', item.paper ?? 'tahrir80'),
          copies: 1,
          sidesMode: item.sides ?? 'double',
          paperSize: item.size ?? 'a4',
          bindingTypeId: item.binding ?? 'spiral_clear',
        },
      ],
      shipping: null,
    },
    list,
  );
  return { tomans: result.totalWithoutShippingRials / 10, warnings: result.warnings };
}

describe('فرم پیش‌نویس', () => {
  it('از روی نسخه: تومان با جداکننده، اندازه‌ها، کاغذ و صحافی با بازه‌ها بر حسب برگ، کرایهٔ هر منطقه و وزن', () => {
    const f = draftFormOf(V1);
    expect(f.label).toBe('تعرفهٔ پایه — شهریور ۱۴۰۵');
    expect(f.sizes).toEqual({ a4: true, a5: false, a3: false });
    expect(f.print).toEqual({ a4: rates('1,600', '2,000'), a5: emptyRates(), a3: emptyRates() });
    expect(f.papers).toEqual([{ id: 'tahrir80', name: 'تحریر ۸۰ گرم', gsm: '80', enabled: true, rates: { a4: '0', a5: '', a3: '' } }]);
    const [binding, ...others] = f.bindings;
    expect(others).toEqual([]);
    expect({ ...binding, bands: undefined }).toEqual({ id: 'spiral_clear', name: 'طلق و سیم', enabled: true, min: '1', max: '800', splits: true, weight: '60', bands: undefined });
    expect(binding!.bands.a4[0]).toEqual(band('1', '150', '45,000'));
    expect(binding!.bands.a4.at(-1)).toEqual(band('701', '800', '78,000'));
    expect([binding!.bands.a5, binding!.bands.a3]).toEqual([[], []]);
    expect(f.ship).toEqual({
      'tehran:0': '129,500',
      'tehran:1000': '150,000',
      'tehran:3000': '200,000',
      'other:0': '137,750',
      'other:1000': '161,812',
      'other:3000': '207,200',
    });
  });

  it('همان فرم، همان تعرفه: رفت‌وبرگشت بی خطا و بی هشدار؛ فقط ارقام نام نسخه لاتین می‌شوند، و نام دست‌نخوردهٔ گزینه همان املا', () => {
    const check = readDraft(draftFormOf(V1), V1, V1);
    expect(check.errors).toEqual([]);
    expect(check.warnings).toEqual([]);
    expect(check.list).toEqual({ ...V1, label: 'تعرفهٔ پایه — شهریور 1405' });
    // نامی که عوض شد یکدست می‌شود (ارقام لاتین)؛ همان نام با ارقام فارسی همان املای ذخیره‌شده.
    expect(readDraft(form({ papers: [tahrir({ name: ' تحریر  80 گرم ' })] }), V1, V1).list!.paperTypes.tahrir80!.nameFa).toBe('تحریر ۸۰ گرم');
    expect(readDraft(form({ papers: [tahrir({ name: 'تحریر ۷۰ گرم' })] }), V1, V1).list!.paperTypes.tahrir80!.nameFa).toBe('تحریر 70 گرم');
  });

  it('فرم از فیلدهای HTML: ردیف‌ها به ترتیب شماره، تیک‌ها، «بالای سقف»، کرایه با کلید، بقیه نادیده', () => {
    const entries: [string, unknown][] = [
      ['gate', '/x'],
      ['label', 'مهر'],
      ['size.a5', 'on'],
      ['size.a4', ''],
      ['print.a4.double.bw', '1,700'],
      ['print.a5.single.color', '1,500'],
      ['print.a6.single.color', '1'],
      ['paper.3.id', 'glossy'],
      ['paper.3.name', 'گلاسه'],
      ['paper.3.rate.a5', '900'],
      ['paper.0.id', 'tahrir80'],
      ['paper.0.enabled', 'on'],
      ['paper.0.rate.a4', '0'],
      ['paper.7.name', 'بی شناسه'],
      ['binding.1.id', 'staple'],
      ['binding.1.splits', '0'],
      ['binding.1.band.a4.10.to', '50'],
      ['binding.1.band.a4.2.from', '1'],
      ['binding.1.band.a4.2.to', '20'],
      ['binding.1.band.a4.2.price', '5,000'],
      ['binding.1.band.a4.10.from', '21'],
      ['binding.1.band.a4.10.price', '7,000'],
      ['binding.0.id', 'spiral_clear'],
      ['binding.0.splits', '1'],
      ['binding.0.enabled', 'on'],
      ['binding.0.max', '800'],
      ['ship.tehran:0', '130,000'],
      ['ship.x;y:0', '1'],
      ['binding.1.band.a4.1000.from', '1'],
      ['file', new Blob(['x'])],
      ['intent', 'save'],
    ];
    const f = draftFormFromEntries(entries);
    const blank = { single: { bw: '', color: '' }, double: { bw: '', color: '' } };
    expect(f).toEqual({
      label: 'مهر',
      sizes: { a4: true, a5: true, a3: false },
      print: {
        a4: { ...blank, double: { bw: '1,700', color: '' } },
        a5: { ...blank, single: { bw: '', color: '1,500' } },
        a3: blank,
      },
      papers: [
        { id: 'tahrir80', name: '', gsm: '', enabled: true, rates: { a4: '0', a5: '', a3: '' } },
        { id: 'glossy', name: 'گلاسه', gsm: '', enabled: false, rates: { a4: '', a5: '900', a3: '' } },
      ],
      bindings: [
        { id: 'spiral_clear', name: '', enabled: true, min: '', max: '800', splits: true, weight: '', bands: { a4: [], a5: [], a3: [] } },
        {
          id: 'staple',
          name: '',
          enabled: false,
          min: '',
          max: '',
          splits: false,
          weight: '',
          bands: { a4: [band('1', '20', '5,000'), band('21', '50', '7,000')], a5: [], a3: [] },
        },
      ],
      ship: { 'tehran:0': '130,000' },
      rest: NO_REST,
      tiers: null,
    });
    // فرم کامل ویرایشگر، رفت‌وبرگشت؛ با A5 و کاغذ و صحافی تازه هم.
    expect(draftFormFromEntries(fieldsOf(draftFormOf(V1)))).toEqual(draftFormOf(V1));
    const rich = withA5({
      papers: [tahrir({ rates: { a4: '0', a5: '0', a3: '' } }), { ...newPaper({ a4: true, a5: true, a3: false }, 0, 0), name: 'گلاسه', enabled: false }],
      bindings: [...withA5().bindings, { ...newBinding(1, 0), name: 'منگنه' }],
    });
    expect(draftFormFromEntries(fieldsOf(rich))).toEqual(rich);
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

  it('تومان به ریال، نام یکدست، یکرو و دورو جدا؛ هرچه فرم ندارد از پیش‌نویس ذخیره‌شده', () => {
    const base: PriceList = { ...V1, version: 2, settings: { ...V1.settings, packagingWeightGrams: 120 } };
    const print = { ...form().print, a4: { single: { bw: '1,900', color: '۲۴۰۰' }, double: { bw: '1,700', color: '2,200' } } };
    const check = readDraft(form({ label: '  تعرفهٔ   مهر ۱۴۰۵ ', print, rest: NO_REST }), base, V1);
    expect(check.errors).toEqual([]);
    expect(check.list).toMatchObject({
      version: 2,
      label: 'تعرفهٔ مهر 1405',
      printRates: { a4: { single: { bw: 19_000, color: 24_000 }, double: { bw: 17_000, color: 22_000 } } },
    });
    expect(check.list!.settings.packagingWeightGrams).toBe(120);
    expect(check.list!.paperTypes).toEqual(V1.paperTypes);
    expect(check.list!.bindingTypes).toEqual(V1.bindingTypes);
  });

  it('«بقیه» (۸٫۴): گرد کردن و حداقل سفارش تومان، وزن بسته‌بندی گرم؛ هر خطا زیر فیلد خودش؛ مالیات فرم ندارد', () => {
    const rest = (over: Partial<RestInput>) => form({ rest: { ...form().rest, ...over } });
    expect(form().rest).toEqual({ rounding: '0', minOrder: '0', packaging: '100' });
    const check = readDraft(rest({ rounding: '1,000', minOrder: '۵۰٬۰۰۰', packaging: '150' }), V1, V1);
    expect(check.errors).toEqual([]);
    expect(check.list!.settings).toEqual({ vatPercent: 0, roundingStepRials: 10_000, minOrderRials: 500_000, packagingWeightGrams: 150 });
    expect(errorsOf(rest({ rounding: '', minOrder: '50000.5', packaging: '10001' }))).toEqual([
      ['rest.rounding', 'عدد را بنویس.'],
      ['rest.minOrder', 'فقط رقم بنویس، بی اعشار و بی واحد.'],
      ['rest.packaging', 'وزن بسته‌بندی از 0 تا 10,000 گرم است.'],
    ]);
    expect(errorsOf(rest({ minOrder: '100,000,001' }))).toEqual([['rest.minOrder', 'بیش از 100,000,000 تومان است؛ شاید صفر اضافه دارد.']]);
    // صفر یعنی «ندارد».
    expect(readDraft(rest({ rounding: '0', minOrder: '0' }), V1, V1).list!.settings).toMatchObject({ roundingStepRials: 0, minOrderRials: 0 });
    // مالیات همان پیش‌نویس می‌ماند، و فیلد ساختگی‌اش نادیده است.
    const taxed: PriceList = { ...V1, settings: { ...V1.settings, vatPercent: 9 } };
    expect(readDraft(rest({}), taxed, V1).list!.settings.vatPercent).toBe(9);
    expect(draftFormFromEntries([...fieldsOf(form()), ['rest.vat', '50']]).rest).toEqual(form().rest);
  });

  it('«بقیه»: بیش از ده برابر نسخهٔ فعال هشدار است، نه خطا', () => {
    const active: PriceList = { ...V1, settings: { ...V1.settings, minOrderRials: 500_000, roundingStepRials: 10_000 } };
    const check = readDraft(form({ rest: { ...form().rest, rounding: '100,001', minOrder: '500,001' } }), active, active);
    expect(check.errors).toEqual([]);
    expect(issuesOf(check.warnings)).toEqual([
      ['rest.rounding', '100,001 تومان؟ بیش از ده برابر نسخهٔ فعال (1,000) است؛ شاید ریال نوشته‌ای.'],
      ['rest.minOrder', '500,001 تومان؟ بیش از ده برابر نسخهٔ فعال (50,000) است؛ شاید ریال نوشته‌ای.'],
    ]);
  });

  it('نام: خالی نه؛ حداکثر 60 نویسه، پس از یکدست شدن', () => {
    expect(errorsOf(form({ label: '   ' }))).toEqual([['label', 'نام نسخه را بنویس.']]);
    expect(errorsOf(form({ label: 'ا'.repeat(60) }))).toEqual([]);
    expect(errorsOf(form({ label: 'ا'.repeat(61) }))).toEqual([['label', 'نام حداکثر 60 نویسه باشد.']]);
  });

  it('نرخ چاپ: هر چهار خانهٔ هر اندازه عدد، بیش از صفر، و تا 100,000,000 تومان', () => {
    const at = (single: Partial<Record<'bw' | 'color', string>>, double: Partial<Record<'bw' | 'color', string>> = {}) =>
      form({ print: { ...form().print, a4: { single: { ...rates('1,600', '2,000').single, ...single }, double: { ...rates('1,600', '2,000').double, ...double } } } });
    expect(errorsOf(at({ bw: '' }, { color: '0' }))).toEqual([
      ['print.a4.double.color', 'نرخ چاپ صفر نمی‌شود.'],
      ['print.a4.single.bw', 'عدد را بنویس.'],
    ]);
    expect(errorsOf(at({ bw: '1.5' }))).toEqual([['print.a4.single.bw', 'فقط رقم بنویس، بی اعشار و بی واحد.']]);
    expect(errorsOf(at({}, { bw: '100,000,001' }))).toEqual([['print.a4.double.bw', 'بیش از 100,000,000 تومان است؛ شاید صفر اضافه دارد.']]);
    expect(errorsOf(at({}, { bw: '100,000,000' }))).toEqual([]);
  });

  it('هشدار ده برابر، نه خطا: همان پیام طرح؛ درست ده برابر نه', () => {
    const f = form();
    const check = readDraft(form({ print: { ...f.print, a4: { single: rates('1,600', '20,000').single, double: rates('17,000', '2,000').double } } }), V1, V1);
    expect(check.errors).toEqual([]);
    expect(check.list).not.toBeNull();
    expect(issuesOf(check.warnings)).toEqual([['print.a4.double.bw', '17,000 تومان؟ بیش از ده برابر نسخهٔ فعال (1,600) است؛ شاید ریال نوشته‌ای.']]);
    // بازه با بازهٔ فعالی که همان «از» را می‌پوشاند؛ کرایه با همان خانه؛ نرخ کاغذ با همان کاغذ و اندازه (صفر فعال: بی هشدار).
    const bands = [...f.bindings[0]!.bands.a4.slice(0, 5), band('701', '800', '780,001')];
    const more = readDraft(
      form({ bindings: [spiral({ bands: { ...f.bindings[0]!.bands, a4: bands } })], papers: [tahrir({ rates: { a4: '5,000', a5: '', a3: '' } })], ship: { ...f.ship, 'other:0': '1,377,501' } }),
      V1,
      V1,
    );
    expect(more.warnings.map((w) => w.field)).toEqual(['binding.0.band.a4.5.price', 'ship.other:0']);
    // بی نسخهٔ فعال، هشداری نیست.
    expect(readDraft(form({ print: { ...f.print, a4: rates('17,000', '2,000') } }), V1, null).warnings).toEqual([]);
  });
});

describe('اندازه‌ها', () => {
  it('A5 با تیک: چهار نرخ، و کاغذ و صحافی پیش‌فرض نرخ و بازهٔ همان؛ موتور قیمت با همان قیمت می‌دهد', () => {
    const check = readDraft(withA5(), V1, V1);
    expect(check.errors).toEqual([]);
    const list = check.list!;
    expect(list.printRates.a5).toEqual({ single: { bw: 12_000, color: 15_000 }, double: { bw: 12_000, color: 15_000 } });
    expect(list.printRates.a3).toBeUndefined();
    expect(list.paperTypes.tahrir80!.sheetRates).toEqual({ a4: 0, a5: 0 });
    expect(list.bindingTypes.spiral_clear!.bands.a5).toEqual([{ minSheets: 1, maxSheets: 800, priceRials: 400_000 }]);
    // 100 صفحهٔ دورو A5: 100 × 1,200 + یک جلد 40,000.
    expect(priced(list, { pages: 100, size: 'a5' })).toEqual({ tomans: 160_000, warnings: [] });
    expect(priced(list, { pages: 100, size: 'a3' }).warnings).toContain('paper_size_unavailable');
  });

  it('تیک A5 برداشته: هرچه از A5 در فرم مانده ذخیره نمی‌شود', () => {
    const check = readDraft(withA5({ sizes: { a4: true, a5: false, a3: false } }), V1, V1);
    expect(check.errors).toEqual([]);
    expect(check.list).toEqual({ ...V1, label: 'تعرفهٔ پایه — شهریور 1405' });
  });

  it('A5 بی نرخ، کاغذ پیش‌فرض بی نرخ A5، و صحافی پیش‌فرض بی بازهٔ A5: هر کدام خطای جای خودش', () => {
    const f = form();
    expect(errorsOf({ ...f, sizes: { a4: true, a5: true, a3: false } })).toEqual([
      ['print.a5.double.bw', 'عدد را بنویس.'],
      ['print.a5.double.color', 'عدد را بنویس.'],
      ['print.a5.single.bw', 'عدد را بنویس.'],
      ['print.a5.single.color', 'عدد را بنویس.'],
      ['paper.0.rate.a5', 'کاغذ پیش‌فرض نرخ هر اندازه را دارد؛ صفر هم می‌شود.'],
      ['binding.0.bands.a5', 'صحافی پیش‌فرض بازه‌های هر اندازه را دارد.'],
    ]);
  });
});

describe('کاغذها', () => {
  const glossy = (patch: Partial<PaperInput> = {}): PaperInput => ({ id: 'glossy', name: 'گلاسه', gsm: '135', enabled: true, rates: { a4: '3,000', a5: '', a3: '' }, ...patch });

  it('کاغذ تازه: نام، گرماژ و نرخ هر برگ؛ اندازه‌ای که نرخ ندارد ندارد؛ موتور قیمت نرخ برگ را روی چاپ می‌گذارد', () => {
    const check = readDraft(form({ papers: [...form().papers, glossy()] }), V1, V1);
    expect(check.errors).toEqual([]);
    expect(check.list!.paperTypes.glossy).toEqual({ nameFa: 'گلاسه', gsm: 135, enabled: true, sheetRates: { a4: 30_000 } });
    // 100 صفحهٔ دورو = 50 برگ: 100 × 1,600 + 50 × 3,000 + یک جلد 45,000.
    expect(priced(check.list!, { pages: 100, paper: 'glossy' })).toEqual({ tomans: 355_000, warnings: [] });
  });

  it('newPaper: روشن، نرخ صفر برای هر اندازهٔ ارائه‌شده؛ شناسهٔ تازه شکل درست دارد و یکتاست', () => {
    expect(newPaper({ a4: true, a5: true, a3: false }, 0, 0)).toEqual({ id: 'paper_00000', name: '', gsm: '80', enabled: true, rates: { a4: '0', a5: '0', a3: '' } });
    const ids = new Set(Array.from({ length: 50 }, (_, i) => newOptionId('paper', 1_760_000_000_000 + i, i / 50)));
    expect(ids.size).toBe(50);
    for (const id of [...ids, newOptionId('binding')]) expect(id).toMatch(OPTION_ID);
  });

  it('خطاها: نام خالی، تکراری یا بلند؛ گرماژ؛ شناسهٔ خراب یا تکراری؛ پیش‌فرض خاموش یا حذف‌شده؛ سقف 20 کاغذ', () => {
    const papers = (...rows: PaperInput[]) => form({ papers: [form().papers[0]!, ...rows] });
    expect(errorsOf(papers(glossy({ name: '  ' })))).toEqual([['paper.1.name', 'نام کاغذ را بنویس.']]);
    expect(errorsOf(papers(glossy({ name: 'تحریر 80 گرم' })))).toEqual([['paper.1.name', 'این نام را گزینهٔ دیگری هم دارد.']]);
    expect(errorsOf(papers(glossy({ name: 'ا'.repeat(41) })))).toEqual([['paper.1.name', 'نام حداکثر 40 نویسه باشد.']]);
    expect(errorsOf(papers(glossy({ gsm: '0' })))).toEqual([['paper.1.gsm', 'گرماژ عددی از 1 تا 1,000 است.']]);
    expect(errorsOf(papers(glossy({ gsm: '1001' })))).toEqual([['paper.1.gsm', 'گرماژ عددی از 1 تا 1,000 است.']]);
    expect(errorsOf(papers(glossy({ id: 'Glossy!' })))).toEqual([['paper.1.name', 'شناسهٔ این کاغذ درست نیست؛ صفحه را دوباره باز کن.']]);
    expect(errorsOf(papers(glossy({ id: 'tahrir80' })))).toEqual([['paper.1.name', 'شناسهٔ این کاغذ درست نیست؛ صفحه را دوباره باز کن.']]);
    expect(errorsOf(papers(glossy({ rates: { a4: 'x', a5: '', a3: '' } })))).toEqual([['paper.1.rate.a4', 'فقط رقم بنویس، بی اعشار و بی واحد.']]);
    expect(errorsOf(form({ papers: [tahrir({ enabled: false })] }))).toEqual([['paper.0.enabled', 'کاغذ پیش‌فرض خاموش نمی‌شود.']]);
    expect(errorsOf(form({ papers: [tahrir({ rates: { a4: '', a5: '', a3: '' } })] }))).toEqual([['paper.0.rate.a4', 'کاغذ پیش‌فرض نرخ هر اندازه را دارد؛ صفر هم می‌شود.']]);
    expect(errorsOf(form({ papers: [glossy()] }))).toEqual([['papers', 'کاغذ پیش‌فرض (tahrir80) حذف نمی‌شود.']]);
    const many = Array.from({ length: 20 }, (_, i) => glossy({ id: `paper_${i}`, name: `کاغذ ${i}` }));
    expect(errorsOf(papers(...many))).toEqual([['papers', 'حداکثر 20 کاغذ.']]);
    expect(errorsOf(papers(...many.slice(1)))).toEqual([]);
  });

  it('کاغذ روشن بی نرخ در هیچ اندازه هشدار است، نه خطا؛ خاموشش نه', () => {
    const check = readDraft(form({ papers: [...form().papers, glossy({ rates: { a4: '', a5: '', a3: '' } })] }), V1, V1);
    expect(check.errors).toEqual([]);
    expect(issuesOf(check.warnings)).toEqual([['paper.1.name', 'این کاغذ در هیچ اندازه‌ای نرخ ندارد، پس در سایت دیده نمی‌شود.']]);
    expect(readDraft(form({ papers: [...form().papers, glossy({ enabled: false, rates: { a4: '', a5: '', a3: '' } })] }), V1, V1).warnings).toEqual([]);
  });
});

describe('صحافی‌ها', () => {
  /** منگنه: جلد 1 تا 50 برگ، بالاتر نمی‌خورد. */
  const staple = (patch: Partial<BindingInput> = {}): BindingInput => ({
    id: 'staple',
    name: 'منگنه',
    enabled: true,
    min: '1',
    max: '50',
    splits: false,
    weight: '5',
    bands: { a4: [band('1', '50', '5,000')], a5: [], a3: [] },
    ...patch,
  });
  const bindings = (...rows: BindingInput[]) => form({ bindings: [form().bindings[0]!, ...rows] });
  const six: [string, string, string][] = [
    ['1', '150', '45,000'],
    ['151', '300', '50,000'],
    ['301', '450', '55,000'],
    ['451', '600', '62,000'],
    ['601', '700', '68,000'],
    ['701', '800', '78,000'],
  ];
  /** طلق و سیم با بازه‌های A4 دیگر. */
  const spiralBands = (...rows: [string, string, string][]) => form({ bindings: [spiral({ bands: { a4: rows.map(([from, to, price]) => band(from, to, price)), a5: [], a3: [] } })] });

  it('صحافی تازه: کمینه، سقف، «نمی‌خورد»، وزن و بازه‌ها؛ جزوهٔ بیرون از کمینه و سقف به آن نمی‌خورد', () => {
    const check = readDraft(bindings(staple({ min: '2', bands: { a4: [band('2', '50', '5,000')], a5: [], a3: [] } })), V1, V1);
    expect(check.errors).toEqual([]);
    expect(check.list!.bindingTypes.staple).toEqual({
      nameFa: 'منگنه',
      enabled: true,
      minSheets: 2,
      maxSheetsPerVolume: 50,
      splitsVolumes: false,
      weightPerVolumeGrams: 5,
      bands: { a4: [{ minSheets: 2, maxSheets: 50, priceRials: 50_000 }] },
    });
    // 100 صفحهٔ دورو = 50 برگ: 100 × 1,600 + 5,000.
    expect(priced(check.list!, { pages: 100, binding: 'staple' })).toEqual({ tomans: 165_000, warnings: [] });
    expect(priced(check.list!, { pages: 102, binding: 'staple' }).warnings).toContain('binding_does_not_fit');
    expect(priced(check.list!, { pages: 2, binding: 'staple' }).warnings).toContain('binding_does_not_fit');
  });

  it('newBinding: روشن، 1 تا 50 برگ، «نمی‌خورد»، و یک ردیف بازهٔ A4 که قیمتش را مالک می‌نویسد', () => {
    expect(newBinding(0, 0)).toEqual({
      id: 'binding_00000',
      name: '',
      enabled: true,
      min: '1',
      max: '50',
      splits: false,
      weight: '10',
      bands: { a4: [band('1', '50', '')], a5: [], a3: [] },
    });
    expect(errorsOf(bindings(newBinding(0, 0)))).toEqual([
      ['binding.1.name', 'نام صحافی را بنویس.'],
      ['binding.1.band.a4.0.price', 'عدد را بنویس.'],
    ]);
  });

  it('کمینه، سقف و وزن: عدد درست؛ سقف نه کمتر از کمینه؛ صحافی‌ای که چند جلد می‌شود کمینه‌ای تا نصف سقف', () => {
    expect(errorsOf(bindings(staple({ min: '0' })))).toEqual([['binding.1.min', 'کمینهٔ برگ از 1 است.']]);
    expect(errorsOf(bindings(staple({ max: '' })))).toEqual([['binding.1.max', 'عدد را بنویس.']]);
    expect(errorsOf(bindings(staple({ max: '100001' })))).toEqual([['binding.1.max', 'سقف برگ هر جلد از 1 تا 100,000 است.']]);
    expect(errorsOf(bindings(staple({ weight: '10001' })))).toEqual([['binding.1.weight', 'وزن جلد از 0 تا 10,000 گرم است.']]);
    expect(errorsOf(bindings(staple({ min: '60' })))).toEqual([['binding.1.max', 'سقف برگ هر جلد از کمینه کمتر است.']]);
    const split = (min: string) => staple({ min, max: '50', splits: true, bands: { a4: [band(min, '50', '5,000')], a5: [], a3: [] } });
    expect(errorsOf(bindings(split('25')))).toEqual([]);
    expect(errorsOf(bindings(split('26')))).toEqual([['binding.1.min', 'صحافی‌ای که چند جلد می‌شود کمینه‌ای بیش از 25 برگ ندارد: جزوهٔ 51 برگی دو جلد 25 و 26 برگی است.']]);
  });

  it('صحافی پیش‌فرض: روشن، از برگ 1، بالای سقف چند جلد، و حذف نمی‌شود', () => {
    expect(errorsOf(form({ bindings: [spiral({ enabled: false })] }))).toEqual([['binding.0.enabled', 'صحافی پیش‌فرض خاموش نمی‌شود.']]);
    expect(errorsOf(form({ bindings: [spiral({ splits: false })] }))).toEqual([
      ['binding.0.splits', 'صحافی پیش‌فرض بالای سقف چند جلد می‌شود، تا هر جزوه‌ای صحافی داشته باشد.'],
    ]);
    const fromTwo = form({ bindings: [spiral({ min: '2', bands: { a4: [band('2', '800', '45,000')], a5: [], a3: [] } })] });
    expect(errorsOf(fromTwo)).toEqual([['binding.0.min', 'کمینهٔ برگ صحافی پیش‌فرض 1 است، تا هر جزوه‌ای صحافی داشته باشد.']]);
    expect(errorsOf(form({ bindings: [staple()] }))).toEqual([['bindings', 'صحافی پیش‌فرض (spiral_clear) حذف نمی‌شود.']]);
    expect(errorsOf(form({ bindings: [spiral({ bands: { a4: [], a5: [], a3: [] } })] }))).toEqual([['binding.0.bands.a4', 'صحافی پیش‌فرض بازه‌های هر اندازه را دارد.']]);
  });

  it('نام تکراری میان صحافی‌ها، و سقف 20 صحافی', () => {
    expect(errorsOf(bindings(staple({ name: 'طلق و سیم' })))).toEqual([['binding.1.name', 'این نام را گزینهٔ دیگری هم دارد.']]);
    // نام کاغذ و صحافی هم‌نام می‌توانند باشند: دو فهرست جدا.
    expect(errorsOf(form({ papers: [tahrir({ name: 'منگنه' })], bindings: [form().bindings[0]!, staple()] }))).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => staple({ id: `binding_${i}`, name: `صحافی ${i}` }));
    expect(errorsOf(bindings(...many))).toEqual([['bindings', 'حداکثر 20 صحافی.']]);
  });

  it('صحافی روشن بی بازه در هیچ اندازه هشدار است، نه خطا', () => {
    const check = readDraft(bindings(staple({ bands: { a4: [], a5: [], a3: [] } })), V1, V1);
    expect(check.errors).toEqual([]);
    expect(issuesOf(check.warnings)).toEqual([['binding.1.name', 'این صحافی در هیچ اندازه‌ای بازه ندارد، پس در سایت دیده نمی‌شود.']]);
    // بازهٔ اندازه‌ای که ارائه نمی‌شود نه سنجیده می‌شود و نه ذخیره.
    const a3 = readDraft(bindings(staple({ bands: { a4: [band('1', '50', '5,000')], a5: [], a3: [band('x', '', '')] } })), V1, V1);
    expect(a3.errors).toEqual([]);
    expect(a3.list!.bindingTypes.staple!.bands).toEqual({ a4: [{ minSheets: 1, maxSheets: 50, priceRials: 50_000 }] });
  });

  it('بازه‌ها از کمینه تا سقف هر جلد: شکاف و همپوشانی با پیام دقیق طرح روی «از» همان ردیف', () => {
    const rows = six.map((r) => [...r] as [string, string, string]);
    rows[2]![0] = '302';
    expect(errorsOf(spiralBands(...rows))).toEqual([['binding.0.band.a4.2.from', 'برگ 301 قیمت ندارد: بازهٔ قبلی تا 300 است. «از» را 301 کن.']]);
    rows[2]![0] = '310';
    expect(errorsOf(spiralBands(...rows))).toEqual([['binding.0.band.a4.2.from', 'برگ‌های 301 تا 309 قیمت ندارند: بازهٔ قبلی تا 300 است. «از» را 301 کن.']]);
    rows[2]![0] = '300';
    expect(errorsOf(spiralBands(...rows))).toEqual([['binding.0.band.a4.2.from', 'برگ 300 دو قیمت دارد: بازهٔ قبلی تا 300 است. «از» را 301 کن.']]);
    rows[2]![0] = '290';
    expect(errorsOf(spiralBands(...rows))).toEqual([['binding.0.band.a4.2.from', 'برگ‌های 290 تا 300 دو قیمت دارند: بازهٔ قبلی تا 300 است. «از» را 301 کن.']]);
    const first = six.map((r) => [...r] as [string, string, string]);
    first[0]![0] = '2';
    expect(errorsOf(spiralBands(...first))).toEqual([['binding.0.band.a4.0.from', 'برگ 1 قیمت ندارد: اولین بازه از 2 است. «از» را 1 کن.']]);
    const short = six.map((r) => [...r] as [string, string, string]);
    short[5]![1] = '799';
    expect(errorsOf(spiralBands(...short))).toEqual([['binding.0.band.a4.5.to', 'برگ 800 قیمت ندارد: آخرین بازه تا 799 است. «تا» را 800 کن.']]);
    expect(errorsOf(spiralBands(...six.slice(0, 5)))).toEqual([['binding.0.band.a4.4.to', 'برگ‌های 701 تا 800 قیمت ندارند: آخرین بازه تا 700 است. «تا» را 800 کن.']]);
    const long = six.map((r) => [...r] as [string, string, string]);
    long[5]![1] = '801';
    expect(errorsOf(spiralBands(...long))).toEqual([['binding.0.band.a4.5.to', 'بالای 800 برگ سقف جلد است: «تا»ی آخرین بازه 800 باشد.']]);
    // صحافی با کمینهٔ ۱۰: بازه‌ها از ۱۰.
    expect(errorsOf(bindings(staple({ min: '10' })))).toEqual([['binding.1.band.a4.0.from', 'کمینهٔ برگ 10 است: «از» را 10 کن.']]);
    expect(errorsOf(bindings(staple({ min: '10', bands: { a4: [band('11', '50', '5,000')], a5: [], a3: [] } })))).toEqual([
      ['binding.1.band.a4.0.from', 'برگ 10 قیمت ندارد: اولین بازه از 11 است. «از» را 10 کن.'],
    ]);
  });

  it('ترتیب ردیف‌ها آزاد است: بازه‌ها مرتب ذخیره می‌شوند؛ ردیف تمام‌خالی نادیده؛ قیمت صفر پذیرفته', () => {
    const shuffled = [six[3]!, six[0]!, ['', '', ''] as [string, string, string], six[5]!, six[1]!, six[4]!, six[2]!];
    const check = readDraft(spiralBands(...shuffled), V1, V1);
    expect(check.errors).toEqual([]);
    expect(check.list!.bindingTypes.spiral_clear!.bands).toEqual(V1.bindingTypes.spiral_clear!.bands);
    const split = readDraft(spiralBands(['1', '100', '0'], ['101', '150', '45,000'], ...six.slice(1)), V1, V1);
    expect(split.errors).toEqual([]);
    expect(split.list!.bindingTypes.spiral_clear!.bands.a4!.slice(0, 2)).toEqual([
      { minSheets: 1, maxSheets: 100, priceRials: 0 },
      { minSheets: 101, maxSheets: 150, priceRials: 450_000 },
    ]);
  });

  it('خطای ردیف: خانهٔ خالی، برگ صفر، «تا» کمتر از «از»؛ پوشش فقط وقتی همه عددند؛ سقف 20 بازه', () => {
    expect(errorsOf(spiralBands(['1', '', '45,000'], ...six.slice(1)))).toEqual([['binding.0.band.a4.0.to', 'عدد را بنویس.']]);
    expect(errorsOf(spiralBands(['0', '150', '45,000'], ...six.slice(1)))).toEqual([['binding.0.band.a4.0.from', 'این شمارهٔ برگ درست نیست.']]);
    expect(errorsOf(spiralBands(['150', '1', '45,000'], ...six.slice(1)))).toEqual([['binding.0.band.a4.0.to', '«تا» از «از» کمتر است.']]);
    expect(errorsOf(spiralBands(['1', '150', 'x'], ...six.slice(1)))).toEqual([['binding.0.band.a4.0.price', 'فقط رقم بنویس، بی اعشار و بی واحد.']]);
    const many = Array.from({ length: 21 }, (_, i) => [String(i + 1), String(i + 1), '1'] as [string, string, string]);
    expect(errorsOf(spiralBands(...many))).toEqual([['binding.0.bands.a4', 'حداکثر 20 بازه.']]);
  });

  it('bandIssues: یک بازهٔ تنها از کمینه تا سقف درست است؛ چند خطا با هم', () => {
    expect(bandIssues([{ from: 1, to: 800 }], 800)).toEqual([]);
    expect(bandIssues([{ from: 20, to: 60 }], 60, 20)).toEqual([]);
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

  it('هر پیش‌نویس بی خطا را موتور قیمت برای هر جلد از کمینه تا سقف هر صحافی بی هشدار قیمت می‌دهد', () => {
    const check = readDraft(
      form({
        bindings: [
          spiral({ bands: { a4: [band('1', '10', '1,000'), band('11', '799', '50,000'), band('800', '800', '60,000')], a5: [], a3: [] } }),
          staple({ min: '3', max: '40', bands: { a4: [band('3', '3', '1,000'), band('4', '40', '2,000')], a5: [], a3: [] } }),
        ],
      }),
      V1,
      V1,
    );
    expect(check.errors).toEqual([]);
    for (let sheets = 1; sheets <= 800; sheets += 1) {
      expect(priced(check.list!, { pages: sheets, sides: 'single' }).warnings, `${sheets}`).toEqual([]);
    }
    for (let sheets = 3; sheets <= 40; sheets += 1) {
      expect(priced(check.list!, { pages: sheets, sides: 'single', binding: 'staple' }).warnings, `${sheets}`).toEqual([]);
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

  it('checkPriceList: نرخ A4، پیش‌فرض‌ها روشن و با هر اندازه، پوشش بازه‌ها و کرایهٔ هر منطقه', () => {
    expect(checkPriceList(V1)).toEqual([]);
    const spiralV1 = V1.bindingTypes.spiral_clear!;
    const off: PriceList = {
      ...V1,
      printRates: { a5: V1.printRates.a4 },
      paperTypes: { tahrir80: { ...V1.paperTypes.tahrir80!, enabled: false } },
      bindingTypes: {
        spiral_clear: { ...spiralV1, bands: { a4: spiralV1.bands.a4!.slice(1) } },
        staple: { nameFa: 'منگنه', enabled: true, minSheets: 30, maxSheetsPerVolume: 50, splitsVolumes: true, weightPerVolumeGrams: 5, bands: { a4: [{ minSheets: 30, maxSheets: 50, priceRials: 1 }] } },
      },
      shippingRates: V1.shippingRates.filter((r) => !(r.zoneId === 'other' && r.maxWeightGrams === null)),
    };
    expect(checkPriceList(off).map(text)).toEqual([
      'نرخ چاپ A4 لازم است.',
      'کاغذ پیش‌فرض (tahrir80) در این نسخه نیست یا خاموش است.',
      'صحافی پیش‌فرض بازه‌های A5 را ندارد.',
      'صحافی «طلق و سیم»، A4: برگ‌های 1 تا 150 قیمت ندارند: اولین بازه از 151 است. «از» را 1 کن.',
      'صحافی «منگنه»: کمینهٔ برگ بیش از نصف سقف است.',
      'کرایهٔ پست پیشتاز برای بقیهٔ کشور همهٔ وزن‌ها را، از صفر و بی سقف، پشت‌سرهم نمی‌پوشاند.',
    ]);
    const noSplit: PriceList = { ...V1, bindingTypes: { spiral_clear: { ...spiralV1, splitsVolumes: false } } };
    expect(checkPriceList(noSplit).map(text)).toEqual(['صحافی پیش‌فرض از برگ 1 است و بالای سقف چند جلد می‌شود.']);
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
    const v2 = readDraft(form({ print: { ...form().print, a4: rates('1,700', '2,200') } }), { ...V1, version: 2 }, V1).list!;
    expect(previewRows(V1, v2).map((row) => [text(row.label), row.activeRials! / 10, row.draftRials! / 10, diffText(row.diffRials!)])).toEqual([
      ['147 صفحه، سیاه‌سفید، دورو', 280_200, 294_900, '+14,700'],
      ['120 صفحه، رنگی، دورو', 285_000, 309_000, '+24,000'],
      ['3 فایل، 300 صفحه، یکرو', 530_000, 560_000, '+30,000'],
      ['1,650 صفحه، دو جلد', 2_750_000, 2_915_000, '+165,000'],
    ]);
    expect(diffText(-30_000)).toBe('−3,000');
    expect(diffText(0)).toBe('0');
  });

  it('یک نمونه برای هر اندازه، کاغذ روشن و صحافی روشن دیگر؛ «—» جایی که نسخهٔ فعال آن را ندارد', () => {
    const f = withA5();
    const v2 = readDraft(
      {
        ...f,
        papers: [...f.papers, { id: 'glossy', name: 'گلاسه', gsm: '135', enabled: true, rates: { a4: '', a5: '2,000', a3: '' } }, { id: 'off', name: 'خاموش', gsm: '80', enabled: false, rates: { a4: '1', a5: '', a3: '' } }],
        bindings: [...f.bindings, { id: 'staple', name: 'منگنه', enabled: true, min: '1', max: '50', splits: false, weight: '5', bands: { a4: [band('1', '50', '5,000')], a5: [], a3: [] } }],
      },
      { ...V1, version: 2 },
      V1,
    ).list!;
    const rows = previewRows(V1, v2).slice(4);
    expect(rows.map((row) => [text(row.label), row.activeRials, row.draftRials === null ? null : row.draftRials / 10, row.diffRials])).toEqual([
      // 147 صفحه دورو A5: 147 × 1,200 + یک جلد 40,000.
      ['147 صفحه، سیاه‌سفید، دورو، A5', null, 216_400, null],
      // 120 صفحه رنگی دورو A5 گلاسه: 120 × 1,500 + 60 × 2,000 + 40,000.
      ['120 صفحه، رنگی، دورو، گلاسه، A5', null, 340_000, null],
      // نمونهٔ صحافی 74 برگ است، ولی سقف منگنه 50: 100 صفحه × 1,600 + 5,000.
      ['100 صفحه، دورو، منگنه', null, 165_000, null],
    ]);
  });

  it('زیر حداقل سفارش همان قیمت است، نه «—»', () => {
    const min: PriceList = { ...V1, settings: { ...V1.settings, minOrderRials: 100_000_000 } };
    expect(previewRows(min, min)[0]).toMatchObject({ activeRials: 2_802_000, draftRials: 2_802_000, diffRials: 0 });
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
  const draft = (f: DraftForm) => readDraft(f, { ...V1, version: 2 }, V1).list!;

  it('فقط نرخ چاپ: یک خط برای هر رنگ و رو؛ «کاغذ، صحافی، پست، تخفیف و بقیه» بی تغییر', () => {
    const v2 = draft(form({ label: 'تعرفهٔ مهر 1405', print: { ...form().print, a4: { single: rates('1,600', '2,000').single, double: rates('1,700', '2,200').double } } }));
    expect(changesOf(v2)).toEqual({
      lines: [
        ['چاپ سیاه‌سفید، دورو، A4، هر رو', '1,600 ← 1,700 تومان'],
        ['چاپ رنگی، دورو، A4، هر رو', '2,000 ← 2,200 تومان'],
      ],
      unchanged: ['کاغذ', 'صحافی', 'پست', 'تخفیف', 'بقیه'],
    });
    // برگشت: همان خطوط، برعکس.
    expect(changesOf(V1, v2).lines).toEqual([
      ['چاپ سیاه‌سفید، دورو، A4، هر رو', '1,700 ← 1,600 تومان'],
      ['چاپ رنگی، دورو، A4، هر رو', '2,200 ← 2,000 تومان'],
    ]);
    expect(changesOf({ ...V1, version: 3, label: 'فقط نام' })).toEqual({ lines: [], unchanged: ['چاپ', 'کاغذ', 'صحافی', 'پست', 'تخفیف', 'بقیه'] });
  });

  it('«بقیه» (۸٫۴): گرد کردن و حداقل سفارش هر کدام یک خط؛ گروه‌های دیگر بی تغییر', () => {
    const v2 = draft(form({ rest: { rounding: '1,000', minOrder: '50,000', packaging: '100' } }));
    expect(changesOf(v2)).toEqual({
      lines: [
        ['گرد کردن', 'ندارد ← به 1,000 تومان'],
        ['حداقل سفارش', 'ندارد ← 50,000 تومان'],
      ],
      unchanged: ['چاپ', 'کاغذ', 'صحافی', 'پست', 'تخفیف'],
    });
    expect(changesOf(draft(form({ rest: { ...form().rest, packaging: '150' } }))).lines).toEqual([['وزن بسته‌بندی', '100 گرم ← 150 گرم']]);
  });

  it('اندازهٔ تازه با نرخ‌هایش، کاغذ و صحافی تازه، و برعکس برداشته', () => {
    const f = withA5();
    const v2 = draft({
      ...f,
      papers: [...f.papers, { id: 'glossy', name: 'گلاسه', gsm: '135', enabled: true, rates: { a4: '3,000', a5: '', a3: '' } }],
      bindings: [...f.bindings, { id: 'staple', name: 'منگنه', enabled: true, min: '1', max: '50', splits: false, weight: '5', bands: { a4: [band('1', '50', '5,000')], a5: [], a3: [] } }],
    });
    expect(changesOf(v2)).toEqual({
      lines: [
        ['اندازهٔ A5', 'تازه'],
        ['چاپ سیاه‌سفید، دورو، A5، هر رو', 'تازه: 1,200 تومان'],
        ['چاپ سیاه‌سفید، یکرو، A5، هر رو', 'تازه: 1,200 تومان'],
        ['چاپ رنگی، دورو، A5، هر رو', 'تازه: 1,500 تومان'],
        ['چاپ رنگی، یکرو، A5، هر رو', 'تازه: 1,500 تومان'],
        ['کاغذ «تحریر ۸۰ گرم»، A5، هر برگ', 'تازه: 0 تومان'],
        ['کاغذ «گلاسه»', 'تازه'],
        ['صحافی «طلق و سیم»، A5', 'تازه'],
        ['صحافی «منگنه»', 'تازه'],
      ],
      unchanged: ['پست', 'تخفیف', 'بقیه'],
    });
    // پایگاه داده گزینه‌ها را به ترتیب شناسه می‌دهد («binding_…» پیش از «spiral_clear»)؛ خطوط همان، پیش‌فرض اول.
    const fromDb: PriceList = {
      ...v2,
      paperTypes: { glossy: v2.paperTypes.glossy!, tahrir80: v2.paperTypes.tahrir80! },
      bindingTypes: { staple: v2.bindingTypes.staple!, spiral_clear: v2.bindingTypes.spiral_clear! },
    };
    expect(changesOf(fromDb)).toEqual(changesOf(v2));
    expect(changesOf(V1, v2).lines).toEqual([
      ['اندازهٔ A5', 'برداشته شد'],
      ['کاغذ «تحریر ۸۰ گرم»، A5، هر برگ', 'برداشته شد'],
      ['کاغذ «گلاسه»', 'برداشته شد'],
      ['صحافی «طلق و سیم»، A5', 'برداشته شد'],
      ['صحافی «منگنه»', 'برداشته شد'],
    ]);
  });

  it('کاغذ و صحافی مانده: نام، روشن و خاموش، گرماژ، نرخ برگ، کمینه، سقف، «بالای سقف» و وزن جلد', () => {
    const glossy = { nameFa: 'گلاسه', gsm: 135, enabled: true, sheetRates: { a4: 30_000 } };
    const staple = { nameFa: 'منگنه', enabled: true, minSheets: 1, maxSheetsPerVolume: 50, splitsVolumes: false, weightPerVolumeGrams: 5, bands: { a4: [{ minSheets: 1, maxSheets: 50, priceRials: 50_000 }] } };
    const from: PriceList = { ...V1, paperTypes: { ...V1.paperTypes, glossy }, bindingTypes: { ...V1.bindingTypes, staple } };
    const to: PriceList = {
      ...from,
      version: 2,
      paperTypes: { ...V1.paperTypes, glossy: { ...glossy, nameFa: 'گلاسه مات', gsm: 150, enabled: false, sheetRates: { a4: 35_000 } } },
      bindingTypes: { ...V1.bindingTypes, staple: { ...staple, minSheets: 2, maxSheetsPerVolume: 40, splitsVolumes: true, weightPerVolumeGrams: 6, bands: { a4: [{ minSheets: 2, maxSheets: 40, priceRials: 50_000 }] } } },
    };
    expect(changesOf(to, from)).toEqual({
      lines: [
        ['کاغذ «گلاسه»', 'نام: گلاسه مات'],
        ['کاغذ «گلاسه مات»', 'خاموش شد'],
        ['کاغذ «گلاسه مات»، گرماژ', '135 ← 150 گرم'],
        ['کاغذ «گلاسه مات»، A4، هر برگ', '3,000 ← 3,500 تومان'],
        ['صحافی «منگنه»، کمینهٔ برگ', '1 ← 2 برگ'],
        ['صحافی «منگنه»، سقف برگ هر جلد', '50 ← 40 برگ'],
        ['صحافی «منگنه»، بالای سقف', 'چند جلد می‌شود'],
        ['صحافی «منگنه»، وزن هر جلد', '5 ← 6 گرم'],
        ['صحافی «منگنه»، A4، 2 تا 40 برگ', 'تازه: 5,000 تومان'],
        ['صحافی «منگنه»، A4، 1 تا 50 برگ', 'برداشته شد'],
      ],
      unchanged: ['چاپ', 'پست', 'تخفیف', 'بقیه'],
    });
  });

  it('بازه‌ها: هم‌بازه با قیمت دیگر، بازهٔ تازه، و بازهٔ برداشته؛ کرایه و بقیه', () => {
    const f = form();
    const a4 = [band('1', '100', '40,000'), band('101', '150', '45,000'), ...f.bindings[0]!.bands.a4.slice(1)];
    a4[3] = { ...a4[3]!, price: '58,000' };
    const v2 = draft({ ...f, bindings: [spiral({ bands: { ...f.bindings[0]!.bands, a4 } })], ship: { ...f.ship, 'tehran:0': '135,000' } });
    const v2b: PriceList = { ...v2, settings: { ...v2.settings, vatPercent: 9, roundingStepRials: 10_000 } };
    expect(changesOf(v2b)).toEqual({
      lines: [
        ['صحافی «طلق و سیم»، A4، 1 تا 100 برگ', 'تازه: 40,000 تومان'],
        ['صحافی «طلق و سیم»، A4، 101 تا 150 برگ', 'تازه: 45,000 تومان'],
        ['صحافی «طلق و سیم»، A4، 301 تا 450 برگ', '55,000 ← 58,000 تومان'],
        ['صحافی «طلق و سیم»، A4، 1 تا 150 برگ', 'برداشته شد'],
        ['پست پیشتاز، استان تهران، تا 1 کیلو', '129,500 ← 135,000 تومان'],
        ['مالیات', '0٪ ← 9٪'],
        ['گرد کردن', 'ندارد ← به 1,000 تومان'],
      ],
      unchanged: ['چاپ', 'کاغذ', 'تخفیف'],
    });
  });

  it('هرچه خط خودش را ندارد، «جزئیات دیگر»؛ ترتیب ردیف‌ها و گزینه‌ها تغییر نیست', () => {
    const tipax: PriceList = { ...V1, version: 2, shippingMethods: { ...V1.shippingMethods, tipax: { nameFa: 'تیپاکس', enabled: true } } };
    expect(changesOf(tipax)).toEqual({ lines: [['جزئیات دیگر', 'عوض شد (روش‌های ارسال)']], unchanged: ['چاپ', 'کاغذ', 'صحافی', 'پست', 'تخفیف'] });
    const reordered: PriceList = {
      ...V1,
      shippingRates: [...V1.shippingRates].reverse(),
      shippingMethods: Object.fromEntries(Object.entries(V1.shippingMethods).reverse()),
      printRates: { a4: { double: V1.printRates.a4!.double, single: V1.printRates.a4!.single } },
    };
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

describe('تخفیف سفارش بزرگ در تعرفه (۱۱٫۴)', () => {
  const tier = (from: string, percent: string, freeShipping = false) => ({ from, percent, freeShipping });
  const base: PriceList = { ...V1, version: 2 };
  const issues = (f: DraftForm) => {
    const check = readDraft(f, base, V1);
    return {
      errors: check.errors.map((issue) => [issue.field, text(issue.text)]),
      warnings: check.warnings.map((issue) => [issue.field, text(issue.text)]),
      tiers: check.list?.discountTiers ?? null,
    };
  };

  it('فرم پله‌ها: از نسخه، و رفت‌وبرگشت فیلدهای HTML؛ فرم بی نشانهٔ کارت (زبانهٔ پیش از ۱۱٫۴) پله‌ها را null می‌گذارد', () => {
    const list: PriceList = { ...V1, discountTiers: [{ fromRials: 30_000_000, percent: 5, freeShipping: true }] };
    expect(draftFormOf(list).tiers).toEqual([tier('3,000,000', '5', true)]);
    expect(draftFormOf(V1).tiers).toEqual([]);
    const f = form({ tiers: [tier('3,000,000', '5', true), tier('7,000,000', '10'), newTier()] });
    expect(draftFormFromEntries(fieldsOf(f))).toEqual(f);
    expect(draftFormFromEntries(fieldsOf(form({ tiers: [] }))).tiers).toEqual([]);
    expect(draftFormFromEntries(fieldsOf(form({ tiers: null }))).tiers).toBeNull();
  });

  it('سنجش: آستانه تومان و بیش از صفر، درصد تا ۵۰، دست‌کم یک تخفیف، آستانهٔ یکتا، تا ۵ پله؛ خروجی به ترتیب آستانه', () => {
    const ok = issues(form({ tiers: [tier('7,000,000', '10', true), tier('۳٬۰۰۰٬۰۰۰', '5')] }));
    expect(ok.errors).toEqual([]);
    expect(ok.tiers).toEqual([
      { fromRials: 30_000_000, percent: 5, freeShipping: false },
      { fromRials: 70_000_000, percent: 10, freeShipping: true },
    ]);
    expect(issues(form({ tiers: [tier('0', '5')] })).errors).toEqual([['tier.0.from', 'آستانه صفر نمی‌شود؛ پله از جمعی بالاتر از صفر است.']]);
    expect(issues(form({ tiers: [tier('1,000', '51')] })).errors).toEqual([['tier.0.percent', 'درصد از 0 تا 50 است.']]);
    expect(issues(form({ tiers: [tier('1,000', '0')] })).errors).toEqual([['tier.0.percent', 'این پله تخفیفی ندارد: درصد بگذار، یا «ارسال رایگان» را بزن.']]);
    expect(issues(form({ tiers: [tier('1,000', '0', true)] })).errors).toEqual([]);
    expect(issues(form({ tiers: [tier('1,000', '5'), tier('1,000', '8')] })).errors).toEqual([['tier.1.from', 'این آستانه را پلهٔ دیگری هم دارد.']]);
    expect(issues(form({ tiers: [tier('', '5')] })).errors.map(([field]) => field)).toEqual(['tier.0.from']);
    const six = Array.from({ length: 6 }, (_, i) => tier(String((i + 1) * 1000), '5'));
    expect(issues(form({ tiers: six })).errors.map(([field]) => field)).toContain('tiers');
  });

  it('هشدار: پلهٔ بالاتر با تخفیف کمتر (پله‌ها جمع نمی‌شوند)؛ و فرم بی پله همان پله‌های پیش‌نویس را نگه می‌دارد', () => {
    expect(issues(form({ tiers: [tier('1,000', '10', true), tier('5,000', '8')] })).warnings).toEqual([
      ['tier.1.percent', 'تخفیف این پله از پلهٔ پایین‌ترش کمتر است؛ پله‌ها روی هم جمع نمی‌شوند و فقط بالاترین می‌نشیند.'],
    ]);
    const kept: PriceList = { ...base, discountTiers: [{ fromRials: 10_000, percent: 5, freeShipping: false }] };
    expect(readDraft(form({ tiers: null }), kept, V1).list!.discountTiers).toEqual(kept.discountTiers);
    expect(readDraft(form({ tiers: [] }), kept, V1).list!.discountTiers).toEqual([]);
  });

  it('«چه عوض می‌شود»: پلهٔ تازه، پاداش عوض‌شده و پلهٔ برداشته؛ و جدول فقط‌خواندنی', () => {
    const from: PriceList = { ...V1, discountTiers: [{ fromRials: 30_000_000, percent: 5, freeShipping: false }, { fromRials: 50_000_000, percent: 8, freeShipping: false }] };
    const to: PriceList = { ...V1, version: 2, discountTiers: [{ fromRials: 30_000_000, percent: 5, freeShipping: true }, { fromRials: 70_000_000, percent: 0, freeShipping: true }] };
    const changes = tariffChanges(from, to);
    expect(changes.lines.map((l) => [text(l.key), text(l.value)])).toEqual([
      ['تخفیف سفارش بزرگ، از 3,000,000 تومان', '5٪ ← 5٪ و ارسال رایگان'],
      ['تخفیف سفارش بزرگ، از 7,000,000 تومان', 'تازه: ارسال رایگان'],
      ['تخفیف سفارش بزرگ، از 5,000,000 تومان', 'برداشته شد'],
    ]);
    expect(changes.unchanged).toEqual(['چاپ', 'کاغذ', 'صحافی', 'پست', 'بقیه']);
    expect(tierRows(to).map((row) => [text(row.label), text(row.value)])).toEqual([
      ['از 3,000,000 تومان', '5٪ و ارسال رایگان'],
      ['از 7,000,000 تومان', 'ارسال رایگان'],
    ]);
    expect(tierRows(V1).map((row) => [text(row.label), text(row.value)])).toEqual([['پله‌ها', 'ندارد']]);
  });
});
