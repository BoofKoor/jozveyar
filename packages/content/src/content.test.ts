/**
 * متن‌های سایت (برش ۱۱٫۱): Markdown محدود و خطاهای شماره‌دارش، جای‌نگهدارها، سنجش و یکدست کردن هر فیلد، متن پیش‌فرض (همان سایت پیش از
 * ۱۱٫۱، و بی هیچ خطا)، «چه عوض می‌شود»، و رسم با همان شکل HTML امروز سایت.
 */

import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

import { checkContent, lineExcerpt } from './check.js';
import { contactLead, contactRows, hasContact, phoneText, telHref } from './contact.js';
import { DEFAULT_REVISED, defaultContent } from './defaults.js';
import { contentDiff, wordDiff } from './diff.js';
import { factsOf, formatsText, placeholderValues, type ContentFacts } from './facts.js';
import {
  CONTENT_KINDS,
  canonicalContent,
  contentFromFields,
  contentOf,
  tidyContent,
  tidyMarkdown,
  type ContactContent,
  type FaqContent,
  type PageContent,
} from './kinds.js';
import { blockPlaceholders, inlineText, linkTarget, parseInline, parseMarkdown } from './markdown.js';
import { PLACEHOLDERS, suggestPlaceholder } from './placeholders.js';
import { HeroTitle, InlineText, MarkdownBlocks, TextContent } from './render.js';

const FACTS: ContentFacts = factsOf({
  priceList: SEED_PRICE_LIST,
  slaDays: 2,
  uploadDays: 2,
  orderFilesDays: 30,
  formats: { word: true, slides: true, image: true },
});
const VALUES = placeholderValues(FACTS);
const html = (node: ReactNode) => renderToStaticMarkup(createElement('div', null, node)).replace(/^<div>|<\/div>$/g, '');

describe('جای‌نگهدارها (سؤال ۲۸۵)', () => {
  it('عدد امروز از تعرفهٔ پایه و تنظیم‌ها، به شکل جدول ویرایشگر', () => {
    expect(VALUES).toEqual({
      روز_کاری: '2',
      روزهای_فایل: '2',
      روزهای_فایل_سفارش: '30',
      'فرمت‌ها': 'PDF، Word، پاورپوینت یا عکس',
      نرخ_سیاه_سفید: '1,600',
      نرخ_سیاه_سفید_یکرو: '1,600',
      نرخ_رنگی: '2,000',
      نرخ_رنگی_یکرو: '2,000',
      صحافی_از: '45,000',
      کرایه_از: '129,500',
    });
    expect(Object.keys(VALUES)).toEqual([...PLACEHOLDERS]);
  });

  it('فرمت‌ها فقط خانواده‌های روشن؛ فقط PDF یعنی «فقط PDF»', () => {
    expect(formatsText({ word: false, slides: true, image: false })).toBe('PDF یا پاورپوینت');
    expect(formatsText({ word: true, slides: false, image: true })).toBe('PDF، Word یا عکس');
    expect(formatsText({ word: false, slides: false, image: false })).toBe('فقط PDF');
  });

  it('حدس نام: نیم‌فاصله و فاصلهٔ دیگر، واژهٔ مشترک، و نزدیک‌ترین', () => {
    expect(suggestPlaceholder('فرمت ها')).toBe('فرمت‌ها');
    expect(suggestPlaceholder('روز کاری')).toBe('روز_کاری');
    expect(suggestPlaceholder('روزهای_نگهداری')).toBe('روزهای_فایل');
    expect(suggestPlaceholder('نرخ_رنگي')).toBe('نرخ_رنگی');
    expect(suggestPlaceholder('کرایه')).toBe('کرایه_از');
    expect(suggestPlaceholder('بی‌ربط')).toBeNull();
  });
});

