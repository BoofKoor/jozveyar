/**
 * نوشته‌های صفحه‌های «محتوای سایت» (`content.ts`، برش ۱۱٫۱): حال هر متن در فهرست، پیام هر خطای سنجش با خط و راه درست کردن (طرح «خطای متن»،
 * سؤال ۲۸۴)، زیرعنوان ویرایشگر، صفحهٔ انتشار و «نسخه‌ها». «حالا» همان دوشنبه 13 مهر 1405، ساعت 11:20 تهران طرح است.
 */

import { describe, expect, it } from 'vitest';

import type { ContentIssue } from '@jozveyar/content';
import type { ContentDraftRow, ContentVersionRow } from '@jozveyar/db';

import {
  countText,
  doneText,
  editorSub,
  fieldError,
  issueLine,
  issueMessage,
  issuesTitle,
  keepNote,
  kindUrl,
  linesSummary,
  previewBlocked,
  previewMeta,
  publishEffect,
  publishLabel,
  publishLead,
  publishTitle,
  scopeText,
  stateText,
  unchangedText,
  versionMeta,
  versionName,
} from './content';

const NOW = new Date('2026-10-05T07:50:00Z');
/** چهارشنبه 8 مهر 14:10 تهران. */
const OCT_08 = new Date('2026-09-30T10:40:00Z');
/** امروز 11:05 تهران. */
const TODAY_1105 = new Date('2026-10-05T07:35:00Z');

const version = (n: number, over: Partial<ContentVersionRow> = {}): ContentVersionRow => ({
  id: n,
  kind: 'terms',
  version: n,
  content: { title: 'قوانین' },
  restoredFrom: null,
  createdBy: 'admin-1',
  createdByName: 'سارا',
  createdAt: OCT_08,
  ...over,
});
const DRAFT: ContentDraftRow = {
  kind: 'terms',
  content: {},
  baseVersion: 2,
  updatedBy: 'admin-1',
  updatedByName: 'سارا',
  createdAt: TODAY_1105,
  updatedAt: new Date('2026-10-05T07:48:00Z'),
};
const issue = (over: Partial<ContentIssue> & Pick<ContentIssue, 'code'>): ContentIssue => ({ field: 'body', label: 'متن صفحه', ...over });

describe('فهرست «متن‌های سایت»', () => {
  it('آنچه هر متن پوشش می‌دهد، و نشانی صفحه', () => {
    expect(scopeText('home', 0)).toEqual(['قهرمان، سه نوید زیر کارت بارگذاری و «سه قدم»']);
    expect(scopeText('faq', 6)).toEqual([{ num: '6' }, ' سؤال، در صفحهٔ اصلی و گوگل']);
    expect(scopeText('terms', 0)).toEqual([{ ltr: '/terms' }]);
    expect(scopeText('contact', 0)).toEqual(['راه‌های تماس و نشانی، و دو جملهٔ پاورقی']);
    expect([kindUrl('home'), kindUrl('terms'), kindUrl('contact')]).toEqual(['jozveyar.com', 'jozveyar.com/terms', 'jozveyar.com/contact']);
  });

  it('حال متن: پیش‌فرض، منتشرشده، برگشت به پیش‌فرض، و با پیش‌نویس (طرح)', () => {
    expect(stateText(null, null, NOW)).toEqual(['متن پیش‌فرض سایت']);
    expect(stateText(version(1), null, NOW)).toEqual(['منتشرشده چهارشنبه 8 مهر، سارا']);
    expect(stateText(version(3, { content: null, restoredFrom: 0, createdAt: TODAY_1105 }), null, NOW)).toEqual(['متن پیش‌فرض سایت، از امروز، سارا']);
    expect(stateText(version(2), DRAFT, NOW)).toEqual(['روی سایت نسخهٔ ', { num: '2' }, '، چهارشنبه 8 مهر', '؛ پیش‌نویس منتشرنشده از امروز 11:05']);
    expect(stateText(null, DRAFT, NOW)).toEqual(['متن پیش‌فرض سایت', '؛ پیش‌نویس منتشرنشده از امروز 11:05']);
  });
});

