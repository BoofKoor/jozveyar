/**
 * دادهٔ ساختاریافتهٔ صفحهٔ اصلی (برش ۱۵٫۱، سؤال ۴۲۷): سازمان با لوگوی مطلق، شبکه‌ها و راه تماس فقط از ردیف‌های صفحهٔ «تماس»، وب‌سایت با نام
 * و نام‌های دیگر، خدمت، و همان سؤال‌های صفحه؛ و متنی که هیچ چیزش تگ اسکریپت را نمی‌بندد. خود صفحه در `tests/site.spec.ts`.
 */

import { describe, expect, it } from 'vitest';
import { defaultContent, type ContactContent } from '@jozveyar/content';

import { SITE_ALTERNATE_NAMES, SITE_NAME, homeGraph, jsonLd } from './structuredData';

const SITE = 'https://jozveyar.com';
const LOGO = { url: '/icons/icon-512.png', width: 512, height: 512 };
const NONE: ContactContent = { ...defaultContent('contact'), mobile: '', phone: '', email: '', telegram: '', instagram: '', address: '' };
const FAQ = [
  { q: 'قیمت چاپ جزوه چطور حساب می‌شود؟', a: 'به‌ازای هر صفحه.' },
  { q: 'ارسال چقدر طول می‌کشد؟', a: 'تا 2 روز کاری.' },
];

const graphOf = (contact: ContactContent = NONE, logo = LOGO) => homeGraph({ siteUrl: SITE, logo, contact, faq: FAQ })['@graph'];
const node = (graph: ReturnType<typeof graphOf>, type: string) => graph.find((item) => item['@type'] === type) as Record<string, unknown>;

describe('دادهٔ ساختاریافتهٔ صفحهٔ اصلی', () => {
  it('یک گراف: سازمان، وب‌سایت، خدمت و سؤال‌ها، به هم پیوسته با شناسهٔ سازمان', () => {
    const graph = graphOf();
    expect(graph.map((item) => item['@type'])).toEqual(['Organization', 'WebSite', 'Service', 'FAQPage']);
    const org = node(graph, 'Organization');
    expect(org['@id']).toBe(`${SITE}/#org`);
    expect(org.url).toBe(SITE);
    expect(node(graph, 'WebSite').publisher).toEqual({ '@id': `${SITE}/#org` });
    expect(node(graph, 'Service').provider).toEqual({ '@id': `${SITE}/#org` });
  });

  it('نام سایت در گوگل: «جزوه‌یار»، با نام‌هایی که مردم می‌نویسند؛ وب‌سایت نشانی صفحهٔ اصلی با «/» و زبان فارسی', () => {
    const site = node(graphOf(), 'WebSite');
    expect(SITE_NAME).toBe('جزوه‌یار');
    expect(site).toMatchObject({ name: 'جزوه‌یار', alternateName: ['جزوه یار', 'Jozveyar'], url: `${SITE}/`, inLanguage: 'fa-IR' });
    expect(node(graphOf(), 'Organization')).toMatchObject({ name: SITE_NAME, alternateName: [...SITE_ALTERNATE_NAMES] });
  });

  it('لوگو نشانی مطلق دارد، از نشانی نسبی هم؛ نشانی مطلق همان می‌ماند', () => {
    expect(node(graphOf(), 'Organization').logo).toEqual({ '@type': 'ImageObject', url: `${SITE}/icons/icon-512.png`, width: 512, height: 512 });
    const owner = { url: 'https://cdn.example.test/logo.png', width: 600, height: 600 };
    expect(node(graphOf(NONE, owner), 'Organization').logo).toMatchObject({ url: owner.url, width: 600, height: 600 });
  });

  it('بی راه تماس: نه شبکه، نه راه تماس؛ هیچ کلید خالی', () => {
    const org = node(graphOf(), 'Organization');
    expect(org).not.toHaveProperty('sameAs');
    expect(org).not.toHaveProperty('contactPoint');
  });

  it('شبکه‌ها فقط تلگرام و اینستاگرام صفحهٔ «تماس»؛ راه تماس با ایمیل و اولین شماره به شکل بین‌المللی', () => {
    const contact = { ...NONE, mobile: '09123456789', phone: '02166491234', email: 'hi@jozveyar.com', telegram: 'jozveyar', instagram: 'jozveyar.ir' };
    const org = node(graphOf(contact), 'Organization');
    expect(org.sameAs).toEqual(['https://t.me/jozveyar', 'https://instagram.com/jozveyar.ir']);
    expect(org.contactPoint).toEqual([
      { '@type': 'ContactPoint', contactType: 'customer support', availableLanguage: 'fa', email: 'hi@jozveyar.com', telephone: '+989123456789' },
    ]);
    // فقط تلفن ثابت: همان؛ فقط ایمیل: بی تلفن؛ فقط شبکه: شبکه هست و راه تماس نه.
    expect(node(graphOf({ ...NONE, phone: '02166491234' }), 'Organization').contactPoint).toEqual([
      { '@type': 'ContactPoint', contactType: 'customer support', availableLanguage: 'fa', telephone: '+982166491234' },
    ]);
    expect(node(graphOf({ ...NONE, email: 'hi@jozveyar.com' }), 'Organization').contactPoint).toEqual([
      { '@type': 'ContactPoint', contactType: 'customer support', availableLanguage: 'fa', email: 'hi@jozveyar.com' },
    ]);
    const social = node(graphOf({ ...NONE, telegram: 'jozveyar' }), 'Organization');
    expect(social.sameAs).toEqual(['https://t.me/jozveyar']);
    expect(social).not.toHaveProperty('contactPoint');
  });

  it('سؤال‌ها همان سؤال‌های صفحه، به همان ترتیب', () => {
    expect(node(graphOf(), 'FAQPage').mainEntity).toEqual(
      FAQ.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    );
  });

  it('متن درون اسکریپت تگ را نمی‌بندد و همان JSON را می‌دهد', () => {
    const data = { a: '</script><script>alert(1)</script>', b: 'جزوه <b>' };
    const text = jsonLd(data);
    expect(text).not.toContain('<');
    expect(JSON.parse(text)).toEqual(data);
  });
});
