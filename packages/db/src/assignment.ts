/**
 * تخصیص چاپخانه در پرداخت (برش ۵٫۲، ADR-042؛ از ۱۰٫۱ با فاصله، «شلوغ» و «تعطیل»، ADR-060): همان شهر سفارش، وگرنه همان استان، وگرنه
 * نزدیک‌ترین؛ در هر سطح نزدیک‌ترین به شهر مشتری، و در برابری پیش‌فرض و بعد قدیمی‌ترین (سؤال‌های ۱۹۸ و ۲۶۳). هیچ چاپخانهٔ فعالی
 * نیست؟ سفارش بی چاپخانه می‌ماند و پیشخوان هشدار می‌دهد، نه بن‌بست.
 *
 * قاعده خالص است (`rankPartners` در `rank.ts`)، تا ذخیره‌گاه حافظه‌ای تست سایت، فهرست پیشنهادی پنل (حالت دستی، سؤال ۱۹۹) و تست سرتاسری
 * پنل هم همین را بخوانند؛ `assignAtPayment` همان را درون تراکنش پرداخت (`settlePayment`) روی پستگرس اجرا می‌کند. کرایهٔ مشتری دست نمی‌خورد: سفارش با
 * کرایهٔ استانش منجمد است (ADR-034).
 *
 * از ۷٫۶ (سؤال ۱۲۶): چاپخانه‌ای که موبایل اعلان دارد، پیامک «منتظر» سفارش تازه را در همین تراکنش می‌گیرد (`queuedPartnerSms`)، و
 * صدازننده بعد از commit می‌فرستدش؛ شکستش پرداخت را برنمی‌گرداند.
 */

import { SETTING_SCHEMAS, type AssignmentMode } from '@jozveyar/contracts';
import { formatDeadlineDay } from '@jozveyar/text';
import { and, eq, isNull } from 'drizzle-orm';

import type { Database } from './index.js';
import { choosePartner, type PartnerAvailability, type RankedPartner } from './rank.js';
import { ASSIGNMENT_MODE_SETTING } from './reference.js';
import { orderAssignments, orders, printPartners, settings } from './schema.js';
import { queuedPartnerSms } from './sms.js';

export * from './rank.js';

type Tx = Parameters<Parameters<Database['db']['transaction']>[0]>[0];

/** حالت تخصیص، درون همان تراکنش؛ نبود یا مقدار خراب یعنی `auto` (رفتار پیش از ۱۰٫۱). */
async function assignmentMode(tx: Tx): Promise<AssignmentMode> {
  const [row] = await tx.select({ value: settings.value }).from(settings).where(eq(settings.key, ASSIGNMENT_MODE_SETTING)).limit(1);
  const parsed = SETTING_SCHEMAS[ASSIGNMENT_MODE_SETTING].safeParse(row?.value);
  return parsed.success ? parsed.data : 'auto';
}

/** ستون‌های چاپخانه برای `rankPartners`. */
export const partnerCandidateColumns = {
  id: printPartners.id,
  cityId: printPartners.cityId,
  provinceId: printPartners.provinceId,
  isDefault: printPartners.isDefault,
  createdAt: printPartners.createdAt,
  availability: printPartners.availability,
  closedFrom: printPartners.closedFrom,
  closedUntil: printPartners.closedUntil,
};

/** ردیف خام چاپخانه به نامزد تخصیص (`availability` در پایگاه داده فقط یکی از سه مقدار است، `print_partners_closed`). */
export function partnerCandidateOf<R extends { availability: string }>(row: R): R & { availability: PartnerAvailability } {
  return row as R & { availability: PartnerAvailability };
}

/** چند بار انتخاب دوباره، اگر چاپخانهٔ انتخاب‌شده همان لحظه غیرفعال شد؛ بیشتر یعنی بی چاپخانه، با هشدار پیشخوان. */
const PICK_TRIES = 3;

/**
 * تخصیص خودکار، درون تراکنش پرداخت (پس از «در صف چاپ»): چاپخانه با `choosePartner`، و سفارش و ردیف تخصیص با قاعده‌اش. فقط
 * چاپخانهٔ انتخاب‌شده قفل می‌شود (`FOR SHARE`)، نه همه: پیش‌فرض کردنِ هم‌زمان دو ردیف را قفل می‌کند، و قفل چند ردیف به ترتیب
 * دیگر بن‌بست می‌ساخت که پرداخت را برمی‌گرداند. چاپخانه‌ای که همان لحظه غیرفعال شد، پس از قفل دیگر پیدا نمی‌شود و انتخاب از
 * نو است؛ پس غیرفعال کردن هم‌زمان هیچ‌وقت پرداخت را نمی‌شکند. «شلوغ» یا «تعطیل» شدن هم‌زمان پرداخت را نگه نمی‌دارد: انتخاب با حال
 * همان لحظهٔ خواندن است، و سفارش در صف چاپخانه‌ای که همان لحظه تعطیل شد در هشدار پیشخوان دیده می‌شود.
 *
 * حالت دستی (`assignment.mode`، سؤال ۱۹۹): هیچ تخصیصی نیست و سفارش بی چاپخانه می‌ماند تا متصدی بسپاردش (null، مثل نبود چاپخانهٔ
 * فعال). حالت در همین تراکنش خوانده می‌شود.
 *
 * موبایل اعلان پس از همان قفل خوانده می‌شود، پس ویرایش هم‌زمانش یا پیش از این است یا پس از این تراکنش (تریگر
 * `order_assignments_partner_sms` همان شماره را می‌خواهد). `smsId` پیامک سفارش تازهٔ چاپخانه است، یا null بی موبایل اعلان.
 */
export async function assignAtPayment(
  tx: Tx,
  order: { id: string; orderNumber: number; cityId: number | null; provinceId: number; postHandoffDueAt: Date | null },
  at: Date,
): Promise<{ partnerId: string; rule: RankedPartner['rule']; smsId: number | null } | null> {
  if ((await assignmentMode(tx)) === 'manual') return null;
  for (let i = 0; i < PICK_TRIES; i += 1) {
    const candidates = (await tx.select(partnerCandidateColumns).from(printPartners).where(isNull(printPartners.deactivatedAt))).map(
      partnerCandidateOf,
    );
    const chosen = choosePartner(candidates, order, at);
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