describe('خطای متن (سؤال ۲۸۴)', () => {
  it('پیوند بیرونی با راه تلگرام، جای‌نگهدار ناشناس با پیشنهاد، و HTML با پررنگ Markdown (همان سه خطای طرح)', () => {
    expect(issueLine(issue({ code: 'link_external', line: 10, excerpt: 'کد رهگیری پست…', detail: 'https://t.me/jozveyar' }))).toEqual([
      'خط ',
      { num: '10' },
      ' («کد رهگیری پست…»): ',
      'پیوند فقط به همین سایت، ',
      { ltr: 'tel:' },
      ' یا ',
      { ltr: 'mailto:' },
      ' می‌رود؛ ',
      { ltr: 'https://t.me/jozveyar' },
      ' سایت دیگری است.',
      ' تلگرام و اینستاگرام را در «تماس و پاورقی» بگذار؛ سایت پیوندشان را خودش می‌سازد.',
    ]);
    expect(issueMessage(issue({ code: 'link_external', detail: 'https://example.com' })).at(-1)).toBe(' سایت دیگری است.');
    expect(issueLine(issue({ code: 'placeholder_unknown', line: 15, excerpt: 'فایلی که می‌اندازی…', detail: 'روزهای_نگهداری', suggestion: 'روزهای_فایل' }))).toEqual([
      'خط ',
      { num: '15' },
      ' («فایلی که می‌اندازی…»): ',
      'جای‌نگهداری به نام ',
      { ph: '{روزهای_نگهداری}' },
      ' نیست.',
      ' منظورت ',
      { ph: '{روزهای_فایل}' },
      ' بود؟',
    ]);
    expect(issueMessage(issue({ code: 'placeholder_unknown', detail: 'هیچ' })).at(-1)).toBe(' فهرست جای‌نگهدارها زیر متن است.');
    expect(issueMessage(issue({ code: 'html', detail: '<b>', suggestion: '**مبلغ کاملش**' }))).toEqual([
      'HTML پذیرفته نمی‌شود (',
      { ltr: '<b>' },
      ').',
      ' برای پررنگ، دو ستاره دو طرف متن بگذار: ',
      { ph: '**مبلغ کاملش**' },
      '.',
    ]);
    expect(issueMessage(issue({ code: 'html', detail: '<div>' })).at(-1)).toBe(' همان متن را بی تگ بنویس.');
  });

  it('خطای فیلد بی خط با نام فیلد؛ سقف با شمار امروز', () => {
    expect(issueLine(issue({ field: 'seo.title', label: 'عنوان گوگل', code: 'too_long', max: 60, length: 1234 }))).toEqual([
      'عنوان گوگل: ',
      { num: '1,234' },
      ' نویسه است؛ دست‌بالا ',
      { num: '60' },
      '.',
    ]);
    expect(issueLine(issue({ field: 'title', label: 'تیتر صفحه', code: 'required' }))).toEqual(['تیتر صفحه: ', 'خالی است.']);
    expect(issueLine(issue({ field: 'items', label: 'سؤال‌ها', code: 'faq_empty' }))).toEqual(['سؤال‌ها: ', 'دست‌کم یک سؤال لازم است.']);
  });

  it('سرعنوان فهرست، و خلاصهٔ خط‌های مشکل‌دار زیر متن صفحه', () => {
    expect(issuesTitle(1)).toBe('پیش‌نویس ذخیره شد، ولی تا این یکی درست نشود منتشر نمی‌شود:');
    expect(issuesTitle(3)).toBe('پیش‌نویس ذخیره شد، ولی تا این 3 مورد درست نشوند منتشر نمی‌شود:');
    expect(linesSummary([18, 10, 15, 10])).toEqual([
      { num: '3' },
      ' خط مشکل دارد: ',
      { num: '10' },
      '، ',
      { num: '15' },
      ' و ',
      { num: '18' },
      '. شرح هر کدام بالای صفحه است.',
    ]);
    expect(linesSummary([7])).toEqual(['خط ', { num: '7' }, ' مشکل دارد؛ شرحش بالای صفحه است.']);
  });

  it('خطای زیر هر فیلد: پیام خطاهای خودش، و برای متن صفحه خلاصهٔ خط‌ها', () => {
    const issues = [
      issue({ code: 'too_long', max: 20_000, length: 20_001 }),
      issue({ code: 'image', line: 4, excerpt: 'x' }),
      issue({ code: 'rule', line: 9, excerpt: 'y' }),
      issue({ field: 'title', label: 'تیتر صفحه', code: 'required' }),
    ];
    expect(fieldError('body', issues)).toEqual([
      { num: '20,001' },
      ' نویسه است؛ دست‌بالا ',
      { num: '20,000' },
      '.',
      ' ',
      { num: '2' },
      ' خط مشکل دارد: ',
      { num: '4' },
      ' و ',
      { num: '9' },
      '. شرح هر کدام بالای صفحه است.',
    ]);
    expect(fieldError('title', issues)).toEqual(['خالی است.']);
    expect(fieldError('lead', issues)).toBeNull();
    expect(countText('قوانین و مقررات', 60)).toEqual([{ num: '15' }, ' از ', { num: '60' }, ' نویسه']);
  });
});

