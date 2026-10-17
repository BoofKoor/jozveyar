/**
 * سند خروجی گزارش ارسال (برش ۶٫۴؛ خروجی از ۱۰٫۲، ADR-061، سؤال‌های ۲۰۲ و ۲۸۰): همان کاشی‌ها و جدول‌های صفحهٔ گزارش، از همان جمع‌ها
 * (`aggregateReport`)، و فهرست سفارش‌های «تحویل پست شد» ماه، با کد رهگیری یا بی آن. مبلغ تومان گردشده (عدد، منفی برای حاشیهٔ زیان)،
 * درصد و نسبت متن، مثل صفحه. خالص.
 */

import type { ShippingReportOrder } from '@jozveyar/db';

import {
  bandLabel,
  inKilos,
  marginRials,
  monthKey,
  monthLabel,
  NO_PARTNER,
  percentText,
  ratioText,
  roundDiv,
  tomansOf,
  tookRials,
  type JalaliMonth,
  type ReportGroup,
  type ReportSums,
  type ShippingReport,
} from './report';
import { madeText, segText, type ReportCell, type ReportDocument, type ReportTable } from './reportDocument';

const tomans = (rials: bigint) => Number(tomansOf(rials));
const averageOf = (sum: bigint, count: number) => (count > 0 ? Number(roundDiv(sum, BigInt(count))) : null);

function groupRow(group: ReportSums & { label: string }): ReportCell[] {
  const margin = marginRials(group);
  return [group.label, group.orders, group.parcels, tomans(group.paidRials), tomans(tookRials(group)), tomans(margin), percentText(margin, group.paidRials)];
}

function groupTable(title: string, head: string, groups: readonly ReportGroup[], total?: ReportSums): ReportTable {
  return {
    title,
    columns: [
      { label: head },
      { label: 'سفارش', numeric: true },
      { label: 'بسته', numeric: true },
      { label: 'مشتری داد (تومان)', numeric: true },
      { label: 'پست گرفت (تومان)', numeric: true },
      { label: 'حاشیه (تومان)', numeric: true },
      { label: 'حاشیه از کرایهٔ مشتری' },
    ],
    rows: groups.map(groupRow),
    total: total ? groupRow({ ...total, label: 'همه' }) : null,
  };
}

/** سند خروجی گزارش ارسال یک ماه. `rows` همان سفارش‌هایی که جمع‌ها از آن‌اند (`handedOrders`)، به ترتیب شماره. */
export function shippingDocument(input: {
  report: ShippingReport;
  rows: readonly ShippingReportOrder[];
  month: JalaliMonth;
  current: boolean;
  bounds: readonly number[];
  made: { at: Date; by: string };
}): ReportDocument {
  const { report, rows, month, current, bounds, made } = input;
  const { total } = report;
  const kilos = inKilos(bounds);
  const tables: ReportTable[] =
    total.orders === 0
      ? []
      : [groupTable('به تفکیک منطقه', 'منطقه', report.zones, total), groupTable('به تفکیک چاپخانه', 'چاپخانه', report.partners)];
  tables.push({
    title: 'وزن واقعی در برابر برآورد',
    columns: [
      { label: 'بازهٔ برآورد' },
      { label: 'سفارش', numeric: true },
      { label: 'برآورد، میانگین (گرم)', numeric: true },
      { label: 'واقعی، میانگین (گرم)', numeric: true },
      { label: 'واقعی ÷ برآورد' },
    ],
    rows: report.weights.map((row) => [
      segText(bandLabel(row.band, kilos)),
      row.orders,
      averageOf(row.estimateGrams, row.orders),
      averageOf(row.actualGrams, row.orders),
      ratioText(row.actualGrams, row.estimateGrams),
    ]),
    note: 'وزن واقعی جمع بسته‌های هر سفارش است.',
  });
  return {
    title: 'گزارش ارسال',
    subtitle: `${segText(monthLabel(month, current))} · به روز «تحویل پست شد» · مبلغ‌ها تومان`,
    made: madeText(made.at, made.by),
    notes:
      report.untracked > 0
        ? [`${report.untracked} سفارش تحویل پست‌شدهٔ این ماه هنوز کد رهگیری ندارد و در جمع‌ها نیست.`]
        : [],
    stats: [
      { label: 'سفارش با کد رهگیری', value: total.orders },
      { label: 'بسته', value: total.parcels },
      { label: 'مشتری داد (تومان)', value: tomans(total.paidRials) },
      { label: 'پست گرفت (تومان)', value: tomans(tookRials(total)) },
      { label: 'حاشیه (تومان)', value: tomans(marginRials(total)) },
      { label: 'بی کد رهگیری', value: report.untracked },
    ],
    tables,
    detail:
      rows.length === 0
        ? null
        : {
            title: 'سفارش‌ها',
            columns: [
              { label: 'شماره', numeric: true, plain: true },
              { label: 'منطقه' },
              { label: 'چاپخانه' },
              { label: 'بسته', numeric: true },
              { label: 'کرایهٔ مشتری (تومان)', numeric: true },
              { label: 'کرایهٔ پست (تومان)', numeric: true },
              { label: 'مالیات پست (تومان)', numeric: true },
              { label: 'وزن برآورد (گرم)', numeric: true },
              { label: 'وزن واقعی (گرم)', numeric: true },
            ],
            rows: rows.map((row) => [
              row.orderNumber,
              row.zoneName,
              row.partner ? `${row.partner.name} · ${row.partner.cityName}` : NO_PARTNER,
              row.parcels,
              tomans(row.shippingRials),
              row.parcels > 0 ? tomans(row.fareRials) : null,
              row.parcels > 0 ? tomans(row.taxRials) : null,
              row.estWeightGrams,
              row.parcels > 0 ? row.weightGrams : null,
            ]),
            note: 'سفارش بی بسته هنوز کد رهگیری ندارد؛ کرایه و وزن پست برایش نیست.',
          },
    fileBase: `gozaresh-ersal-${monthKey(month)}`,
  };
}
