/**
 * قاعده‌های فایل صفحهٔ اصلی (برش ۸٫۴): در build و بی پایگاه داده پیش‌فرض‌ها؛ با پایگاه داده همان تنظیم‌هایی که سرور آپلود و مسیر
 * خرید با آن می‌سنجند؛ مقدار خراب پیش‌فرض با لاگ، و خطای پایگاه داده بالا می‌رود تا ISR صفحهٔ قبلی را نگه دارد.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@jozveyar/db';

import { DEFAULT_SITE_FILES, loadFiles, siteFiles } from './fileRules';

const DB = 'postgresql://jozveyar@127.0.0.1:5432/jozveyar';

function source(settings: Record<string, unknown> = {}, failure?: Error) {
  return vi.fn(async (key: string) => {
    if (failure) throw failure;
    return settings[key];
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('قاعده‌های فایل صفحهٔ اصلی', () => {
  it('پیش‌فرض‌ها همان پیش‌فرض‌های سرور: همهٔ خانواده‌ها، ۱٬۵۳۶ مگابایت، ۱٬۵۰۰ صفحه، ۲ روز', () => {
    expect(DEFAULT_SITE_FILES).toEqual({
      rules: {
        formats: DEFAULT_SETTINGS['file.formats'],
        maxMb: DEFAULT_SETTINGS['file.max_mb'],
        maxPages: DEFAULT_SETTINGS['file.max_pages'],
      },
      uploadDays: 2,
    });
    expect(DEFAULT_SITE_FILES.rules).toEqual({ formats: { word: true, slides: true, image: true }, maxMb: 1536, maxPages: 1500 });
  });

  it('در build، حتی با DATABASE_URL، و بی DATABASE_URL: پیش‌فرض‌ها بی سراغ پایگاه داده', async () => {
    const read = source({ 'file.max_mb': 10 });
    expect(await siteFiles({ NEXT_PHASE: 'phase-production-build', DATABASE_URL: DB }, () => read)).toBe(DEFAULT_SITE_FILES);
    expect(await siteFiles({}, () => read)).toBe(DEFAULT_SITE_FILES);
    expect(read).not.toHaveBeenCalled();
  });

  it('با پایگاه داده: هر چهار از settings؛ روزهای آپلود گرد به بالا مثل قاعدهٔ باکت', async () => {
    const read = source({
      'file.formats': { word: false, slides: true, image: false },
      'file.max_mb': 200,
      'file.max_pages': 600,
      'file.retention_days': 1.5,
    });
    expect(await siteFiles({ DATABASE_URL: DB }, () => read)).toEqual({
      rules: { formats: { word: false, slides: true, image: false }, maxMb: 200, maxPages: 600 },
      uploadDays: 2,
    });
  });

  it('مقدار خراب: پیش‌فرض همان کلید، با لاگ نامش؛ بقیه همان', async () => {
    const logs: string[] = [];
    const read = source({ 'file.formats': { word: 'نه' }, 'file.max_mb': 2000, 'file.max_pages': 0, 'file.retention_days': 3 });
    expect(await loadFiles(read, (message) => logs.push(message))).toEqual({ ...DEFAULT_SITE_FILES, uploadDays: 3 });
    expect(logs.map((line) => /file\.\w+/.exec(line)?.[0])).toEqual(['file.formats', 'file.max_mb', 'file.max_pages']);
  });

  it('خطای پایگاه داده بالا می‌رود (ISR صفحهٔ قبلی را نگه می‌دارد)، با لاگ', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(siteFiles({ DATABASE_URL: DB }, () => source({}, new Error('down')))).rejects.toThrow('down');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('قاعده‌های فایل'), expect.any(Error));
  });
});
