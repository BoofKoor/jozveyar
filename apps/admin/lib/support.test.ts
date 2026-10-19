/**
 * پشتیبانی در پنل به زبان صفحه (`support.ts`، برش ۱۲٫۱): «منتظر از …» صندوق و هشدار پیشخوان به وقت تهران، تکهٔ آخرین پیام، سرسطر هر پیام با
 * نام ادمین فقط برای پنل، آخرین پیام برای «بستن»، و اینکه پاسخ بعدی پیامک تازه می‌گیرد یا نه (همان قاعدهٔ تراکنش پاسخ). «حالا»ی طرح: دوشنبه
 * 13 مهر 1405، 11:20 تهران.
 */

import { describe, expect, it } from 'vitest';

import type { PanelMessage, ShipmentSms } from '@jozveyar/db';

import type { Seg } from './orders';
import { lastMessageId, lastSnippet, latestSmsMessageId, messageHead, oldestText, replySeen, replySmsGoes, sinceText, topicSegs, waitText } from './support';

const NOW = new Date('2026-10-05T07:50:00Z');
const TODAY = new Date('2026-10-05T04:42:00Z'); // 08:12
const YESTERDAY = new Date('2026-10-04T17:44:00Z'); // یکشنبه 12 مهر 21:14
const text = (segs: readonly Seg[]) => segs.map((seg) => (typeof seg === 'string' ? seg : 'num' in seg ? seg.num : '')).join('');

const sms = (status: string, over: Partial<ShipmentSms> = {}): ShipmentSms => ({
  id: 900,
  toMobile: '09152345678',
  status,
  error: status === 'failed' ? 'unavailable' : null,
  attempts: 1,
  createdAt: YESTERDAY,
  attemptedAt: YESTERDAY,
  sentAt: status === 'sent' ? YESTERDAY : null,
  ...over,
});
const message = (id: number, kind: PanelMessage['kind'], at: Date, over: Partial<PanelMessage> = {}): PanelMessage => ({
  id,
  kind,
  body: kind === 'closed' ? null : 'متن',
  at,
  adminName: kind === 'customer' ? null : 'علی',
  sms: null,
  ...over,
});

describe('زمان‌های صندوق و پیشخوان', () => {
  it('امروز فقط ساعت (هشدار پیشخوان با «ساعت»)، و روز دیگر با روز', () => {
    expect(sinceText(TODAY, NOW)).toBe('08:12');
    expect(sinceText(YESTERDAY, NOW)).toBe('دیروز 21:14');
    expect(oldestText(TODAY, NOW)).toBe('ساعت 08:12');
    expect(oldestText(YESTERDAY, NOW)).toBe('دیروز 21:14');
  });

  it('ستون آخر: باز «منتظر از …»، پاسخ‌داده و بسته با زمان آخرین پیام', () => {
    expect(waitText({ status: 'open', waitingSince: YESTERDAY, lastMessageAt: TODAY }, NOW)).toBe('منتظر از دیروز 21:14');
    expect(waitText({ status: 'open', waitingSince: TODAY, lastMessageAt: TODAY }, NOW)).toBe('منتظر از 08:12');
    expect(waitText({ status: 'answered', waitingSince: null, lastMessageAt: TODAY }, NOW)).toBe('پاسخ داده شد، امروز 08:12');
    expect(waitText({ status: 'closed', waitingSince: null, lastMessageAt: YESTERDAY }, NOW)).toBe('بسته، آخرین پیام دیروز 21:14');
  });

  it('موضوع گفت‌وگو: شمارهٔ سفارش بی جداکننده، یا «سؤال کلی»', () => {
    expect(text(topicSegs(10027))).toBe('سفارش 10027');
    expect(topicSegs(10027)).toEqual(['سفارش ', { num: '10027' }]);
    expect(topicSegs(null)).toEqual(['سؤال کلی']);
  });
});

describe('پیام‌ها', () => {
  it('تکهٔ آخرین پیام یک خط است، بلند با سه‌نقطه، و پاسخ ما با «پاسخ: »', () => {
    expect(lastSnippet({ kind: 'customer', body: 'سلام.\nتا چهارشنبه   می‌رسد؟', at: TODAY })).toBe('سلام. تا چهارشنبه می‌رسد؟');
    expect(lastSnippet({ kind: 'staff', body: 'بله.', at: TODAY })).toBe('پاسخ: بله.');
    expect(lastSnippet({ kind: 'customer', body: 'ن'.repeat(300), at: TODAY })).toBe(`${'ن'.repeat(240)}…`);
    expect(lastSnippet(null)).toBe('');
  });

  it('سرسطر: نام مشتری، و نام ادمین فقط برای پنل (سؤال ۳۱۴)', () => {
    expect(messageHead(message(1, 'customer', YESTERDAY), 'مریم کاظمی', NOW)).toEqual({ who: 'مریم کاظمی', when: 'دیروز 21:14' });
    expect(messageHead(message(1, 'customer', YESTERDAY), null, NOW)).toEqual({ who: 'مشتری', when: 'دیروز 21:14' });
    expect(messageHead(message(2, 'staff', TODAY), 'مریم کاظمی', NOW)).toEqual({ who: 'علی', when: 'پاسخ پشتیبانی · امروز 08:12' });
    expect(messageHead(message(3, 'closed', TODAY, { adminName: null }), null, NOW)).toEqual({ who: 'پشتیبانی', when: 'گفت‌وگو را بست · امروز 08:12' });
  });

  it('بستن از آخرین پیام (نشان بستن هم)، و «دوباره» فقط پیامک آخرین پاسخ پیامک‌دار', () => {
    const messages = [
      message(1, 'customer', YESTERDAY),
      message(2, 'staff', YESTERDAY, { sms: sms('failed') }),
      message(3, 'staff', TODAY, { sms: sms('sent') }),
      message(4, 'staff', TODAY),
      message(5, 'closed', TODAY),
    ];
    expect(lastMessageId({ messages })).toBe(5);
    expect(lastMessageId({ messages: [] })).toBeNull();
    expect(latestSmsMessageId({ messages })).toBe(3);
    expect(latestSmsMessageId({ messages: messages.slice(0, 1) })).toBeNull();
  });

  it('«دیده شد» از خود پاسخ به بعد', () => {
    expect(replySeen(TODAY, null)).toBe(false);
    expect(replySeen(TODAY, YESTERDAY)).toBe(false);
    expect(replySeen(TODAY, TODAY)).toBe(true);
    expect(replySeen(YESTERDAY, TODAY)).toBe(true);
  });

  it('پاسخ بعدی پیامک تازه می‌گیرد مگر پیامکی که رفته یا در راه است هنوز دیده نشده؛ پیامکی که نرفت خبر نبود', () => {
    const customer = message(1, 'customer', YESTERDAY);
    expect(replySmsGoes({ messages: [customer], customerSeenAt: YESTERDAY })).toBe(true);
    for (const status of ['pending', 'sending', 'sent', 'logged']) {
      expect(replySmsGoes({ messages: [customer, message(2, 'staff', TODAY, { sms: sms(status) })], customerSeenAt: YESTERDAY }), status).toBe(false);
    }
    expect(replySmsGoes({ messages: [customer, message(2, 'staff', TODAY, { sms: sms('failed') })], customerSeenAt: YESTERDAY })).toBe(true);
    // مشتری پس از آن پاسخ دید: خبر تازه.
    expect(replySmsGoes({ messages: [customer, message(2, 'staff', YESTERDAY, { sms: sms('sent') })], customerSeenAt: TODAY })).toBe(true);
  });
});
