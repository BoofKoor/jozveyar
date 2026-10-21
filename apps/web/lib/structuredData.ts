/**
 * دادهٔ ساختاریافتهٔ صفحهٔ اصلی برای گوگل (برش ۱۵٫۱، سؤال ۴۲۷؛ ADR-071): یک `@graph` با سازمان (نام، لوگو، شبکه‌ها و راه تماس پشتیبانی)،
 * وب‌سایت (نام سایت در نتیجه‌های گوگل)، خدمت، و سؤال‌های پرتکرار. فقط آنچه روی سایت دیده می‌شود: شبکه‌ها و راه تماس همان ردیف‌های صفحهٔ
 * «تماس» (`contactRows`)، و سؤال‌ها همان سؤال‌های صفحه. نظرهای مشتری بی نشانه‌گذاری می‌مانند: گوگل ستارهٔ نظرهایی را که سایتی دربارهٔ خودش
 * نشان می‌دهد نمی‌آورد. خالص، تا تست بی سرور بسنجدش.
 */

import { contactRows, type ContactContent } from '@jozveyar/content';

/** نام سایت در نتیجه‌های گوگل، و نام‌هایی که مردم با آن جست‌وجو می‌کنند (بی نیم‌فاصله، و لاتین نشانی). */
export const SITE_NAME = 'جزوه‌یار';
export const SITE_ALTERNATE_NAMES = ['جزوه یار', 'Jozveyar'] as const;

export interface HomeGraphInput {
  /** مبدأ سایت، بی `/` ته: `https://jozveyar.com`. */
  siteUrl: string;
  /** لوگوی مربع سازمان، نشانی نسبی یا مطلق (آیکون ۵۱۲ برند، یا لوگوی مالک از ۱۱٫۲). */
  logo: { url: string; width: number; height: number };
  contact: ContactContent;
  /** پرسش و پاسخ همان سؤال‌های صفحه، بی قالب و با عدد امروز. */
  faq: readonly { q: string; a: string }[];
}

const absolute = (siteUrl: string, url: string) => new URL(url, `${siteUrl}/`).href;

export function homeGraph({ siteUrl, logo, contact, faq }: HomeGraphInput) {
  const org = `${siteUrl}/#org`;
  const rows = contactRows(contact);
  const sameAs = rows.flatMap((row) => (row.kind === 'social' ? [row.href] : []));
  const phone = rows.find((row) => row.kind === 'tel');
  const email = rows.find((row) => row.kind === 'email');
  const contactPoint =
    phone || email
      ? [
          {
            '@type': 'ContactPoint',
            contactType: 'customer support',
            availableLanguage: 'fa',
            ...(email ? { email: email.value } : {}),
            ...(phone && phone.kind === 'tel' ? { telephone: phone.href.slice('tel:'.length) } : {}),
          },
        ]
      : [];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': org,
        name: SITE_NAME,
        alternateName: [...SITE_ALTERNATE_NAMES],
        url: siteUrl,
        logo: { '@type': 'ImageObject', url: absolute(siteUrl, logo.url), width: logo.width, height: logo.height },
        areaServed: { '@type': 'Country', name: 'ایران' },
        ...(sameAs.length > 0 ? { sameAs } : {}),
        ...(contactPoint.length > 0 ? { contactPoint } : {}),
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        name: SITE_NAME,
        alternateName: [...SITE_ALTERNATE_NAMES],
        url: `${siteUrl}/`,
        inLanguage: 'fa-IR',
        publisher: { '@id': org },
      },
      {
        '@type': 'Service',
        name: 'چاپ و صحافی جزوه',
        serviceType: 'چاپ جزوه',
        provider: { '@id': org },
        areaServed: { '@type': 'Country', name: 'ایران' },
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })),
      },
    ],
  };
}

/** متن درون `<script type="application/ld+json">`: «<» هم `<`، تا هیچ متنی از پنل تگ اسکریپت را نبندد (سؤال ۳۴۷). */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/**
 * مسیر دیدنی برای گوگل (برش ۱۵٫۲، سؤال‌های ۴۲۷ و ۴۵۳): همان پله‌های `Crumbs` صفحه، با نشانی مطلق؛ پلهٔ آخر خود صفحه است. گوگل مسیر را به جای
 * نشانی در نتیجه نشان می‌دهد.
 */
export function breadcrumbGraph(siteUrl: string, items: readonly { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.path === '/' ? siteUrl : `${siteUrl}${item.path}`,
    })),
  };
}
