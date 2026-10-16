/**
 * کد تخفیف به زبان پنل (`discounts.ts`، برش ۱۱٫۴): فرم «کد تازه» و ویرایش، سنجش با جای هر خطا، رفت‌وبرگشت فرم و ردیف (تا «فقط خاموش
 * شد» درست باشد)، و متن فهرست. پول تومان به ریال، روز شمسی به نیمه‌شب تهران.
 */

import { describe, expect, it } from 'vitest';

import type { DiscountCodeRow } from '@jozveyar/db';

import {
  discountFormFrom,
  discountFormOf,
  discountState,
  discountTermsText,
  discountUseText,
  discountWindowText,
  onlyDisables,
  readDiscountForm,
  termsOfRow,
  type DiscountForm,
} from './discounts';

/** ۲۵ مهر ۱۴۰۵، نیمه‌شب تهران (۲۰:۳۰ UTC روز پیش). */
const MEHR_25 = new Date('2026-10-16T20:30:00Z');
const MEHR_31 = new Date('2026-10-22T20:30:00Z');

const form = (over: Partial<DiscountForm> = {}): DiscountForm => ({
  discount: 'mehr 1405',
  kind: 'percent',
  percent: '20',
  max: '50,000',
  amount: '',
  minOrder: '300000',
  from: '1405/07/25',
  until: '۱۴۰۵/۰۷/۳۰',
  total: '100',
  perCustomer: '1',
  enabled: true,
  note: '  کمپین  مهر ',
  ...over,
});

const ROW: DiscountCodeRow = {
  id: '0b6a7c1e-1f53-4c2a-9d55-6c1f1c0e0001',
  code: 'MEHR1405',
  kind: 'percent',
  percent: 20,
  maxDiscountRials: 500_000,
  amountRials: null,
  minOrderRials: 3_000_000,
  validFrom: MEHR_25,
  validUntil: MEHR_31,
  totalLimit: 100,
  perCustomerLimit: 1,
  enabled: true,
  note: 'کمپین مهر',
  createdBy: 'admin-1',
  createdAt: new Date('2026-10-15T08:00:00Z'),
  updatedAt: new Date('2026-10-15T08:00:00Z'),
};

/** فرم HTML همان‌طور که مرورگر می‌فرستد: تیک روشن «1»، خاموش هیچ. */
const entriesOf = (values: DiscountForm): [string, string][] =>
  Object.entries(values).flatMap(([key, value]): [string, string][] =>
    key === 'enabled' ? (value ? [['enabled', '1']] : []) : [[key, String(value)]],
  );