describe('Markdown محدود (سؤال ۲۸۴)', () => {
  it('تیتر، بند چندخطی با یک فاصله، فهرست، پررنگ، پیوند و جای‌نگهدار', () => {
    const { blocks, issues } = parseMarkdown(
      ['## چاپ', 'جزوه تا {روز_کاری} روز', 'کاری **تحویل** می‌شود.', '', '- یک [تماس](/contact)', '- دو'].join('\n'),
    );
    expect(issues).toEqual([]);
    expect(blocks.map((block) => block.type)).toEqual(['heading', 'paragraph', 'list']);
    expect(blocks[1]).toEqual({
      type: 'paragraph',
      line: 2,
      children: [
        { type: 'text', text: 'جزوه تا ' },
        { type: 'ph', name: 'روز_کاری' },
        { type: 'text', text: ' روز کاری ' },
        { type: 'text', text: 'تحویل', bold: true },
        { type: 'text', text: ' می‌شود.' },
      ],
    });
    expect(blocks[2]).toMatchObject({ type: 'list', items: [{ line: 5 }, { line: 6 }] });
    expect(blockPlaceholders(blocks)).toEqual(['روز_کاری']);
  });

  it('بند پس از فهرست و فهرست پس از بند، بی خط خالی هم جدا', () => {
    const { blocks } = parseMarkdown(['متن', '- یک', 'متن دوم', '- دو'].join('\n'));
    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'list', 'paragraph', 'list']);
  });

  it('پیوند: همین سایت (و نشانی کامل jozveyar.com همان مسیر)، tel و mailto؛ بقیه نه', () => {
    expect(linkTarget('/terms')).toBe('/terms');
    expect(linkTarget('/#faq')).toBe('/#faq');
    expect(linkTarget('https://jozveyar.com/about')).toBe('/about');
    expect(linkTarget('https://www.jozveyar.com')).toBe('/');
    expect(linkTarget('tel:+989123456789')).toBe('tel:+989123456789');
    expect(linkTarget('mailto:jozveyar.com@gmail.com')).toBe('mailto:jozveyar.com@gmail.com');
    // «\» را مرورگر در نشانی «/» می‌خواند: `/\evil.example` همان `//evil.example` است (۱۱٫۳).
    for (const href of [
      '//evil.example',
      '/\\evil.example',
      '/\\/evil.example',
      'https://jozveyar.com/\\evil.example',
      'https://t.me/jozveyar',
      'https://jozveyar.com.evil.example/',
      'javascript:alert(1)',
      'tel:abc',
    ]) {
      expect(linkTarget(href)).toBeNull();
    }
  });

  it('سه خطای طرح، هر کدام با خطش و راه درست کردن', () => {
    const body = [
      '## پرداخت',
      '- کد رهگیری پست به موبایلت پیامک می‌شود. سؤال‌ها در [تلگرام ما](https://t.me/jozveyar).',
      '- فایلی که می‌اندازی {روزهای_نگهداری} روز بعد پاک می‌شود.',
      'اگر سفارشی لغو شود، <b>مبلغ کاملش</b> برمی‌گردد.',
    ].join('\n');
    expect(parseMarkdown(body).issues).toEqual([
      { line: 2, code: 'link_external', detail: 'https://t.me/jozveyar' },
      { line: 3, code: 'placeholder_unknown', detail: 'روزهای_نگهداری', suggestion: 'روزهای_فایل' },
      { line: 4, code: 'html', detail: '<b>', suggestion: '**مبلغ کاملش**' },
    ]);
    expect(lineExcerpt(body, 2)).toBe('کد رهگیری پست…');
    expect(lineExcerpt(body, 4)).toBe('اگر سفارشی لغو…');
    expect(lineExcerpt('## پرداخت', 1)).toBe('پرداخت');
  });

  it('هر ساختار دیگر خطاست: تصویر، جدول (یک بار)، تیتر سطح دیگر، فهرست شماره‌دار، خط جداکننده، نقل‌قول', () => {
    const { issues } = parseMarkdown(
      ['![عکس](/a.png)', '| الف | ب |', '|---|---|', '# بزرگ', '### کوچک', '1. یک', '---', '> نقل', '##'].join('\n'),
    );
    expect(issues.map(({ line, code }) => [line, code])).toEqual([
      [1, 'image'],
      [2, 'table'],
      [4, 'heading_level'],
      [5, 'heading_level'],
      [6, 'numbered_list'],
      [7, 'rule'],
      [8, 'quote'],
      [9, 'heading_empty'],
    ]);
  });

  it('خطای بندی چندخطی خط خودش را دارد؛ پیوند نیمه‌کاره، بی متن و پررنگ بازمانده', () => {
    expect(parseMarkdown(['خط یک', 'خط **دو', 'خط [سه](/x', 'خط [](/x)'].join('\n')).issues.map(({ line, code }) => [line, code])).toEqual([
      [2, 'bold_unclosed'],
      [3, 'link_broken'],
      [4, 'link_empty'],
    ]);
  });

  it('شکل‌های درون‌خطی: plain فقط متن، line با جای‌نگهدار، emphasis با یک تأکید، paragraph همه', () => {
    expect(parseInline('چاپ {نرخ_رنگی} **ارزان** [x](/a)', 'plain').issues.map((i) => i.code)).toEqual([
      'placeholder_not_here',
      'bold_not_here',
      'link_not_here',
    ]);
    expect(parseInline('تحویل تا {روز_کاری} روز', 'line').issues).toEqual([]);
    expect(parseInline('**یک** و **دو**', 'emphasis').issues.map((i) => i.code)).toEqual(['emphasis_twice']);
    expect(parseInline('**یک** [دو](/terms) {کرایه_از}', 'paragraph').issues).toEqual([]);
    expect(inlineText(parseInline('از {کرایه_از} تومان، [تعرفه](/#tariff)', 'paragraph').nodes, VALUES)).toBe('از 129,500 تومان، تعرفه');
  });

  it('متن ساده در هر حال رسم می‌شود: HTML همان نوشته است، نه تگ', () => {
    expect(html(createElement(MarkdownBlocks, { text: '<script>alert(1)</script> و <img src=x onerror=y>', options: { values: VALUES } }))).toBe(
      '<p>&lt;<bdi>script</bdi>&gt;<bdi>alert</bdi>(<span class="num">1</span>)&lt;/<bdi>script</bdi>&gt; و &lt;<bdi>img src</bdi>=<bdi>x onerror</bdi>=<bdi>y</bdi>&gt;</p>',
    );
  });
});

