/**
 * قالب برگه‌ها در پنل (برش ۹٫۲، ADR-057): قالب‌های پیش‌فرض و فهرست متغیرها همان کارگرند، و تکه‌های خالص صفحه‌ها.
 *
 * قالب پیش‌فرض یا متغیر تازه: در `services/docworker/docworker/templates` عوض کن و `UPDATE_TICKET_TEMPLATES=1 pnpm test` بزن تا
 * `ticketTemplates.generated.ts` از نو ساخته شود. پنل در کانتینر خودش است و فایل‌های کارگر را ندارد، پس نسخه‌ای درون کد لازم است؛ این
 * تست جلوی جدا شدن دو نسخه را می‌گیرد.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DEFAULT_TICKET_TEMPLATES, TICKET_TEMPLATE_VARIABLES } from './ticketTemplates.generated';
import {
  activationSeen,
  previewJobErrorText,
  previewKeyOf,
  templateErrorOf,
  templateFileName,
  templateRefOf,
  ticketTemplatesSegs,
  variableName,
} from './ticketTemplates';

const SOURCE = new URL('../../../services/docworker/docworker/templates/', import.meta.url);
const GENERATED = fileURLToPath(new URL('./ticketTemplates.generated.ts', import.meta.url));

function generated(): string {
  const read = (name: string) => readFileSync(new URL(name, SOURCE), 'utf8');
  const { groups } = JSON.parse(read('variables.json')) as { groups: unknown };
  return `/*
 * قالب‌های پیش‌فرض برگه‌ها و فهرست متغیرهایشان، ساخته‌شده از روی services/docworker/docworker/templates؛ دستی ویرایش نکنید.
 * قالب یا متغیر تازه: همان‌جا عوض کنید و \`UPDATE_TICKET_TEMPLATES=1 pnpm test\` بزنید.
 */

export const DEFAULT_TICKET_TEMPLATES = {
  bijak: ${JSON.stringify(read('bijak.html'))},
  first_page: ${JSON.stringify(read('first_page.html'))},
} as const;

