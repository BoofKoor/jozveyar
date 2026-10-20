/**
 * موجودی کاغذ در پنل (برش ۱۰٫۴): خواندن فرم‌ها (ارقام فارسی و جداکننده، مرزها، دلیل لازم) و متن‌های نمایش (منفی، حال قلم، دلیل هشدار).
 */

import { describe, expect, it } from 'vitest';

import {
  alertReason,
  deltaText,
  itemLabel,
  paperOption,
  readMoveForm,
  readSheets,
  readThresholdForm,
  readTrackForm,
  sheetsNumber,
  stockState,
} from './inventory';

describe('خواندن فرم‌های موجودی', () => {
  it('شمار برگ با ارقام فارسی و جداکننده؛ صفر فقط برای شمارش؛ تا ده میلیون', () => {
    expect(readSheets('۱٬۲۰۰', { zero: false })).toBe(1_200);
    expect(readSheets(' 2,500 ', { zero: false })).toBe(2_500);
    expect(readSheets('3 000', { zero: false })).toBe(3_000);
    expect(readSheets('0', { zero: false })).toBeNull();
    expect(readSheets('0', { zero: true })).toBe(0);
    expect(readSheets('10000000', { zero: false })).toBe(10_000_000);
    expect(readSheets('10000001', { zero: true })).toBeNull();
    expect(readSheets('-5', { zero: true })).toBeNull();
    expect(readSheets('1.5', { zero: true })).toBeNull();
    expect(readSheets('', { zero: true })).toBeNull();
    expect(readSheets(42, { zero: true })).toBeNull();
  });

  it('«ثبت»: ورود بی یادداشت، ضایعات و شمارش با دلیل، شمارش صفر، و اولین خطا با جایش', () => {
    expect(readMoveForm({ kind: 'purchase', sheets: '۵۰۰', note: '' })).toEqual({ ok: true, value: { kind: 'purchase', sheets: 500, note: null } });
    expect(readMoveForm({ kind: 'purchase', sheets: '500', note: '  خرید از پخش صبا ' })).toEqual({
      ok: true,
      value: { kind: 'purchase', sheets: 500, note: 'خرید از پخش صبا' },
    });
    expect(readMoveForm({ kind: 'waste', sheets: '40', note: '' })).toEqual({ ok: false, field: 'note', error: 'stock_note_required' });
    expect(readMoveForm({ kind: 'waste', sheets: '40', note: 'گير كردن' })).toEqual({ ok: true, value: { kind: 'waste', sheets: 40, note: 'گیر کردن' } });
    expect(readMoveForm({ kind: 'count', sheets: '0', note: 'تمام شد' })).toEqual({ ok: true, value: { kind: 'count', sheets: 0, note: 'تمام شد' } });
    expect(readMoveForm({ kind: 'count', sheets: '1200', note: '' })).toEqual({ ok: false, field: 'note', error: 'stock_note_required' });
    expect(readMoveForm({ kind: 'count', sheets: 'x', note: 'شمارش' })).toEqual({ ok: false, field: 'sheets', error: 'stock_count_invalid' });
    expect(readMoveForm({ kind: 'waste', sheets: '0', note: 'دلیل' })).toEqual({ ok: false, field: 'sheets', error: 'stock_sheets_invalid' });
    expect(readMoveForm({ kind: 'print', sheets: '10', note: '' })).toEqual({ ok: false, field: 'kind', error: 'stock_kind_invalid' });
    expect(readMoveForm({ kind: 'purchase', sheets: '10', note: 'ی'.repeat(301) })).toEqual({ ok: false, field: 'note', error: 'stock_note_too_long' });
    expect(readMoveForm({ kind: 'purchase', sheets: '10', note: 'ی'.repeat(300) }).ok).toBe(true);
  });

  it('«کاغذ تازه»: کاغذ و اندازه از فهرست، شمارش اول صفر هم، و آستانهٔ اختیاری', () => {
    expect(paperOption('tahrir80', 'a4')).toBe('tahrir80:a4');
    expect(readTrackForm({ paper: 'tahrir80:a4', counted: '۲۵۰۰', threshold: '' })).toEqual({
      ok: true,
      value: { paperTypeId: 'tahrir80', paperSize: 'a4', countedSheets: 2_500, thresholdSheets: null },
    });
    expect(readTrackForm({ paper: 'glossy:a5', counted: '0', threshold: '1,000' })).toEqual({
      ok: true,
      value: { paperTypeId: 'glossy', paperSize: 'a5', countedSheets: 0, thresholdSheets: 1_000 },
    });
    expect(readTrackForm({ paper: 'tahrir80:b5', counted: '1', threshold: '' })).toEqual({ ok: false, field: 'paper', error: 'stock_paper_invalid' });
    expect(readTrackForm({ paper: 'Tahrir:a4', counted: '1', threshold: '' })).toEqual({ ok: false, field: 'paper', error: 'stock_paper_invalid' });
    expect(readTrackForm({ paper: 'tahrir80:a4', counted: '', threshold: '' })).toEqual({ ok: false, field: 'counted', error: 'stock_count_invalid' });
    expect(readTrackForm({ paper: 'tahrir80:a4', counted: '1', threshold: '-1' })).toEqual({ ok: false, field: 'threshold', error: 'stock_threshold_invalid' });
  });

  it('آستانه: خالی یعنی بی آستانه، صفر هم، و نادرست با جایش', () => {
    expect(readThresholdForm({ threshold: '  ' })).toEqual({ ok: true, value: null });
    expect(readThresholdForm({ threshold: '۰' })).toEqual({ ok: true, value: 0 });
    expect(readThresholdForm({ threshold: '1٬000' })).toEqual({ ok: true, value: 1_000 });
    expect(readThresholdForm({ threshold: 'یک' })).toEqual({ ok: false, field: 'threshold', error: 'stock_threshold_invalid' });
  });
});