describe('ویرایشگر', () => {
  const published = { latest: version(2), isDefault: false };
  const fresh = { latest: null, isDefault: true };

  it('زیرعنوان هر متن، همان طرح', () => {
    expect(editorSub('terms', published, DRAFT, 0, NOW)).toEqual([{ ltr: 'jozveyar.com/terms' }, ' · ', 'روی سایت نسخهٔ ', { num: '2' }, '، چهارشنبه 8 مهر، سارا']);
    expect(editorSub('faq', published, null, 6, NOW)).toEqual(['روی سایت: ', { num: '6' }, ' سؤال', '، ', 'منتشرشده چهارشنبه 8 مهر، سارا']);
    expect(editorSub('home', fresh, null, 0, NOW)).toEqual([{ ltr: 'jozveyar.com' }, ' · تعرفه، کارت بارگذاری و سؤال‌ها جای دیگرند.']);
    expect(editorSub('contact', { latest: version(4, { content: null, restoredFrom: 0 }), isDefault: true }, null, 0, NOW)).toEqual([
      { ltr: 'jozveyar.com/contact' },
      '، نشانی «دربارهٔ ما» و پاورقی همهٔ صفحه‌ها',
      ' · ',
      'برگشت به متن پیش‌فرض چهارشنبه 8 مهر، سارا',
    ]);
  });

  it('سر پیش‌نمایش، و جای پیش‌نمایش وقتی پیش‌نویس خطا دارد', () => {
    expect(previewMeta(published, DRAFT, NOW)).toEqual(['پیش‌نویس، امروز 11:18']);
    expect(previewMeta(published, null, NOW)).toEqual(['روی سایت، نسخهٔ ', { num: '2' }]);
    expect(previewMeta(fresh, null, NOW)).toEqual(['متن پیش‌فرض']);
    expect(previewBlocked(3, published)).toEqual(['پیش‌نمایش پس از درست شدن ', 'این ', { num: '3' }, ' مورد', ' ساخته می‌شود. روی سایت همان ', 'نسخهٔ ', { num: '2' }, ' است.']);
    expect(previewBlocked(1, fresh)).toEqual(['پیش‌نمایش پس از درست شدن ', 'این مورد', ' ساخته می‌شود. روی سایت همان ', 'متن پیش‌فرض', ' است.']);
  });
});

