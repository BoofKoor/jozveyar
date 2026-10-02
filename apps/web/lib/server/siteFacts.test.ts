/**
 * واقعیت‌های صفحه‌های ثابت (برش ۷٫۴): در build و بی پایگاه داده پیش‌فرض‌ها؛ با پایگاه داده همان تنظیم‌هایی که سایت (آپلود)،
 * کارگر (نگهداری فایل‌های سفارش) و مسیر خرید (روز کاری) با آن کار می‌کنند؛ خطای پایگاه داده بالا می‌رود تا ISR صفحهٔ قبلی را
 * نگه دارد. پایگاه داده ساختگی است؛ خود `settingsChangedAt` در تست یکپارچگی `packages/db`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@jozveyar/db';

import { DEFAULT_FACTS, FACT_SETTINGS, loadFacts, siteFacts } from './siteFacts';
import { DEFAULT_RETENTION_DAYS } from './uploads';

const DB = 'postgresql://jozveyar@127.0.0.1:5432/jozveyar';
const CHANGED = new Date('2026-10-20T09:30:00Z');

function source(settings: Record<string, unknown> = {}, changedAt: Date | null | Error = null) {
  return {
    setting: vi.fn(async (key: string) => settings[key]),
    changedAt: vi.fn(async (keys: readonly string[]) => {
      if (changedAt instanceof Error) throw changedAt;
      return keys.some((key) => key in settings) ? changedAt : null;
    }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('واقعیت‌های صفحه‌های ثابت', () => {
  it('پیش‌فرض‌ها همان پیش‌فرض‌های سایت و کارگرند: ۲ روز کاری، ۲ روز آپلود، ۳۰ روز فایل‌های سفارش', () => {
    expect(DEFAULT_FACTS).toEqual({
      slaDays: DEFAULT_SETTINGS['order.sla_days'],
      uploadDays: DEFAULT_RETENTION_DAYS,
      orderFilesDays: DEFAULT_SETTINGS['order.files_retention_days'],
      changedAt: null,
    });
    expect([DEFAULT_FACTS.slaDays, DEFAULT_FACTS.uploadDays, DEFAULT_FACTS.orderFilesDays]).toEqual([2, 2, 30]);
  });

  it('در build، حتی با DATABASE_URL، پیش‌فرض‌ها، بی سراغ پایگاه داده', async () => {
    const db = source({ 'order.sla_days': 3 });
    expect(await siteFacts({ NEXT_PHASE: 'phase-production-build', DATABASE_URL: DB }, () => db)).toBe(DEFAULT_FACTS);
    expect(db.setting).not.toHaveBeenCalled();
    expect(db.changedAt).not.toHaveBeenCalled();
  });

  it('بی DATABASE_URL (سرتاسری بی سرویس) پیش‌فرض‌ها', async () => {
    const db = source();
    expect(await siteFacts({}, () => db)).toBe(DEFAULT_FACTS);
    expect(await siteFacts({ DATABASE_URL: '' }, () => db)).toBe(DEFAULT_FACTS);
    expect(db.setting).not.toHaveBeenCalled();
  });

  it('با پایگاه داده: هر سه عدد از settings، و آخرین تغییر همان سه کلید', async () => {
    const db = source({ 'order.sla_days': 3, 'order.files_retention_days': 60, 'file.retention_days': 4 }, CHANGED);
    expect(await siteFacts({ DATABASE_URL: DB, NEXT_PHASE: 'phase-production-server' }, () => db)).toEqual({
      slaDays: 3,
      uploadDays: 4,
      orderFilesDays: 60,
      changedAt: CHANGED,
    });
    expect(FACT_SETTINGS).toEqual(['order.sla_days', 'order.files_retention_days', 'file.retention_days']);
    expect(db.changedAt).toHaveBeenCalledWith(FACT_SETTINGS);
  });

  it('تنظیم نبود: پیش‌فرض؛ خراب: همان پیش‌فرض، و روز کاری و نگهداری بلند در لاگ (readSetting)', async () => {
    expect(await loadFacts(source())).toEqual(DEFAULT_FACTS);
    for (const [key, broken] of [
      ['order.sla_days', 0],
      ['order.sla_days', '3'],
      ['order.files_retention_days', 6],
      ['order.files_retention_days', 366],
    ] as const) {
      const log = vi.fn();
      const facts = await loadFacts(source({ [key]: broken }), log);
      expect([facts.slaDays, facts.orderFilesDays], `${key}=${broken}`).toEqual([2, 30]);
      expect(log).toHaveBeenCalledWith(expect.stringContaining(key), expect.anything());
    }
  });

  it('روز آپلود همان قاعدهٔ uploads.ts است، گرد به بالا مثل قاعدهٔ سنی باکت', async () => {
    for (const [value, days] of [
      [1.5, 2],
      [3, 3],
      [0, 2],
      [-1, 2],
      ['5', 2],
      [Number.POSITIVE_INFINITY, 2],
    ] as const) {
      expect((await loadFacts(source({ 'file.retention_days': value }))).uploadDays, String(value)).toBe(days);
    }
  });

  it('خطای پایگاه داده بالا می‌رود، بلند در لاگ؛ پیش‌فرض‌ها نه', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const down = new Error('connect ECONNREFUSED 127.0.0.1:5432');
    await expect(siteFacts({ DATABASE_URL: DB }, () => source({ 'order.sla_days': 3 }, down))).rejects.toBe(down);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('صفحه‌های ثابت'), down);
  });
});
