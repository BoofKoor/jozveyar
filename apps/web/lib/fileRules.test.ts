/**
 * قاعده‌های فایل (برش ۸٫۴، سؤال ۱۹۰): `accept` ورودی، فهرست فرمت‌ها، و متن هر رد با عدد خود فایل و سقف همین لحظه (طرح میز، سؤال ۲۲۳).
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_FILE_RULES, type FileRules } from '@jozveyar/contracts/files';

import {
  REFUSED_CODES,
  acceptOf,
  acceptedExtensions,
  formatNames,
  isRuleError,
  megabytes,
  ruleErrorText,
  unsupportedHint,
} from './fileRules';

const ALL = DEFAULT_FILE_RULES.formats;
const PDF_ONLY: FileRules['formats'] = { word: false, slides: false, image: false };
const MiB = 1024 * 1024;

describe('فرمت‌های پذیرفته', () => {
  it('همه روشن: همان `accept` پیش از ۸٫۴، بایت‌به‌بایت', () => {
    expect(acceptOf(ALL)).toBe('.pdf,.docx,.doc,.pptx,.ppt,.jpg,.jpeg,.png,.webp,.heic');
  });

  it('هر خانواده پسوندهای خودش؛ PDF همیشه', () => {
    expect(acceptedExtensions({ word: true, slides: false, image: false })).toEqual(['pdf', 'docx', 'doc']);
    expect(acceptedExtensions({ word: false, slides: true, image: false })).toEqual(['pdf', 'pptx', 'ppt']);
    expect(acceptedExtensions({ word: false, slides: false, image: true })).toEqual(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic']);
    expect(acceptOf(PDF_ONLY)).toBe('.pdf');
  });

  it('فهرست سؤال‌ها و راهنمای فایل ناشناس فقط آنچه روشن است', () => {
    expect(formatNames(ALL)).toBe('PDF، Word، پاورپوینت و عکس');
    expect(formatNames({ word: true, slides: false, image: true })).toBe('PDF، Word و عکس');
    expect(formatNames({ word: false, slides: true, image: false })).toBe('PDF و پاورپوینت');
    expect(formatNames(PDF_ONLY)).toBe('فقط PDF');
    expect(unsupportedHint(ALL)).toBe(
      'PDF، Word، پاورپوینت یا عکس (JPG، PNG، WebP، HEIC) بینداز. اگر جزوه با برنامهٔ دیگری ساخته شده، از همان برنامه خروجی PDF بگیر.',
    );
    expect(unsupportedHint(PDF_ONLY)).toBe('PDF بینداز. اگر جزوه با برنامهٔ دیگری ساخته شده، از همان برنامه خروجی PDF بگیر.');
  });
});

describe('متن هر رد', () => {
  const rules: FileRules = { formats: { word: false, slides: false, image: true }, maxMb: 200, maxPages: 600 };

  it('خانوادهٔ خاموش: نام همان خانواده و راه جلو', () => {
    expect(ruleErrorText('format_off', { kind: 'word', size: 1, pageCount: 0 }, rules)).toEqual({
      title: 'فایل Word فعلاً پذیرفته نمی‌شود',
      hint: 'از Word خروجی PDF بگیر و همان را جایش بینداز.',
    });
    expect(ruleErrorText('format_off', { kind: 'slides', size: 1, pageCount: 0 }, rules).title).toBe(
      'فایل پاورپوینت فعلاً پذیرفته نمی‌شود',
    );
    expect(ruleErrorText('format_off', { kind: 'image', size: 1, pageCount: 0 }, rules)).toEqual({
      title: 'عکس فعلاً پذیرفته نمی‌شود',
      hint: 'عکس‌ها را در یک فایل PDF بگذار و همان را جایش بینداز.',
    });
  });

  it('حجم و صفحه با عدد خود فایل و سقف همین لحظه، رقم لاتین با جداکننده', () => {
    expect(ruleErrorText('too_large', { kind: 'pdf', size: 1_288 * MiB, pageCount: 0 }, { ...rules, maxMb: 1_024 })).toEqual({
      title: 'هر فایل تا 1,024 مگابایت پذیرفته می‌شود',
      hint: 'این فایل 1,288 مگابایت است. با کیفیت کمتر ذخیره‌اش کن، یا دو تکه‌اش کن و هر دو را بینداز؛ با هم یک جزوه می‌شوند.',
    });
    expect(ruleErrorText('too_many_pages', { kind: 'pdf', size: 1, pageCount: 1_240 }, rules)).toEqual({
      title: 'هر فایل تا 600 صفحه پذیرفته می‌شود',
      hint: 'این فایل 1,240 صفحه است. دو تکه‌اش کن و هر دو را بینداز؛ با هم یک جزوه می‌شوند.',
    });
  });

  it('مگابایت گرد به بالا: یک بایت بیش از سقف هرگز «همان سقف» نیست', () => {
    expect(megabytes(200 * MiB)).toBe(200);
    expect(megabytes(200 * MiB + 1)).toBe(201);
  });

  it('«پذیرفته نشد» فقط برای قاعده‌ها و نوع ناشناس، نه فایل خراب', () => {
    expect([...REFUSED_CODES].sort()).toEqual(['format_off', 'too_large', 'too_many_pages', 'unsupported_type']);
    expect(isRuleError('too_many_pages')).toBe(true);
    expect(isRuleError('unsupported_type')).toBe(false);
    expect(isRuleError('corrupt_file')).toBe(false);
  });
});