describe('فرم کد تخفیف (۱۱٫۴)', () => {
  it('فیلدهای HTML: تیک نیامده خاموش، کلید ناشناس نه، متن کوتاه‌شده', () => {
    const read = discountFormOf([
      ['discount', 'x'.repeat(500)],
      ['kind', 'fixed'],
      ['evil', 'y'],
      ['note', 'n'.repeat(5000)],
    ]);
    expect(read.discount).toHaveLength(100);
    expect(read.note).toHaveLength(1000);
    expect(read.kind).toBe('fixed');
    expect(read.enabled).toBe(false);
    expect(read).not.toHaveProperty('evil');
    expect(discountFormOf([['enabled', '1']]).enabled).toBe(true);
  });

  it('«کد تازه»: کد یکدست، تومان به ریال، روز اول شامل و روز آخر تا نیمه‌شب پس از آن، یادداشت یکدست', () => {
    const checked = readDiscountForm(form(), true);
    expect(checked).toEqual({
      ok: true,
      code: 'MEHR1405',
      terms: {
        kind: 'percent',
        percent: 20,
        maxDiscountRials: 500_000,
        amountRials: null,
        minOrderRials: 3_000_000,
        validFrom: MEHR_25,
        validUntil: MEHR_31,
        totalLimit: 100,
        perCustomerLimit: 1,
        enabled: true,
        note: 'کمپین مهر',
      },
    });
  });

  it('کد با صفحه‌کلید فارسی همان کد لاتین است', () => {
    const checked = readDiscountForm(form({ discount: 'صثمزخپث' }), true);
    expect(checked.ok && checked.code).toBe('WELCOME');
  });

  it('مبلغ ثابت بی درصد و سقف؛ اختیاری‌های خالی هیچ', () => {
    const checked = readDiscountForm(
      form({ kind: 'fixed', percent: '30', max: '9', amount: '۲۰٬۰۰۰', minOrder: '', from: '', until: '', total: '', note: '' }),
      true,
    );
    expect(checked.ok && checked.terms).toEqual({
      kind: 'fixed',
      percent: null,
      maxDiscountRials: null,
      amountRials: 200_000,
      minOrderRials: 0,
      validFrom: null,
      validUntil: null,
      totalLimit: null,
      perCustomerLimit: 1,
      enabled: true,
      note: null,
    });
  });

  it('ویرایش متن کد را نمی‌خواند', () => {
    const checked = readDiscountForm(form({ discount: '!' }), false);
    expect(checked.ok && checked.code).toBeNull();
  });

  it.each([
    [{ discount: 'ab' }, 'discount', 'discount_code_invalid'],
    [{ discount: 'کد!' }, 'discount', 'discount_code_invalid'],
    [{ kind: '' }, 'kind', 'discount_kind'],
    [{ percent: '0' }, 'percent', 'discount_percent'],
    [{ percent: '101' }, 'percent', 'discount_percent'],
    [{ percent: '12.5' }, 'percent', 'discount_percent'],
    [{ max: '0' }, 'max', 'discount_max'],
    [{ max: 'بی سقف' }, 'max', 'discount_max'],
    [{ kind: 'fixed', amount: '' }, 'amount', 'discount_amount'],
    [{ kind: 'fixed', amount: '100000001' }, 'amount', 'discount_amount'],
    [{ minOrder: '-1' }, 'minOrder', 'discount_min_order'],
    [{ from: '1405/13/01' }, 'from', 'discount_from'],
    [{ until: 'فردا' }, 'until', 'discount_until'],
    [{ from: '1405/07/30', until: '1405/07/25' }, 'until', 'day_order'],
    [{ total: '0' }, 'total', 'discount_total_limit'],
    [{ perCustomer: '' }, 'perCustomer', 'discount_per_customer'],
    [{ perCustomer: '0' }, 'perCustomer', 'discount_per_customer'],
    [{ note: 'ی'.repeat(201) }, 'note', 'discount_note'],
  ] as const)('خطای %o زیر %s', (over, field, error) => {
    expect(readDiscountForm(form(over), true)).toEqual({ ok: false, field, error });
  });

  it('روز اول و آخر یکی: همان یک روز', () => {
    const checked = readDiscountForm(form({ from: '1405/07/25', until: '1405/07/25' }), true);
    expect(checked.ok && checked.terms.validUntil).toEqual(new Date('2026-10-17T20:30:00Z'));
  });
});