describe('نمایش موجودی', () => {
  const item = (balanceSheets: number, thresholdSheets: number | null, queuedSheets = 0) => ({
    balanceSheets,
    thresholdSheets,
    queued: { orders: queuedSheets > 0 ? 1 : 0, sheets: queuedSheets },
  });

  it('عدد با منهای واقعی، و تغییر با نشانه', () => {
    expect(sheetsNumber(1_200)).toBe('1,200');
    expect(sheetsNumber(-120)).toBe('−120');
    expect(deltaText(500)).toBe('+500');
    expect(deltaText(-40)).toBe('−40');
    expect(deltaText(0)).toBe('0');
    expect(itemLabel({ paperName: 'تحریر ۸۰ گرم', paperTypeId: 'tahrir80', paperSize: 'a4' })).toBe('تحریر ۸۰ گرم A4');
    expect(itemLabel({ paperName: null, paperTypeId: 'old_paper', paperSize: 'a3' })).toBe('old_paper A3');
  });

  it('حال قلم: منفی، کمتر از نیاز صف، زیر آستانه، کافی؛ صف خالی هرگز «کمتر از نیاز صف»', () => {
    expect(stockState(item(-10, null))).toEqual({ tone: 'error', text: 'کمتر از صفر' });
    expect(stockState(item(40, 100, 46))).toEqual({ tone: 'error', text: 'کمتر از نیاز صف' });
    expect(stockState(item(40, 100))).toEqual({ tone: 'warning', text: 'زیر آستانه' });
    expect(stockState(item(100, 100))).toEqual({ tone: 'ok', text: 'کافی' });
    expect(stockState(item(0, null))).toEqual({ tone: 'ok', text: 'کافی' });
    expect(stockState(item(46, null, 46))).toEqual({ tone: 'ok', text: 'کافی' });
  });

  it('دلیل هشدار: منفی، بعد کمتر از نیاز صف، بعد زیر آستانه', () => {
    expect(alertReason({ negative: true, belowThreshold: true, shortForQueue: true })).toBe('negative');
    expect(alertReason({ negative: false, belowThreshold: true, shortForQueue: true })).toBe('short');
    expect(alertReason({ negative: false, belowThreshold: true, shortForQueue: false })).toBe('low');
  });
});