describe('انتشار و نسخه‌ها', () => {
  const published = { latest: version(2), isDefault: false };

  it('تیتر، دکمه و زیرعنوان صفحهٔ انتشار برای پیش‌نویس، نسخه و متن پیش‌فرض', () => {
    expect(publishTitle('terms', { type: 'draft' })).toEqual(['انتشار قوانین']);
    expect(publishTitle('terms', { type: 'version', version: 1 })).toEqual(['برگرداندن قوانین به نسخهٔ ', { num: '1' }]);
    expect(publishTitle('faq', { type: 'default' })).toEqual(['برگرداندن سؤال‌های پرتکرار به متن پیش‌فرض']);
    expect([publishLabel({ type: 'draft' }), publishLabel({ type: 'default' })]).toEqual(['منتشر کن', 'برگردان']);

    expect(publishLead({ type: 'draft' }, published, DRAFT, null, NOW)).toEqual([
      'پیش‌نویس امروز 11:18',
      ' به جای ',
      'نسخهٔ ',
      { num: '2' },
      ' (چهارشنبه 8 مهر، سارا)',
      '.',
    ]);
    expect(publishLead({ type: 'version', version: 1 }, published, null, version(1), NOW)).toEqual([
      'متن نسخهٔ ',
      { num: '1' },
      ' (چهارشنبه 8 مهر، سارا)',
      ' به جای ',
      'نسخهٔ ',
      { num: '2' },
      ' (چهارشنبه 8 مهر، سارا)',
      '.',
    ]);
    expect(publishLead({ type: 'draft' }, { latest: null, isDefault: true }, DRAFT, null, NOW).slice(1)).toEqual([' به جای ', 'متن پیش‌فرض سایت', '.']);
  });

  it('اثر انتشار روی سایت: قوانین با «به‌روز شده در» و پیوند مرور سفارش، سؤال‌ها با دادهٔ گوگل', () => {
    expect(publishEffect('terms', '1405/07/13')).toEqual([
      'صفحهٔ «قوانین» تا یک دقیقه بعد متن تازه را دارد',
      ' و «به‌روز شده در» آن ',
      { num: '1405/07/13' },
      ' می‌شود',
      '.',
      ' مرور سفارش و صفحهٔ سفارش به همین صفحه پیوند می‌دهند.',
    ]);
    expect(publishEffect('about', '1405/07/13')).toEqual(['صفحهٔ «دربارهٔ ما» تا یک دقیقه بعد متن تازه را دارد', '.']);
    expect(publishEffect('faq', '1405/07/13')[2]).toEqual(' پاسخ‌ها بی پیوند و پررنگ در دادهٔ گوگل (');
    expect(publishEffect('contact', '1405/07/13')[0]).toBe('صفحهٔ «تماس»، نشانی «دربارهٔ ما» و پاورقی همهٔ صفحه‌ها تا یک دقیقه بعد متن تازه را دارد');
    expect(keepNote(published)).toEqual(['نسخهٔ ', { num: '2' }, ' در «نسخه‌ها» می‌ماند و از همان‌جا برمی‌گردد.']);
    expect(keepNote({ latest: null, isDefault: true })).toEqual(['متن پیش‌فرض همیشه در «نسخه‌ها» هست و از همان‌جا برمی‌گردد.']);
  });

  it('فیلدهای بی تغییر: «بقیهٔ …» اول، و بیش از پنج یک جمله', () => {
    expect(unchangedText([])).toBeNull();
    expect(unchangedText(['تیتر صفحه'])).toBe('تیتر صفحه همان است.');
    expect(unchangedText(['تیتر صفحه', 'جملهٔ آغاز', 'بقیهٔ متن صفحه', 'عنوان گوگل', 'توضیح گوگل'])).toBe(
      'بقیهٔ متن صفحه، تیتر صفحه، جملهٔ آغاز، عنوان گوگل و توضیح گوگل همان است.',
    );
    expect(unchangedText(['a', 'b', 'c', 'd', 'e', 'f'])).toBe('بقیهٔ متن همان است.');
  });

  it('نام و زمان هر نسخه، و پیام پس از انتشار', () => {
    expect(versionName(version(2))).toEqual(['نسخهٔ ', { num: '2' }]);
    expect(versionName(version(3, { restoredFrom: 1 }))).toEqual(['نسخهٔ ', { num: '3' }, ' · از نسخهٔ ', { num: '1' }]);
    expect(versionName(version(4, { content: null, restoredFrom: 0 }))).toEqual(['نسخهٔ ', { num: '4' }, ' · برگشت به متن پیش‌فرض']);
    expect(versionMeta(version(3, { createdAt: TODAY_1105 }), true, NOW)).toBe('امروز 11:05، سارا، با کد تازه');
    expect(versionMeta(version(2), false, NOW)).toBe('چهارشنبه 8 مهر 14:10، سارا');

    expect(doneText('terms', version(3))).toEqual(['نسخهٔ ', { num: '3' }, ' منتشر شد.', ' صفحهٔ «قوانین» تا یک دقیقه دیگر همین را دارد.']);
    expect(doneText('home', version(4, { restoredFrom: 1 }))).toEqual([
      'نسخهٔ ',
      { num: '1' },
      ' برگشت (نسخهٔ ',
      { num: '4' },
      ').',
      ' صفحهٔ اصلی تا یک دقیقه دیگر همین را دارد.',
    ]);
    expect(doneText('faq', version(5, { content: null, restoredFrom: 0 }))).toEqual([
      'متن پیش‌فرض برگشت (نسخهٔ ',
      { num: '5' },
      ').',
      ' سؤال‌های صفحهٔ اصلی تا یک دقیقه دیگر همین را دارد.',
    ]);
  });
});