describe('یکدست کردن ورودی (سؤال‌های ۲۸۴ و ۲۹۰)', () => {
  it('ارقام لاتین، ي و ك فارسی، خط خالی پشت‌سرهم یکی و دو سر بی خط خالی', () => {
    expect(tidyMarkdown('\n\n## چاپ  و   صحافي\r\n\r\n\r\nتا ۲ روز كاري\n\n')).toBe('## چاپ و صحافی\n\nتا 2 روز کاری');
  });

  it('تماس: موبایل و تلفن یازده رقم، شناسه بی @ و بی نشانی، کد پستی بی فاصله', () => {
    const raw = contentFromFields('contact', (name) =>
      ({
        mobile: '+98 912 ۳۴۵ ۶۷۸۹',
        phone: '۰۲۱-۶۶۴۹ ۱۲۳۴',
        email: ' a@b.ir ',
        telegram: 'https://t.me/jozveyar/',
        instagram: '@jozve.yar',
        postalCode: '۱۲۳۴۵ ۶۷۸۹۰',
        footerIntro: 'معرفي',
      })[name] ?? '',
    );
    expect(tidyContent('contact', raw)).toMatchObject({
      mobile: '09123456789',
      phone: '02166491234',
      email: 'a@b.ir',
      telegram: 'jozveyar',
      instagram: 'jozve.yar',
      postalCode: '1234567890',
      footerIntro: 'معرفی',
    });
  });
});