export const TICKET_TEMPLATE_VARIABLES: readonly {
  title: string;
  prefix: string;
  in: readonly ('bijak' | 'first_page')[];
  fields: readonly (readonly [string, string, string])[];
}[] = ${JSON.stringify(groups, null, 2)};
`;
}

describe('قالب‌های پیش‌فرض و متغیرها: همان کارگر', () => {
  it('ticketTemplates.generated.ts همان است که از فایل‌های کارگر ساخته می‌شود', () => {
    const expected = generated();
    if (process.env.UPDATE_TICKET_TEMPLATES === '1' || !existsSync(GENERATED)) writeFileSync(GENERATED, expected);
    expect(readFileSync(GENERATED, 'utf8')).toBe(expected);
  });

  it('هر دو نوع قالب پیش‌فرض دارد و هر گروه متغیر مال یکی از دو نوع است', () => {
    expect(Object.keys(DEFAULT_TICKET_TEMPLATES)).toEqual(['bijak', 'first_page']);
    expect(DEFAULT_TICKET_TEMPLATES.bijak).toContain('{{ order.label_name }}');
    for (const group of TICKET_TEMPLATE_VARIABLES) {
      expect(group.in.length).toBeGreaterThan(0);
      for (const [name, text, example] of group.fields) expect([name, text, example].every(Boolean), name).toBe(true);
    }
  });
});

describe('تکه‌های خالص قالب برگه‌ها', () => {
  it('پارامتر نشانی: شناسهٔ نسخه یا قالب پیش‌فرض یک نوع، و هیچ چیز دیگر', () => {
    expect(templateRefOf('12')).toEqual({ kind: null, id: 12 });
    expect(templateRefOf('default-bijak')).toEqual({ kind: 'bijak', id: null });
    expect(templateRefOf('default-first_page')).toEqual({ kind: 'first_page', id: null });
    for (const bad of ['', '0', '-1', '1.5', '12a', 'default-', 'default-other', '99999999999', ' 12', '۱۲']) {
      expect(templateRefOf(bad), bad).toBeNull();
    }
  });

  it('نام فایل دانلود: ASCII، با نوع و شمارهٔ نسخه یا «pishfarz»', () => {
    expect(templateFileName('bijak', 3)).toBe('ghaleb-bijak-3.html');
    expect(templateFileName('first_page', null)).toBe('ghaleb-barge-aval-pishfarz.html');
  });

  it('پیش‌نمایش صفحهٔ n ام کنار صفحهٔ اول، همان قاعدهٔ کارگر (`preview_key_of`)', () => {
    const first = 'orders/10027/ticket-0123456789abcdef.png';
    expect([1, 2, 3].map((n) => previewKeyOf(first, n))).toEqual([
      first,
      'orders/10027/ticket-0123456789abcdef-2.png',
      'orders/10027/ticket-0123456789abcdef-3.png',
    ]);
  });

  it('«همان که دیده شد» فعال کردن: متن و زمان پیش‌نمایش، و بی پیش‌نمایش خالی', () => {
    const at = new Date('2026-10-15T07:50:00Z');
    expect(activationSeen({ sha256: 'a'.repeat(64), preview: { at } })).toBe(`${'a'.repeat(64)}.${at.getTime()}`);
    expect(activationSeen({ sha256: 'a'.repeat(64), preview: { at: null } })).toBe(`${'a'.repeat(64)}.`);
  });

  it('خطای قالب: خط و پیام، بی نام نوع؛ و شکست کار پیش‌نمایش به فارسی با شمارهٔ سفارش', () => {
    expect(templateErrorOf('first_page خط 3: unexpected end of template')).toEqual({ line: 3, message: 'unexpected end of template' });
    expect(templateErrorOf('bijak: برگه بیش از 200 صفحه شد')).toEqual({ line: null, message: 'برگه بیش از 200 صفحه شد' });
    expect(templateErrorOf(': بیش از 90 ثانیه')).toEqual({ line: null, message: 'بیش از 90 ثانیه' });
    expect(previewJobErrorText('order_missing: 10999')).toBe('سفارش 10999 پیدا نشد؛ شماره را ببین و دوباره بزن.');
    expect(previewJobErrorText('order_not_paid')).toBe('آن سفارش هنوز پرداخت نشده؛ پیش‌نمایش با سفارش پرداخت‌شده ساخته می‌شود.');
    expect(previewJobErrorText('files_deleted: 10027')).toBe('فایل‌های سفارش 10027 پاک شده؛ پیش‌نمایش با سفارش دیگری یا با دادهٔ نمونه بساز.');
    expect(previewJobErrorText('font_missing: وزیرمتن پیدا نشد')).toBe('پیش‌نمایش ساخته نشد؛ چند دقیقهٔ دیگر دوباره بزن.');
    expect(previewJobErrorText(null)).toBe('پیش‌نمایش ساخته نشد؛ چند دقیقهٔ دیگر دوباره بزن.');
  });

  it('قالب‌های برگهٔ یک سفارش: نسخه یا پیش‌فرض هر نوع', () => {
    expect(ticketTemplatesSegs({ bijak: 3, firstPage: null })).toEqual(['بیجک نسخهٔ ', { num: '3' }, ' · ', 'برگهٔ اول پیش‌فرض']);
    expect(ticketTemplatesSegs({ bijak: null, firstPage: 12 })).toEqual(['بیجک پیش‌فرض', ' · ', 'برگهٔ اول نسخهٔ ', { num: '12' }]);
  });

  it('نام متغیر همان که در قالب نوشته می‌شود', () => {
    expect(variableName('order', 'label_name')).toBe('order.label_name');
    expect(variableName('', 'total_copies')).toBe('total_copies');
    expect(variableName('f', 'files[].name')).toBe('f.files[].name');
  });
});
