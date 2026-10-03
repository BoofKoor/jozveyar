/**
 * تخصیص خودکار چاپخانه در پرداخت (برش ۵٫۲، ADR-042): چاپخانهٔ فعال همان شهر سفارش، وگرنه همان استان، وگرنه هر چاپخانهٔ
 * فعال؛ در هر سطح پیش‌فرض اگر آنجاست، وگرنه قدیمی‌ترین. «نزدیک‌ترین» بی مختصات شهرها همین سه سطح است. هیچ چاپخانهٔ فعالی
 * نیست؟ سفارش بی چاپخانه می‌ماند و پیشخوان هشدار می‌دهد، نه بن‌بست.
 *
 * قاعده خالص است (`choosePartner`)، تا ذخیره‌گاه حافظه‌ای تست سایت هم همین را بخواند؛ `assignAtPayment` همان را درون تراکنش
 * پرداخت (`settlePayment`) روی پستگرس اجرا می‌کند. کرایهٔ مشتری دست نمی‌خورد: سفارش با کرایهٔ استانش منجمد است (ADR-034).
 *
 * از ۷٫۶ (سؤال ۱۲۶): چاپخانه‌ای که موبایل اعلان دارد، پیامک «منتظر» سفارش تازه را در همین تراکنش می‌گیرد (`queuedPartnerSms`)، و
 * صدازننده بعد از commit می‌فرستدش؛ شکستش پرداخت را برنمی‌گرداند.
 */

import { formatDeadlineDay } from '@jozveyar/text';
import { and, eq, isNull } from 'drizzle-orm';

import type { Database } from './index.js';
import { orderAssignments, orders, printPartners } from './schema.js';
import { queuedPartnerSms } from './sms.js';

/** قاعدهٔ تخصیص خودکار: هم‌شهر مشتری، هم‌استان، چاپخانهٔ پیش‌فرض، یا قدیمی‌ترین چاپخانهٔ فعال وقتی پیش‌فرضی نیست. */
export type AssignmentRule = 'city' | 'province' | 'default' | 'oldest';

export interface PartnerCandidate {
  id: string;
  cityId: number;
  provinceId: number;
  isDefault: boolean;
  createdAt: Date;
}

/**
 * چاپخانهٔ سفارش از میان چاپخانه‌های فعال: همان شهر، وگرنه همان استان، وگرنه همه؛ در هر سطح پیش‌فرض، وگرنه قدیمی‌ترین.
 * سفارشی که شهرش در فهرست نبود (`cityId` null) از سطح استان شروع می‌کند. null یعنی هیچ چاپخانهٔ فعالی نیست.
 */
export function choosePartner(
  candidates: readonly PartnerCandidate[],
  place: { cityId: number | null; provinceId: number },
): { partnerId: string; rule: AssignmentRule } | null {
  const best = (level: readonly PartnerCandidate[]) =>
    [...level].sort(
      (a, b) =>
        Number(b.isDefault) - Number(a.isDefault) ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )[0];
  const inCity = place.cityId === null ? [] : candidates.filter((c) => c.cityId === place.cityId);
  if (inCity.length > 0) return { partnerId: best(inCity)!.id, rule: 'city' };
  const inProvince = candidates.filter((c) => c.provinceId === place.provinceId);
  if (inProvince.length > 0) return { partnerId: best(inProvince)!.id, rule: 'province' };
  const any = best(candidates);
  return any ? { partnerId: any.id, rule: any.isDefault ? 'default' : 'oldest' } : null;
}

type Tx = Parameters<Parameters<Database['db']['transaction']>[0]>[0];

/** چند بار انتخاب دوباره، اگر چاپخانهٔ انتخاب‌شده همان لحظه غیرفعال شد؛ بیشتر یعنی بی چاپخانه، با هشدار پیشخوان. */
const PICK_TRIES = 3;

/**
 * تخصیص خودکار، درون تراکنش پرداخت (پس از «در صف چاپ»): چاپخانه با `choosePartner`، و سفارش و ردیف تخصیص با قاعده‌اش. فقط
 * چاپخانهٔ انتخاب‌شده قفل می‌شود (`FOR SHARE`)، نه همه: پیش‌فرض کردنِ هم‌زمان دو ردیف را قفل می‌کند، و قفل چند ردیف به ترتیب
 * دیگر بن‌بست می‌ساخت که پرداخت را برمی‌گرداند. چاپخانه‌ای که همان لحظه غیرفعال شد، پس از قفل دیگر پیدا نمی‌شود و انتخاب از
 * نو است؛ پس غیرفعال کردن هم‌زمان هیچ‌وقت پرداخت را نمی‌شکند.
 *
 * موبایل اعلان پس از همان قفل خوانده می‌شود، پس ویرایش هم‌زمانش یا پیش از این است یا پس از این تراکنش (تریگر
 * `order_assignments_partner_sms` همان شماره را می‌خواهد). `smsId` پیامک سفارش تازهٔ چاپخانه است، یا null بی موبایل اعلان.
 */
export async function assignAtPayment(
  tx: Tx,
  order: { id: string; orderNumber: number; cityId: number | null; provinceId: number; postHandoffDueAt: Date | null },
  at: Date,
): Promise<{ partnerId: string; rule: AssignmentRule; smsId: number | null } | null> {
  for (let i = 0; i < PICK_TRIES; i += 1) {
    const candidates = await tx
      .select({
        id: printPartners.id,
        cityId: printPartners.cityId,
        provinceId: printPartners.provinceId,
        isDefault: printPartners.isDefault,
        createdAt: printPartners.createdAt,
      })
      .from(printPartners)
      .where(isNull(printPartners.deactivatedAt));
    const chosen = choosePartner(candidates, order);
    if (!chosen) return null;
    const [locked] = await tx
      .select({ id: printPartners.id, notifyMobile: printPartners.notifyMobile })
      .from(printPartners)
      .where(and(eq(printPartners.id, chosen.partnerId), isNull(printPartners.deactivatedAt)))
      .limit(1)
      .for('share');
    if (!locked) continue;
    await tx.update(orders).set({ printPartnerId: chosen.partnerId }).where(eq(orders.id, order.id));
    const smsId = await partnerSmsOf(tx, locked.notifyMobile, order, at);
    await tx.insert(orderAssignments).values({
      orderId: order.id,
      fromPartnerId: null,
      toPartnerId: chosen.partnerId,
      at,
      actor: 'system',
      rule: chosen.rule,
      smsMessageId: smsId,
    });
    return { ...chosen, smsId };
  }
  return null;
}

/**
 * پیامک «منتظر» سفارش تازه برای چاپخانه‌ای که موبایل اعلان دارد (برش ۷٫۶)، درون همان تراکنش تخصیص؛ null بی موبایل. پرداخت و جابه‌جایی پنل
 * (`assignPartner`) هر دو از همین. سفارش «در صف چاپ» همیشه مهلت دارد (`orders_paid_has_dates`).
 */
export async function partnerSmsOf(
  tx: Pick<Tx, 'insert'>,
  notifyMobile: string | null,
  order: { orderNumber: number; postHandoffDueAt: Date | null },
  at: Date,
): Promise<number | null> {
  if (!notifyMobile) return null;
  if (!order.postHandoffDueAt) throw new Error(`سفارش ${order.orderNumber} مهلت تحویل به پست ندارد.`);
  return queuedPartnerSms(tx, {
    toMobile: notifyMobile,
    orderNumber: order.orderNumber,
    handoffDay: formatDeadlineDay(order.postHandoffDueAt),
    at,
  });
}