describe('سنجش (سؤال‌های ۲۸۴ تا ۲۹۰)', () => {
  it('متن پیش‌فرض هر شش متن بی هیچ خطاست، با هر حالت تعرفه و فرمت‌ها', () => {
    const variants: ContentFacts[] = [
      FACTS,
      { ...FACTS, formats: { word: false, slides: false, image: false } },
      { ...FACTS, rates: { bw: 16_000, color: 20_000, bwSingle: 18_000, colorSingle: 22_000 } },
    ];
    for (const facts of variants) {
      for (const kind of CONTENT_KINDS) expect(checkContent(kind, defaultContent(kind, facts)), kind).toEqual([]);
    }
  });

  it('لازم، سقف نویسه، و شکل هر راه تماس', () => {
    const contact: ContactContent = {
      ...defaultContent('contact', FACTS),
      mobile: '0912345',
      phone: '09123456789',
      email: 'a@b',
      telegram: 'ab',
      instagram: '.jozve',
      postalCode: '12345',
      address: '',
      footerIntro: '',
    };
    expect(checkContent('contact', contact).map((i) => [i.field, i.code])).toEqual([
      ['mobile', 'mobile'],
      ['phone', 'phone'],
      ['email', 'email'],
      ['telegram', 'telegram'],
      ['instagram', 'instagram'],
      ['postalCode', 'postal'],
      ['footerIntro', 'required'],
      ['postalCode', 'postal_without_address'],
    ]);
    const page = { ...defaultContent('terms', FACTS), seo: { title: 'ا'.repeat(61), description: 'توضیح' } };
    expect(checkContent('terms', page)).toEqual([{ field: 'seo.title', label: 'عنوان گوگل', code: 'too_long', max: 60, length: 61 }]);
  });

  it('خطای متن صفحه با خط و آغاز همان خط؛ سؤال‌ها دست‌کم یکی', () => {
    const page: PageContent = { ...defaultContent('terms', FACTS), body: '## یک\nمتن\n- فایلی که می‌اندازی {روزهای_نگهداری} روز بعد' };
    expect(checkContent('terms', page)).toEqual([
      {
        field: 'body',
        label: 'متن صفحه',
        line: 3,
        code: 'placeholder_unknown',
        detail: 'روزهای_نگهداری',
        suggestion: 'روزهای_فایل',
        excerpt: 'فایلی که می‌اندازی…',
      },
    ]);
    expect(checkContent('faq', { items: [] })).toEqual([{ field: 'items', label: 'سؤال‌ها', code: 'faq_empty' }]);
    expect(checkContent('faq', { items: [{ q: '', a: 'پاسخ' }] })).toEqual([{ field: 'items.0.q', label: 'پرسش 1', code: 'required' }]);
  });
});

describe('متن پیش‌فرض (سؤال ۲۸۸)', () => {
  it('سؤال‌ها مثل پیش از ۱۱٫۱: نرخ یکرو فقط وقتی فرق دارد، و جملهٔ فرمت‌ها با خانواده‌های روشن', () => {
    const answer = (facts: ContentFacts, i: number) => inlineText(parseInline(defaultContent('faq', facts).items[i]!.a, 'paragraph').nodes, placeholderValues(facts));
    expect(answer(FACTS, 0)).toContain('سیاه‌سفید 1,600 تومان و رنگی 2,000 تومان.');
    const single = { ...FACTS, rates: { bw: 16_000, color: 20_000, bwSingle: 18_000, colorSingle: 20_000 } };
    expect(answer(single, 0)).toContain('سیاه‌سفید 1,600 تومان در دورو و 1,800 تومان در یکرو و رنگی 2,000 تومان.');
    expect(answer(FACTS, 2)).toMatch(/^PDF، Word، پاورپوینت یا عکس اسکن‌شده\. فایل PDF همان لحظه در مرورگر خوانده می‌شود و بقیه سمت سرور تبدیل می‌شوند\./);
    expect(answer({ ...FACTS, formats: { word: false, slides: false, image: false } }, 2)).toMatch(
      /^فقط PDF\. فایل PDF همان لحظه در مرورگر خوانده می‌شود\. چند فایل/,
    );
    expect(answer(FACTS, 3)).toContain('فایل 2 روز بعد خودکار پاک می‌شود');
  });

  it('هر بار نسخه‌ای تازه؛ تاریخ متن قوانین و حریم خصوصی', () => {
    const a = defaultContent('terms', FACTS);
    a.title = 'دست‌خورده';
    expect(defaultContent('terms', FACTS).title).toBe('قوانین جزوه‌یار');
    expect(DEFAULT_REVISED).toEqual({ terms: '1405/07/21', privacy: '1405/07/10' });
  });
});

