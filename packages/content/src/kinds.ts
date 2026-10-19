/**
 * متن‌های سایت که مالک از پنل عوض می‌کند (برش ۱۱٫۱، سؤال ۲۸۳): شش متن، هر کدام با فیلدهای خودش. هر متن یک‌جا منتشر می‌شود و نسخه‌اش
 * عوض‌نشدنی است (`site_content_versions`). تعرفه، کارت بارگذاری، میز سفارش، مسیر خرید، پیامک‌ها و صفحهٔ سفارش اینجا نیستند: هر پیام آنجا
 * یک حالت کد است، و متن پیامک قالب ثبت‌شدهٔ sms.ir.
 *
 * شکل هر متن JSON ساده است و فقط رشته دارد. هر فیلد یک «قالب» دارد (`FieldFormat`)، که هم سنجش (`check.ts`) از آن است و هم یکدست کردن
 * ورودی (`tidyContent`) و هم رسم (`render.tsx`). مسیر هر فیلد («promises.1.title») همان نام فیلد فرم پنل است.
 */

import { normalizeIranMobile, tidyInputFa } from '@jozveyar/text/input';
import { toLatinDigits } from '@jozveyar/text';

import type { InlineFormat } from './markdown.js';

export const CONTENT_KINDS = ['home', 'faq', 'terms', 'privacy', 'about', 'contact'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const isContentKind = (value: unknown): value is ContentKind =>
  typeof value === 'string' && (CONTENT_KINDS as readonly string[]).includes(value);

/** صفحه‌های ثابتی که تیتر، جملهٔ آغاز و متن Markdown دارند. */
export const PAGE_KINDS = ['terms', 'privacy', 'about'] as const;
export type PageKind = (typeof PAGE_KINDS)[number];
export const isPageKind = (kind: ContentKind): kind is PageKind => (PAGE_KINDS as readonly string[]).includes(kind);

/** نام هر متن در پنل و رویدادها. */
export const KIND_NAMES: Readonly<Record<ContentKind, string>> = {
  home: 'صفحهٔ اصلی',
  faq: 'سؤال‌های پرتکرار',
  terms: 'قوانین',
  privacy: 'حریم خصوصی',
  about: 'دربارهٔ ما',
  contact: 'تماس و پاورقی',
};

/** نشانی صفحهٔ هر متن روی سایت؛ سؤال‌ها بخشی از صفحهٔ اصلی‌اند. */
export const KIND_PATHS: Readonly<Record<ContentKind, string>> = {
  home: '/',
  faq: '/#faq',
  terms: '/terms',
  privacy: '/privacy',
  about: '/about',
  contact: '/contact',
};

export interface Seo {
  /** عنوان زبانهٔ مرورگر و گوگل، پیش از «| جزوه‌یار» (صفحهٔ اصلی بی آن). */
  title: string;
  description: string;
}

export interface HomePromise {
  title: string;
  sub: string;
}

export interface HomeStep {
  title: string;
  body: string;
}

export interface HomeContent {
  eyebrow: string;
  /** با دست‌بالا یک تأکید `**…**`؛ سر ویرگول به خط بعد می‌رود. */
  title: string;
  lead: string;
  /** سه نوید زیر کارت بارگذاری؛ آیکون هر کدام (برچسب، کامیون، قفل) همان می‌ماند. */
  promises: HomePromise[];
  howTitle: string;
  steps: HomeStep[];
  seo: Seo;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqContent {
  items: FaqItem[];
}

export interface PageContent {
  title: string;
  lead: string;
  body: string;
  seo: Seo;
}

/** راه‌های تماس (هر چه خالی، روی سایت نمی‌آید)، دو جملهٔ پاورقی، و گوگلِ صفحهٔ «تماس». */
export interface ContactContent {
  /** `09…`، یکدست با `normalizeIranMobile`. */
  mobile: string;
  /** با پیش‌شمارهٔ شهر، یازده رقم: `021…`. */
  phone: string;
  email: string;
  /** فقط شناسه؛ پیوند را سایت می‌سازد. */
  telegram: string;
  instagram: string;
  hours: string;
  address: string;
  /** ده رقم، کنار نشانی. */
  postalCode: string;
  footerIntro: string;
  footerLegal: string;
  seo: Seo;
}

export interface ContentByKind {
  home: HomeContent;
  faq: FaqContent;
  terms: PageContent;
  privacy: PageContent;
  about: PageContent;
  contact: ContactContent;
}

export type AnyContent = ContentByKind[ContentKind];

/* ───────────────────────── فیلدها ───────────────────────── */

export type FieldFormat = InlineFormat | 'markdown' | 'mobile' | 'phone' | 'email' | 'telegram' | 'instagram' | 'postal';

export interface FieldSpec {
  /** مسیر فیلد در متن و نام فیلد فرم: «promises.1.title». */
  name: string;
  /** نام فیلد در خطا: «خط دوم نوید 2». */
  label: string;
  format: FieldFormat;
  /** سقف نویسه (هر نویسهٔ یونیکد یکی). */
  max: number;
  required: boolean;
}

/** سقف سؤال‌ها (سؤال ۲۸۹). */
export const FAQ_MAX_ITEMS = 20;

/** سه نوید و سه قدم صفحهٔ اصلی؛ شمارشان جزو چیدمان طرح است. */
export const HOME_PROMISES = 3;
export const HOME_STEPS = 3;

const SEO_FIELDS: FieldSpec[] = [
  { name: 'seo.title', label: 'عنوان گوگل', format: 'plain', max: 60, required: true },
  { name: 'seo.description', label: 'توضیح گوگل', format: 'plain', max: 160, required: true },
];

const n = (i: number) => String(i + 1);

/** فیلدهای یک متن، به ترتیب فرم؛ سؤال‌ها به شمار همان متن. */
export function fieldsOf(kind: ContentKind, faqCount = 0): FieldSpec[] {
  switch (kind) {
    case 'home':
      return [
        { name: 'eyebrow', label: 'خط بالای تیتر', format: 'line', max: 80, required: true },
        { name: 'title', label: 'تیتر', format: 'emphasis', max: 80, required: true },
        { name: 'lead', label: 'جملهٔ زیر تیتر', format: 'line', max: 160, required: true },
        ...Array.from({ length: HOME_PROMISES }, (_, i): FieldSpec[] => [
          { name: `promises.${i}.title`, label: `نوید ${n(i)}`, format: 'line', max: 50, required: true },
          { name: `promises.${i}.sub`, label: `خط دوم نوید ${n(i)}`, format: 'line', max: 60, required: true },
        ]).flat(),
        { name: 'howTitle', label: 'تیتر «سه قدم»', format: 'line', max: 60, required: true },
        ...Array.from({ length: HOME_STEPS }, (_, i): FieldSpec[] => [
          { name: `steps.${i}.title`, label: `قدم ${n(i)}`, format: 'line', max: 50, required: true },
          { name: `steps.${i}.body`, label: `متن قدم ${n(i)}`, format: 'paragraph', max: 240, required: true },
        ]).flat(),
        ...SEO_FIELDS,
      ];
    case 'faq':
      return Array.from({ length: faqCount }, (_, i): FieldSpec[] => [
        { name: `items.${i}.q`, label: `پرسش ${n(i)}`, format: 'plain', max: 150, required: true },
        { name: `items.${i}.a`, label: `پاسخ ${n(i)}`, format: 'paragraph', max: 800, required: true },
      ]).flat();
    case 'terms':
    case 'privacy':
    case 'about':
      return [
        { name: 'title', label: 'تیتر صفحه', format: 'plain', max: 80, required: true },
        { name: 'lead', label: 'جملهٔ آغاز', format: 'line', max: 300, required: true },
        { name: 'body', label: 'متن صفحه', format: 'markdown', max: 20_000, required: true },
        ...SEO_FIELDS,
      ];
    case 'contact':
      return [
        { name: 'mobile', label: 'موبایل', format: 'mobile', max: 20, required: false },
        { name: 'phone', label: 'تلفن ثابت', format: 'phone', max: 20, required: false },
        { name: 'email', label: 'ایمیل', format: 'email', max: 100, required: false },
        { name: 'telegram', label: 'تلگرام', format: 'telegram', max: 32, required: false },
        { name: 'instagram', label: 'اینستاگرام', format: 'instagram', max: 30, required: false },
        { name: 'hours', label: 'ساعت پاسخ‌گویی', format: 'plain', max: 100, required: false },
        { name: 'address', label: 'نشانی', format: 'plain', max: 300, required: false },
        { name: 'postalCode', label: 'کد پستی', format: 'postal', max: 10, required: false },
        { name: 'footerIntro', label: 'معرفی زیر لوگو', format: 'plain', max: 200, required: true },
        { name: 'footerLegal', label: 'جملهٔ پایین پاورقی', format: 'plain', max: 160, required: false },
        ...SEO_FIELDS,
      ];
  }
}

/* ───────────────────────── خواندن و ساختن ───────────────────────── */

/** مقدار رشته‌ای یک مسیر در JSON؛ هر چیز دیگر رشتهٔ خالی. */
export function readPath(source: unknown, path: string): string {
  let value: unknown = source;
  for (const key of path.split('.')) {
    if (value === null || typeof value !== 'object') return '';
    value = (value as Record<string, unknown>)[key];
  }
  return typeof value === 'string' ? value : '';
}

/** شمار سؤال‌های یک JSON، تا سقف. */
export function faqCountOf(source: unknown): number {
  const items = source !== null && typeof source === 'object' ? (source as { items?: unknown }).items : undefined;
  return Array.isArray(items) ? Math.min(items.length, FAQ_MAX_ITEMS) : 0;
}

function build(kind: ContentKind, read: (path: string) => string, faqCount: number): AnyContent {
  const seo = (): Seo => ({ title: read('seo.title'), description: read('seo.description') });
  switch (kind) {
    case 'home':
      return {
        eyebrow: read('eyebrow'),
        title: read('title'),
        lead: read('lead'),
        promises: Array.from({ length: HOME_PROMISES }, (_, i) => ({ title: read(`promises.${i}.title`), sub: read(`promises.${i}.sub`) })),
        howTitle: read('howTitle'),
        steps: Array.from({ length: HOME_STEPS }, (_, i) => ({ title: read(`steps.${i}.title`), body: read(`steps.${i}.body`) })),
        seo: seo(),
      } satisfies HomeContent;
    case 'faq':
      return { items: Array.from({ length: faqCount }, (_, i) => ({ q: read(`items.${i}.q`), a: read(`items.${i}.a`) })) } satisfies FaqContent;
    case 'terms':
    case 'privacy':
    case 'about':
      return { title: read('title'), lead: read('lead'), body: read('body'), seo: seo() } satisfies PageContent;
    case 'contact':
      return {
        mobile: read('mobile'),
        phone: read('phone'),
        email: read('email'),
        telegram: read('telegram'),
        instagram: read('instagram'),
        hours: read('hours'),
        address: read('address'),
        postalCode: read('postalCode'),
        footerIntro: read('footerIntro'),
        footerLegal: read('footerLegal'),
        seo: seo(),
      } satisfies ContactContent;
  }
}

/** JSON نسخه یا پیش‌نویس به شکل متن: هر فیلدی که رشته نیست خالی، و هیچ کلید دیگری. */
export function contentOf<K extends ContentKind>(kind: K, source: unknown): ContentByKind[K] {
  return build(kind, (path) => readPath(source, path), faqCountOf(source)) as ContentByKind[K];
}

/** متن از فرم پنل: هر فیلد با نام مسیرش؛ سؤال‌ها به شمار `faqCount`. */
export function contentFromFields<K extends ContentKind>(kind: K, get: (name: string) => string, faqCount = 0): ContentByKind[K] {
  return build(kind, get, Math.max(0, Math.min(faqCount, FAQ_MAX_ITEMS))) as ContentByKind[K];
}

/* ───────────────────────── یکدست کردن ورودی ───────────────────────── */

/**
 * متن Markdown: هر خط با `tidyInputFa` (ي و ك فارسی، ارقام لاتین، نویسهٔ نامرئی جز نیم‌فاصله پاک، فاصله‌ها یکی)، خط خالیِ پشت‌سرهم یکی،
 * و بی خط خالی در دو سر. خط خالی جداکنندهٔ بند است، پس می‌ماند.
 */
export function tidyMarkdown(source: string): string {
  const lines = source.split(/\r\n|[\n\r\u2028\u2029\u0085]/).map(tidyInputFa);
  const kept: string[] = [];
  for (const line of lines) {
    if (line === '' && (kept.length === 0 || kept.at(-1) === '')) continue;
    kept.push(line);
  }
  while (kept.at(-1) === '') kept.pop();
  return kept.join('\n');
}

/** شمارهٔ تلفن ثابت به یازده رقم با صفر (`021…`)؛ نتوانست، همان نوشته. */
function tidyPhone(value: string): string {
  const digits = toLatinDigits(value).replace(/[^\d+]/g, '');
  const local = digits.startsWith('+98') ? `0${digits.slice(3)}` : digits.startsWith('0098') ? `0${digits.slice(4)}` : digits;
  return /^0\d{10}$/.test(local) ? local : value;
}

/** شناسهٔ تلگرام یا اینستاگرام: بی «@» و بی نشانی سایت، اگر کسی پیوند کامل را چسبانده. */
function tidyHandle(value: string, hosts: RegExp): string {
  return value
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(hosts, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '');
}

function tidyField(format: FieldFormat, raw: string): string {
  if (format === 'markdown') return tidyMarkdown(raw);
  const value = tidyInputFa(raw);
  switch (format) {
    case 'mobile':
      return value ? (normalizeIranMobile(value) ?? value) : '';
    case 'phone':
      return value ? tidyPhone(value) : '';
    case 'email':
      return value.replace(/\s+/g, '');
    case 'telegram':
      return tidyHandle(value, /^(?:t\.me|telegram\.me)\//i);
    case 'instagram':
      return tidyHandle(value, /^instagram\.com\//i);
    case 'postal':
      return /^[\d\s-]+$/.test(value) ? value.replace(/[\s-]/g, '') : value;
    default:
      return value;
  }
}

/** همهٔ فیلدهای یک متن یکدست (سؤال ۲۸۴: رقم‌ها لاتین و «ي» و «ك» فارسی). */
export function tidyContent<K extends ContentKind>(kind: K, content: ContentByKind[K]): ContentByKind[K] {
  const specs = fieldsOf(kind, kind === 'faq' ? (content as FaqContent).items.length : 0);
  const tidy = new Map(specs.map((spec) => [spec.name, tidyField(spec.format, readPath(content, spec.name))]));
  return contentFromFields(kind, (name) => tidy.get(name) ?? '', kind === 'faq' ? (content as FaqContent).items.length : 0);
}

/* ───────────────────────── مقایسه ───────────────────────── */

/** JSON یکتای یک متن (کلیدها به ترتیب `fieldsOf`)، برای «همان که دیده شد» و «چیزی عوض نشد». */
export function canonicalContent(kind: ContentKind, content: AnyContent): string {
  const specs = fieldsOf(kind, kind === 'faq' ? (content as FaqContent).items.length : 0);
  return JSON.stringify([kind, ...specs.map((spec) => readPath(content, spec.name))]);
}

export const sameContent = (kind: ContentKind, a: AnyContent, b: AnyContent) => canonicalContent(kind, a) === canonicalContent(kind, b);