describe('رفت‌وبرگشت ردیف و فرم، و «فقط خاموش شد» (۱۱٫۴، سؤال ۳۰۲)', () => {
  it('فرم ساخته از ردیف، بی تغییر، همان شرط‌های ردیف است', () => {
    const back = readDiscountForm(discountFormOf(entriesOf(discountFormFrom(ROW))), false);
    expect(back.ok && back.terms).toEqual(termsOfRow(ROW));
  });

  it('مبلغ ثابت بی حداقل و بی روز هم', () => {
    const fixed: DiscountCodeRow = {
      ...ROW,
      kind: 'fixed',
      percent: null,
      maxDiscountRials: null,
      amountRials: 150_000,
      minOrderRials: 0,
      validFrom: null,
      validUntil: null,
      totalLimit: null,
      note: null,
    };
    const back = readDiscountForm(discountFormOf(entriesOf(discountFormFrom(fixed))), false);
    expect(back.ok && back.terms).toEqual(termsOfRow(fixed));
  });

  it('فقط تیک «روشن» برداشته شد: خاموش کردن تنها', () => {
    const back = readDiscountForm(discountFormOf(entriesOf({ ...discountFormFrom(ROW), enabled: false })), false);
    expect(back.ok && onlyDisables(termsOfRow(ROW), back.terms)).toBe(true);
  });

  it('روشن کردن، یا خاموش کردن با تغییر دیگر، خاموش کردن تنها نیست', () => {
    const terms = termsOfRow(ROW);
    expect(onlyDisables({ ...terms, enabled: false }, terms)).toBe(false);
    expect(onlyDisables(terms, { ...terms, enabled: false, note: 'دیگر' })).toBe(false);
    expect(onlyDisables(terms, { ...terms, enabled: false, validUntil: new Date(MEHR_31.getTime() + 86_400_000) })).toBe(false);
    expect(onlyDisables(terms, terms)).toBe(false);
  });
});

describe('متن فهرست کدها (۱۱٫۴)', () => {
  it('تخفیف: درصد با سقف و حداقل، درصد بی سقف، مبلغ ثابت', () => {
    expect(discountTermsText(ROW)).toEqual([
      { num: '20' },
      '٪',
      ' تا ',
      { num: '50,000' },
      ' تومان',
      '، از سفارش ',
      { num: '300,000' },
      ' تومان',
    ]);
    expect(discountTermsText({ ...ROW, maxDiscountRials: null, minOrderRials: 0 })).toEqual([{ num: '20' }, '٪']);
    expect(discountTermsText({ ...ROW, kind: 'fixed', percent: null, maxDiscountRials: null, amountRials: 200_000, minOrderRials: 0 })).toEqual([
      { num: '20,000' },
      ' تومان',
    ]);
  });

  it('روزها: دو سر، فقط پایان، فقط آغاز، همیشه؛ روز آخر خودش، نه نیمه‌شب پس از آن', () => {
    expect(discountWindowText(ROW)).toEqual(['از ', 'شنبه 25 مهر', ' تا ', 'پنجشنبه 30 مهر']);
    expect(discountWindowText({ validFrom: null, validUntil: MEHR_31 })).toEqual(['تا ', 'پنجشنبه 30 مهر']);
    expect(discountWindowText({ validFrom: MEHR_25, validUntil: null })).toEqual(['از ', 'شنبه 25 مهر']);
    expect(discountWindowText({ validFrom: null, validUntil: null })).toEqual(['همیشه']);
  });

  it('استفاده: با سقف کل و بی آن، و رزروهای زنده', () => {
    expect(discountUseText({ used: 12, reserved: 0, totalLimit: 100 })).toEqual([{ num: '12' }, ' از ', { num: '100' }]);
    expect(discountUseText({ used: 3, reserved: 1, totalLimit: null })).toEqual([{ num: '3' }, '، و ', { num: '1' }, ' در انتظار پرداخت']);
  });

  it('حال همین لحظه: خاموش، هنوز نه، تمام، پر، روشن', () => {
    const view = { ...ROW, used: 0 };
    const inside = new Date('2026-10-18T10:00:00Z');
    expect(discountState({ ...view, enabled: false }, inside)).toBe('off');
    expect(discountState(view, new Date(MEHR_25.getTime() - 1))).toBe('soon');
    expect(discountState(view, MEHR_25)).toBe('on');
    expect(discountState(view, new Date(MEHR_31.getTime() - 1))).toBe('on');
    expect(discountState(view, MEHR_31)).toBe('ended');
    expect(discountState({ ...view, used: 100 }, inside)).toBe('full');
    expect(discountState({ ...view, used: 99 }, inside)).toBe('on');
  });
});