describe('خواندن و مقایسه', () => {
  it('JSON نسخه به شکل متن: فیلدی که رشته نیست خالی، کلید اضافه نه، و سؤال‌ها تا سقف', () => {
    expect(contentOf('terms', { title: 5, lead: 'آغاز', body: 'متن', seo: { title: 'ت' }, extra: 'x' })).toEqual({
      title: '',
      lead: 'آغاز',
      body: 'متن',
      seo: { title: 'ت', description: '' },
    });
    expect((contentOf('faq', { items: Array.from({ length: 30 }, () => ({ q: 'پ', a: 'پا' })) }) as FaqContent).items).toHaveLength(20);
    expect(contentOf('home', null).promises).toHaveLength(3);
  });

  it('JSON یکتا: ترتیب کلیدها مهم نیست، هر فیلد هست', () => {
    const page = defaultContent('about', FACTS);
    const shuffled = { seo: page.seo, body: page.body, lead: page.lead, title: page.title };
    expect(canonicalContent('about', shuffled)).toBe(canonicalContent('about', page));
    expect(canonicalContent('about', { ...page, lead: `${page.lead} ` })).not.toBe(canonicalContent('about', page));
  });
});

describe('«چه عوض می‌شود» (سؤال ۲۸۶)', () => {
  it('نمونهٔ طرح: یک جملهٔ افزوده در «لغو و بازپرداخت»، و بقیه همان', () => {
    const before = defaultContent('terms', FACTS);
    const after = { ...before, body: `${before.body} سؤالی بود؟ از [تماس](/contact) بپرس.` };
    const diff = contentDiff('terms', before, after, VALUES);
    expect(diff.changes).toEqual([
      {
        section: 'لغو و بازپرداخت',
        before: [{ text: 'اگر سفارشی پیش از تحویل به پست لغو شود، مبلغ کاملش برمی‌گردد، و وضعیت برگشت در صفحهٔ سفارش دیده می‌شود.' }],
        after: [
          { text: 'اگر سفارشی پیش از تحویل به پست لغو شود، مبلغ کاملش برمی‌گردد، و وضعیت برگشت در صفحهٔ سفارش دیده می‌شود. ' },
          { text: 'سؤالی بود؟ از تماس بپرس.', mark: 'ins' },
        ],
      },
    ]);
    expect(diff.unchanged).toEqual(['تیتر صفحه', 'جملهٔ آغاز', 'بقیهٔ متن صفحه', 'عنوان گوگل', 'توضیح گوگل']);
  });

  it('بخش افزوده و برداشته، و فیلد یک‌خطی واژه به واژه', () => {
    const before = defaultContent('about', FACTS);
    const after = { ...before, title: 'دربارهٔ ما', body: before.body.replace('## نماد اعتماد\n', '## نماد\n') };
    const diff = contentDiff('about', before, after, VALUES);
    expect(diff.changes[0]).toEqual({
      section: 'تیتر صفحه',
      before: [{ text: 'دربارهٔ ' }, { text: 'جزوه‌یار', mark: 'del' }],
      after: [{ text: 'دربارهٔ ' }, { text: 'ما', mark: 'ins' }],
    });
    expect(diff.changes[1]).toEqual({ section: 'نماد', before: [{ text: 'نماد ' }, { text: 'اعتماد', mark: 'del' }], after: [{ text: 'نماد' }] });
    expect(wordDiff('یک دو', 'یک سه دو')).toEqual({ before: [{ text: 'یک دو' }], after: [{ text: 'یک ' }, { text: 'سه', mark: 'ins' }, { text: ' دو' }] });
  });

  it('سؤال‌ها: افزوده، برداشته، پاسخ تازه، و جابه‌جایی', () => {
    const before: FaqContent = { items: [{ q: 'الف', a: 'یک' }, { q: 'ب', a: 'دو' }, { q: 'ج', a: 'سه' }] };
    const after: FaqContent = { items: [{ q: 'ب', a: 'دو تازه' }, { q: 'الف', a: 'یک' }, { q: 'د', a: 'چهار' }] };
    const diff = contentDiff('faq', before, after, VALUES);
    expect(diff.changes.map((change) => [change.section, change.before === null, change.after === null])).toEqual([
      ['سؤال 1: ب', false, false],
      ['سؤال 3: د', true, false],
      ['سؤال 3: ج', false, true],
    ]);
    expect(diff.reordered).toBe(true);
    expect(contentDiff('faq', before, { items: [...before.items.slice(0, 2), { q: 'ج', a: 'سه تازه' }] }, VALUES).reordered).toBe(false);
  });
});

describe('رسم (همان HTML سایت پیش از ۱۱٫۱)', () => {
  it('عدد در .num و واژهٔ لاتین با نقطه و @ یک bdi', () => {
    expect(html(createElement(TextContent, { text: 'پیامک با sms.ir، کاغذ A4 و 1,600 تومان؛ jozveyar.com@gmail.com' }))).toBe(
      'پیامک با <bdi>sms.ir</bdi>، کاغذ <bdi>A4</bdi> و <span class="num">1,600</span> تومان؛ <bdi>jozveyar.com@gmail.com</bdi>',
    );
    expect(html(createElement(TextContent, { text: 'Save As و PDF، Word' }))).toBe('<bdi>Save As</bdi> و <bdi>PDF</bdi>، <bdi>Word</bdi>');
  });

  it('تیتر صفحهٔ اصلی: دو تکه سر ویرگول و تأکید با mark', () => {
    expect(html(createElement(HeroTitle, { text: defaultContent('home', FACTS).title, options: { values: VALUES }, clause: 'home-clause' }))).toBe(
      '<span class="home-clause">جزوه‌ات را بینداز،</span> <span class="home-clause">قیمت را <mark>همین حالا</mark> ببین</span>',
    );
  });

  it('متن قوانین: تیتر، بند، فهرست و عدد جای‌نگهدار، مثل JSX پیش از ۱۱٫۱', () => {
    const out = html(createElement(MarkdownBlocks, { text: defaultContent('terms', FACTS).body, options: { values: VALUES } }));
    expect(out).toContain('<h2>چاپ و تحویل به پست</h2><ul><li>جزوه تا <span class="num">2</span> روز کاری بعد از پرداخت');
    expect(out).toContain('بعضی بانک‌ها برگشت را تا <span class="num">72</span> ساعت دیرتر');
    expect(out.match(/<h2>/g)).toHaveLength(5);
  });

  it('پیوند: سایت با نشانی، صفحهٔ اصلی در زبانهٔ تازه، و پیش‌نمایش بی نشانی؛ جای‌نگهدار با کلاس خط‌چین', () => {
    const text = 'از [تعرفه](/#tariff) یا [ایمیل](mailto:a@b.ir)، {روز_کاری} روز';
    expect(html(createElement(InlineText, { text, format: 'paragraph', options: { values: VALUES } }))).toBe(
      'از <a class="jy-link" href="/#tariff">تعرفه</a> یا <a class="jy-link" href="mailto:a@b.ir">ایمیل</a>، <span class="num">2</span> روز',
    );
    expect(html(createElement(InlineText, { text, format: 'paragraph', options: { values: VALUES, newTab: true } }))).toContain(
      '<a class="jy-link" href="/#tariff" target="_blank" rel="noopener">تعرفه</a> یا <a class="jy-link" href="mailto:a@b.ir">ایمیل</a>',
    );
    expect(html(createElement(InlineText, { text, format: 'paragraph', options: { values: VALUES, inert: true, live: 'ad-live-n' } }))).toBe(
      'از <a class="jy-link" data-href="/#tariff">تعرفه</a> یا <a class="jy-link" data-href="mailto:a@b.ir">ایمیل</a>، <span class="ad-live-n"><span class="num">2</span></span> روز',
    );
    expect(html(createElement(MarkdownBlocks, { text: '## تیتر', options: { values: VALUES }, heading: 'h3', headingClass: 'ad-pv-h' }))).toBe('<h3 class="ad-pv-h">تیتر</h3>');
  });
});

describe('تماس (سؤال ۲۹۰)', () => {
  const base = defaultContent('contact', FACTS);

  it('متن پیش‌فرض همان اطلاعات صاحب پروژه: ایمیل، ساعت و نشانی', () => {
    expect(contactRows(base).map((row) => row.label)).toEqual(['ایمیل', 'ساعت پاسخ‌گویی', 'نشانی']);
    expect(contactLead(base)).toBe('شمارهٔ سفارشت را در ایمیلت بنویس؛ در صفحهٔ سفارش و پیامک پرداخت هست.');
    expect(hasContact(base)).toBe(true);
  });

  it('هر هفت راه به ترتیب طرح، و پیوند تلگرام و اینستاگرام از شناسه', () => {
    const all = { ...base, mobile: '09123456789', phone: '02166491234', telegram: 'jozveyar', instagram: 'jozve.yar', postalCode: '1234567890' };
    expect(contactRows(all)).toEqual([
      { label: 'پیامک و تماس', kind: 'tel', value: '0912 345 6789', href: 'tel:+989123456789' },
      { label: 'تلفن', kind: 'tel', value: '021 6649 1234', href: 'tel:+982166491234' },
      { label: 'ایمیل', kind: 'email', value: 'jozveyar.com@gmail.com', href: 'mailto:jozveyar.com@gmail.com' },
      { label: 'تلگرام', kind: 'social', value: '@jozveyar', href: 'https://t.me/jozveyar' },
      { label: 'اینستاگرام', kind: 'social', value: '@jozve.yar', href: 'https://instagram.com/jozve.yar' },
      { label: 'ساعت پاسخ‌گویی', kind: 'text', value: base.hours },
      { label: 'نشانی', kind: 'text', value: base.address, postalCode: '1234567890' },
    ]);
    expect(contactLead(all)).toBe('شمارهٔ سفارشت را آماده داشته باش؛ در صفحهٔ سفارش و پیامک پرداخت هست.');
    expect(contactLead({ ...base, telegram: 'jozveyar' })).toBe('شمارهٔ سفارشت را در پیامت بنویس؛ در صفحهٔ سفارش و پیامک پرداخت هست.');
    // تلفن ثابت به‌تنهایی هم شماره است: «آماده داشته باش»، حتی با ایمیل.
    expect(contactLead({ ...base, phone: '02166491234' })).toBe('شمارهٔ سفارشت را آماده داشته باش؛ در صفحهٔ سفارش و پیامک پرداخت هست.');
  });

  it('بی هیچ راهی صفحه نیست؛ ساعت به‌تنهایی راه نیست', () => {
    const none = { ...base, email: '', address: '', hours: 'شنبه' };
    expect(hasContact(none)).toBe(false);
    expect(hasContact({ ...none, instagram: 'jozve' })).toBe(true);
    expect(telHref('0912 345 6789')).toBe('tel:+989123456789');
    expect(phoneText('12345')).toBe('12345');
  });
});
