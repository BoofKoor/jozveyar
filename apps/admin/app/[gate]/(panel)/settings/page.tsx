import type { Metadata } from 'next';
import Link from 'next/link';

import { SETTING_SCHEMAS, type Holiday } from '@jozveyar/contracts';
import { OTP_FIXED_LIMITS } from '@jozveyar/db';
import { templateText } from '@jozveyar/sms';
import { formatJalaliNumeric, formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../components/Alert';
import { HolidayAddForm } from '../../../../components/HolidayAddForm';
import { KeyForm } from '../../../../components/KeyForm';
import { KeyTestButton, TemplateTestForm } from '../../../../components/KeyTestForm';
import { NoAccess } from '../../../../components/NoAccess';
import { NumberSettingForm } from '../../../../components/NumberSettingForm';
import { OtpLimitsForm } from '../../../../components/OtpLimitsForm';
import { Segments } from '../../../../components/Segments';
import { StatusButton } from '../../../../components/StatusButton';
import { TemplateKeyForm } from '../../../../components/TemplateKeyForm';
import { panelPath } from '../../../../lib/gate';
import { messageOf } from '../../../../lib/messages';
import { can } from '../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../lib/server/context';
import type { KeyView } from '../../../../lib/server/settings';
import {
  HOLIDAYS_SHOWN,
  KEY_INFO,
  KEY_TESTS_PER_HOUR,
  TEMPLATE_SAMPLES,
  creditCard,
  holidaysView,
  keyCheckView,
  maskText,
  otpUsageSegs,
  templateView,
  type KeyCheckView,
} from '../../../../lib/settings';
import { confirmHolidaysAction, removeHolidayAction } from '../../actions';

export const metadata: Metadata = { title: 'تنظیمات' };

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');

const SLA = SETTING_SCHEMAS['order.sla_days'];
const OTP = SETTING_SCHEMAS['otp.site_hourly_limit'];
const OTP_DAY = SETTING_SCHEMAS['otp.site_daily_limit'];
const KEEP = SETTING_SCHEMAS['order.files_retention_days'];
const CREDIT = SETTING_SCHEMAS['sms.credit_alert_days'];

/** رنگ خط آزمایش (کلاس کامل و ثابت، برای آیکون‌های کیت). */
const CHECK_ICONS: Record<KeyCheckView['tone'], string> = {
  ok: 'jy-icon jy-icon-success is-ok',
  bad: 'jy-icon jy-icon-error is-bad',
  warn: 'jy-icon jy-icon-warning is-warn',
};
const CHECK_TONES = { ok: 'success', bad: 'error', warn: 'warning' } as const;

/** متن قالب در sms.ir (طرح `ad-keys__tpl`): سطرها، جای پارامترها، و نامشان؛ از همان یک منبع پیامک. */
function TemplateText({ purpose }: { purpose: keyof typeof TEMPLATE_SAMPLES }) {
  const { lines, params } = templateView(purpose);
  return (
    <p className="ad-keys__tpl" data-template={purpose}>
      متن در sms.ir{lines.length > 1 ? `، ${lines.length === 2 ? 'دو' : lines.length} خط` : ''}: «
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 ? <br /> : null}
          {line.map((part, j) => (typeof part === 'string' ? <span key={j}>{part}</span> : <code key={j}>{part.mark}</code>))}
        </span>
      ))}
      » · {params.length === 1 ? 'پارامتر' : 'پارامترها'}:{' '}
      {params.map((param, i) => (
        <span key={param}>
          {i > 0 ? '، ' : ''}
          <code>{param}</code>
        </span>
      ))}
    </p>
  );
}

/** یک روز تعطیل با «حذف»، بی پرسش: برگشت‌پذیر است و مهلت سفارش‌های ثبت‌شده عوض نمی‌شود. */
function Day({ gate, day }: { gate: string; day: Holiday }) {
  return (
    <li data-date={day.date}>
      <span className="ad-days__date num">{day.date}</span>
      <span className="ad-days__title">{day.title}</span>
      <form action={removeHolidayAction}>
        <input type="hidden" name="gate" value={gate} />
        <input type="hidden" name="date" value={day.date} />
        <button type="submit" className="jy-btn jy-btn--text jy-btn--icon" aria-label={`حذف ${day.date}`}>
          <span className="jy-icon jy-icon-close" aria-hidden="true" />
        </button>
      </form>
    </li>
  );
}

/** منبع کلید: نشان خنثی (طرح)، و «خوانده نشد» با آیکون خطا. */
function SourceBadge({ source }: { source: KeyView['source'] }) {
  switch (source) {
    case 'panel':
      return <span className="jy-badge jy-badge--neutral">از پنل</span>;
    case 'env':
      return (
        <span className="jy-badge jy-badge--neutral">
          از <bdi className="ad-ltr">.env</bdi>
        </span>
      );
    case 'empty':
      return <span className="jy-badge jy-badge--neutral">خالی</span>;
    case 'unreadable':
      return (
        <span className="jy-badge jy-badge--error">
          <span className="jy-icon jy-icon-error" aria-hidden="true" />
          خوانده نشد
        </span>
      );
  }
}

/**
 * تنظیمات (طرح پنل `m-settings` و `m-key-edit`، ADR-041): روز کاری تحویل به پست، سقف کد پیامکی، تعطیلی‌ها، و کلیدهای سرویس‌ها. فقط
 * مالک، و سرور هر کار را خودش می‌سنجد. کلید با «تغییر» همین‌جا باز می‌شود (`?key=`)، و «برگرداندن به .env» با `?revert=`، هر دو با
 * کد تازه و بی JS. از ۷٫۱ (ADR-049، طرح برش ۷): سقف ۲۴ ساعتهٔ کد کنار ساعتی با شمار واقعی، کارت «اعتبار پیامک»، و برای کلیدهای sms.ir
 * متن قالب، خط آخرین آزمایش و «آزمایش» (کلید API یک دکمه، قالب با موبایل پیامک آزمایشی، `?test=`).
 */
export default async function SettingsPage({ params, searchParams }: { params: Promise<{ gate: string }>; searchParams: Promise<Query> }) {
  const { gate } = await params;
  const query = await searchParams;
  const { settings } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'settings.edit') && !can(session, 'secrets.edit')) return <NoAccess gate={gate} partner={session.partner} />;
  const result = await settings.overview(session);
  if (!result.ok) return <NoAccess gate={gate} partner={session.partner} />;
  const { now, values, keys, otpUsage, credit } = result.value;
  const card = credit ? creditCard(credit, now) : null;

  const home = panelPath(gate, '/settings');
  const done = one(query, 'done');
  const error = one(query, 'e');
  // فرم‌ها با هر کار موفق از نو سوار می‌شوند (نشان `n`)، تا خطای قبلی با کار بعدی نماند.
  const mark = one(query, 'n');
  const v = Number(one(query, 'v'));
  const topNote =
    error === 'setting_changed' ? (
      <Alert tone="error">{messageOf(error)}</Alert>
    ) : values && done === 'order.sla_days' && v === values.slaDays ? (
      <Alert tone="success">
        روز کاری تحویل به پست ذخیره شد: <span className="num">{v}</span>. سفارش‌های تازه با همین حساب می‌شوند و صفحهٔ اصلی سایت تا
        یک دقیقه عدد تازه را نشان می‌دهد.
      </Alert>
    ) : values && done === 'otp_limits' && Number(one(query, 'h')) === values.otpLimit && Number(one(query, 'd')) === values.otpDailyLimit ? (
      <Alert tone="success">
        سقف کد پیامکی کل سایت ذخیره شد: <span className="num">{formatNumber(values.otpLimit)}</span> کد در ساعت و{' '}
        <span className="num">{formatNumber(values.otpDailyLimit)}</span> کد در <span className="num">24</span> ساعت.
      </Alert>
    ) : values && done === 'order.files_retention_days' && v === values.retentionDays ? (
      <Alert tone="success">
        روزهای نگهداری فایل‌های سفارش ذخیره شد: <span className="num">{v}</span> روز. کارگر در دور بعدش با همین پاک می‌کند.
      </Alert>
    ) : values && done === 'sms.credit_alert_days' && v === values.creditAlertDays ? (
      <Alert tone="success">
        آستانهٔ هشدار اعتبار پیامک ذخیره شد: <span className="num">{v}</span> روز مصرف.
      </Alert>
    ) : null;

  const days = values ? holidaysView(values.holidays, values.officialThrough, now) : null;
  // پیام‌ها فقط با شکل درست (روز و سال)، تا نشانی ساختگی متن دلخواه در پیام ننشاند.
  const dayDone = /^\d{4}\/\d{2}\/\d{2}$/.test(one(query, 'd')) ? one(query, 'd') : '';
  const yearDone = /^\d{4}$/.test(one(query, 'y')) ? Number(one(query, 'y')) : null;
  const inList = (date: string) => values?.holidays.some((day) => day.date === date) ?? false;
  const holidayNote =
    done === 'holiday_add' && dayDone && inList(dayDone) ? (
      <Alert tone="success">
        تعطیلی <span className="num">{dayDone}</span> افزوده شد.
      </Alert>
    ) : done === 'holiday_remove' && dayDone && !inList(dayDone) ? (
      <Alert tone="success">
        تعطیلی <span className="num">{dayDone}</span> حذف شد.
      </Alert>
    ) : error === 'holiday_missing' ? (
      <Alert tone="info">{messageOf(error)}</Alert>
    ) : done === 'official' && values && yearDone !== null && yearDone <= values.officialThrough ? (
      <Alert tone="success">
        تعطیلی‌های <span className="num">{yearDone}</span> با تقویم رسمی تطبیق‌داده‌شده ثبت شد.
      </Alert>
    ) : error === 'invalid_setting' ? (
      <Alert tone="error">{messageOf(error)}</Alert>
    ) : null;

  const keyDone = one(query, 'k');
  const doneKey = keys.find((key) => key.name === keyDone);
  const doneCheck = done === 'key_test' && doneKey ? keyCheckView(doneKey.name, doneKey.check, now) : null;
  const keyNote =
    error === 'key_changed' || error === 'key_not_found' || error === 'forbidden' || error === 'key_empty' || error === 'key_not_testable' ? (
      <Alert tone="error">{messageOf(error)}</Alert>
    ) : error === 'key_test_limited' ? (
      <Alert tone="warning">{messageOf(error)}</Alert>
    ) : doneCheck && doneKey ? (
      <Alert tone={CHECK_TONES[doneCheck.tone]}>
        «{KEY_INFO[doneKey.name].label}»: <Segments segs={doneCheck.text} />
      </Alert>
    ) : done === 'key_set' && doneKey?.source === 'panel' ? (
      <Alert tone="success">«{KEY_INFO[doneKey.name].label}» ذخیره شد؛ از این لحظه مقدار پنل به کار می‌رود.</Alert>
    ) : done === 'key_revert' && doneKey && doneKey.source !== 'panel' ? (
      <Alert tone="success">
        «{KEY_INFO[doneKey.name].label}» به <bdi className="ad-ltr">.env</bdi> برگشت
        {doneKey.source === 'empty' ? '؛ .env این کلید را ندارد و کلید خالی است.' : '.'}
      </Alert>
    ) : null;
  const editing = one(query, 'key');
  const reverting = one(query, 'revert');
  const testing = one(query, 'test');

  return (
    <>
      <div className="ad-pagehead">
        <h1 className="ad-title">تنظیمات</h1>
      </div>
      {topNote ? <div className="ad-flash">{topNote}</div> : null}
      <div className="ad-stack">
        {values && days ? (
          <>
            <div className="ad-cards">
              <NumberSettingForm
                key={`sla:${values.slaDays}:${mark}`}
                gate={gate}
                settingKey="order.sla_days"
                id="sla"
                title="تحویل به پست"
                label="روز کاری بعد از پرداخت"
                value={values.slaDays}
                min={SLA.minValue ?? 1}
                max={SLA.maxValue ?? 30}
                stepper
                rangeError={`روز کاری عدد صحیح ${SLA.minValue} تا ${SLA.maxValue} باشد.`}
                hint={
                  <>
                    روز کاری شنبه تا چهارشنبه است، بی تعطیلی رسمی. سایت («تحویل پست تا <span className="num">{values.slaDays}</span> روز
                    کاری») و سفارش‌های تازه از همین می‌خوانند؛ سفارش ثبت‌شده مهلت خودش را دارد.
                  </>
                }
              />
              <OtpLimitsForm
                key={`otp:${values.otpLimit}:${values.otpDailyLimit}:${mark}`}
                gate={gate}
                hour={values.otpLimit}
                day={values.otpDailyLimit}
                hourError={`سقف ساعتی عدد صحیح ${formatNumber(OTP.minValue ?? 1)} تا ${formatNumber(OTP.maxValue ?? 100_000)} باشد.`}
                dayError={`سقف 24 ساعته عدد صحیح ${formatNumber(OTP_DAY.minValue ?? 1)} تا ${formatNumber(OTP_DAY.maxValue ?? 1_000_000)} باشد.`}
                usage={otpUsage ? <Segments segs={otpUsageSegs(otpUsage)} /> : null}
                hint={
                  <>
                    ترمز آخر در برابر ربات؛ پر شدن هر کدام هشدار پیشخوان است. ثابت‌ها: هر مرورگر{' '}
                    <span className="num">{OTP_FIXED_LIMITS.browserHour}</span> در ساعت؛ هر شماره <span className="num">{OTP_FIXED_LIMITS.mobileHour}</span> در
                    ساعت و <span className="num">{OTP_FIXED_LIMITS.mobileDay}</span> در <span className="num">24</span> ساعت؛ هر اینترنت{' '}
                    <span className="num">{OTP_FIXED_LIMITS.ipHour}</span> در ساعت؛ و کد فقط برای مرورگری که جزوهٔ آماده روی سرور دارد.
                  </>
                }
              />
              <NumberSettingForm
                key={`keep:${values.retentionDays}:${mark}`}
                gate={gate}
                settingKey="order.files_retention_days"
                id="keep"
                title="فایل‌های سفارش"
                label="روز نگهداری بعد از «تحویل پست شد» یا «لغو شد»"
                value={values.retentionDays}
                min={KEEP.minValue ?? 7}
                max={KEEP.maxValue ?? 365}
                stepper
                rangeError={`روز نگهداری عدد صحیح ${KEEP.minValue} تا ${KEEP.maxValue} باشد.`}
                hint="PDF جزوه، فایل چاپ و برگه بعد از این پاک می‌شوند تا دیسک پر نشود؛ تا آن موقع اگر بسته گم شد، دوباره چاپ می‌شود. سفارش باز هرگز. مشخصات و رویدادها می‌مانند."
              />
              <NumberSettingForm
                key={`credit:${values.creditAlertDays}:${mark}`}
                gate={gate}
                settingKey="sms.credit_alert_days"
                id="credit"
                title="اعتبار پیامک"
                meta={card?.meta ?? undefined}
                lead={
                  card ? (
                    <>
                      {card.amount !== null ? (
                        <p className="ad-credit" data-credit="">
                          <span className="num">{card.amount}</span>
                          <small>اعتبار sms.ir</small>
                        </p>
                      ) : null}
                      {card.usage ? (
                        <p className="ad-usage">
                          <Segments segs={card.usage} />
                        </p>
                      ) : null}
                      {card.note ? (
                        <Alert tone={card.note.tone}>
                          <Segments segs={card.note.text} />
                        </Alert>
                      ) : null}
                    </>
                  ) : null
                }
                label="هشدار پیشخوان وقتی اعتبار کمتر از این شد (روز مصرف)"
                value={values.creditAlertDays}
                min={CREDIT.minValue ?? 1}
                max={CREDIT.maxValue ?? 90}
                stepper
                rangeError={`روز مصرف عدد صحیح ${CREDIT.minValue} تا ${CREDIT.maxValue} باشد.`}
                hint="اعتبار را از پنل sms.ir شارژ کن. بی اعتبار، کد تأیید نمی‌رود و کسی نمی‌تواند سفارش بدهد."
              />
            </div>

            <section id="holidays" className="jy-card" aria-labelledby="t-hol">
              <div className="jy-card__head">
                <h2 id="t-hol" className="jy-card__title">
                  تعطیلی‌های رسمی
                </h2>
                <span className="jy-card__meta">روز کاری تحویل به پست این روزها را نمی‌شمارد</span>
              </div>
              {holidayNote}
              {days.unconfirmedYear ? (
                <div className="jy-note jy-note--warning ad-gap" data-note="unconfirmed">
                  <span className="jy-icon jy-icon-warning" aria-hidden="true" />
                  <div>
                    <p>
                      تاریخ تعطیلی‌های قمری <span className="num">{days.unconfirmedYear}</span> هنوز پیش‌بینی است. با انتشار تقویم رسمی{' '}
                      <span className="num">{days.unconfirmedYear}</span> تطبیقشان بده.
                    </p>
                    <form action={confirmHolidaysAction} className="ad-note-form">
                      <input type="hidden" name="gate" value={gate} />
                      <input type="hidden" name="year" value={days.unconfirmedYear} />
                      <StatusButton className="jy-btn jy-btn--text">
                        <span>
                          با تقویم رسمی <span className="num">{days.unconfirmedYear}</span> تطبیق دادم
                        </span>
                      </StatusButton>
                    </form>
                  </div>
                </div>
              ) : null}
              {days.missingYear ? (
                <p className="jy-note jy-note--warning ad-gap" data-note="missing">
                  <span className="jy-icon jy-icon-warning" aria-hidden="true" />
                  <span>
                    تعطیلی‌های <span className="num">{days.missingYear}</span> هنوز در فهرست نیست. نوروز و تعطیلی‌های{' '}
                    <span className="num">{days.missingYear}</span> را پیش از پایان سال وارد کن: مهلت سفارش‌های اسفند به آنها می‌رسد.
                  </span>
                </p>
              ) : null}
              {days.upcoming.length ? (
                <ul className="ad-days ad-gap" data-days="upcoming">
                  {days.upcoming.slice(0, HOLIDAYS_SHOWN).map((day) => (
                    <Day key={day.date} gate={gate} day={day} />
                  ))}
                </ul>
              ) : (
                <p className="ad-lead ad-gap">هیچ تعطیلی آینده‌ای در فهرست نیست.</p>
              )}
              {days.upcoming.length > HOLIDAYS_SHOWN ? (
                <details className="ad-more-days" data-days="rest">
                  <summary className="jy-btn jy-btn--text ad-add">
                    <span className="ad-more-days__open">
                      همه را ببین (<span className="num">{days.upcoming.length}</span> روز تا پایان{' '}
                      <span className="num">{days.lastYear}</span>)
                    </span>
                    <span className="ad-more-days__close">فقط {HOLIDAYS_SHOWN === 5 ? 'پنج' : HOLIDAYS_SHOWN} روز نزدیک</span>
                    <span className="jy-icon jy-icon-chevron" aria-hidden="true" />
                  </summary>
                  <ul className="ad-days">
                    {days.upcoming.slice(HOLIDAYS_SHOWN).map((day) => (
                      <Day key={day.date} gate={gate} day={day} />
                    ))}
                  </ul>
                </details>
              ) : null}
              {days.past.length ? (
                <details className="ad-more-days" data-days="past">
                  <summary className="jy-btn jy-btn--text ad-add">
                    <span>
                      روزهای گذشتهٔ فهرست (<span className="num">{days.past.length}</span>)
                    </span>
                    <span className="jy-icon jy-icon-chevron" aria-hidden="true" />
                  </summary>
                  <p className="ad-hint">روز گذشته روی مهلت هیچ سفارشی اثر ندارد، و پاک کردنش مهلت سفارش‌های ثبت‌شده را عوض نمی‌کند.</p>
                  <ul className="ad-days">
                    {days.past.map((day) => (
                      <Day key={day.date} gate={gate} day={day} />
                    ))}
                  </ul>
                </details>
              ) : null}
              <HolidayAddForm key={`add:${mark}`} gate={gate} maxYear={days.maxYear} />
            </section>
          </>
        ) : null}

        {keys.length ? (
          <section id="keys" className="jy-card" aria-labelledby="t-keys">
            <div className="jy-card__head">
              <h2 id="t-keys" className="jy-card__title">
                کلیدهای سرویس‌ها
              </h2>
              <span className="jy-card__meta">فقط مالک</span>
            </div>
            {keyNote}
            <p className="jy-note jy-note--info ad-gap">
              <span className="jy-icon jy-icon-lock" aria-hidden="true" />
              <span>
                کلیدها رمزشده نگه داشته می‌شوند و کاملشان دیگر نشان داده نمی‌شود؛ شناسهٔ قالب راز نیست و کامل دیده می‌شود. مقدار پنل بر
                مقدار <bdi className="ad-ltr">.env</bdi> مقدم است. هر مقدار تازهٔ sms.ir پیش از ذخیره با خود sms.ir آزموده می‌شود، و «آزمایش»
                مقدار امروز را بی تغییر می‌سنجد.
              </span>
            </p>
            <ul className="ad-keys ad-gap">
              {keys.map((key) => {
                const info = KEY_INFO[key.name];
                const template = info.kind === 'template';
                const panelValue = key.source === 'panel' || key.source === 'unreadable';
                const hasValue = key.source === 'panel' || key.source === 'env';
                const check = hasValue ? keyCheckView(key.name, key.check, now) : null;
                const open =
                  editing === key.name
                    ? 'set'
                    : reverting === key.name && panelValue
                      ? 'revert'
                      : testing === key.name && template && info.testable && hasValue
                        ? 'test'
                        : null;
                const back = `${home}#key-${key.name}`;
                return (
                  <li key={key.name} id={`key-${key.name}`} data-key={key.name} data-source={key.source}>
                    <div>
                      <p className="ad-keys__name">{info.label}</p>
                      <p className="ad-keys__meta">
                        <SourceBadge source={key.source} />
                        {hasValue && template && key.value ? <span className="num">{key.value}</span> : null}
                        {hasValue && !template ? <span className="ad-mask">{maskText(info.dots, key.tail)}</span> : null}
                        {key.source === 'empty' ? <span>{info.about}</span> : null}
                        {key.source === 'unreadable' ? (
                          <span>
                            با <bdi className="ad-ltr">SECRETS_KEY</bdi> امروز باز نمی‌شود؛ دوباره واردش کن، یا به <bdi className="ad-ltr">.env</bdi>{' '}
                            برگردان.
                          </span>
                        ) : null}
                        {panelValue && key.updatedAt ? (
                          <span>
                            {key.updatedBy ? `${key.updatedBy}، ` : ''}
                            <span className="num">{formatJalaliNumeric(key.updatedAt)}</span>
                          </span>
                        ) : null}
                      </p>
                      {template && info.purpose ? <TemplateText purpose={info.purpose} /> : null}
                      {check ? (
                        <p className="ad-keys__test" data-check={check.tone}>
                          <span className={CHECK_ICONS[check.tone]} aria-hidden="true" />
                          <span>
                            <Segments segs={check.text} />
                          </span>
                        </p>
                      ) : null}
                    </div>
                    <div className="ad-keys__btns">
                      {info.testable && hasValue ? (
                        template ? (
                          <Link
                            href={`${home}?test=${key.name}#key-${key.name}`}
                            className="jy-btn jy-btn--text"
                            aria-current={open === 'test' ? 'true' : undefined}
                          >
                            آزمایش
                          </Link>
                        ) : (
                          <KeyTestButton gate={gate} name={key.name} />
                        )
                      ) : null}
                      <Link href={`${home}?key=${key.name}#key-${key.name}`} className="jy-btn jy-btn--text" aria-current={open === 'set' ? 'true' : undefined}>
                        {key.source === 'empty' ? 'وارد کن' : 'تغییر'}
                      </Link>
                      {panelValue ? (
                        <Link href={`${home}?revert=${key.name}#key-${key.name}`} className="jy-btn jy-btn--text" aria-current={open === 'revert' ? 'true' : undefined}>
                          <span>
                            برگرداندن به <bdi className="ad-ltr">.env</bdi>
                          </span>
                        </Link>
                      ) : null}
                    </div>
                    {open ? (
                      <div className="ad-keys__form">
                        {open === 'test' ? (
                          <TemplateTestForm gate={gate} name={key.name} perHour={KEY_TESTS_PER_HOUR} back={back} />
                        ) : open === 'set' && template && info.purpose ? (
                          <TemplateKeyForm
                            gate={gate}
                            name={key.name}
                            current={key.value}
                            sample={templateText(info.purpose, TEMPLATE_SAMPLES[info.purpose])}
                            perHour={KEY_TESTS_PER_HOUR}
                            seen={key.seen}
                            back={back}
                          />
                        ) : (
                          <KeyForm
                            gate={gate}
                            name={key.name}
                            mode={open === 'revert' ? 'revert' : 'set'}
                            field={info.field}
                            test={info.test}
                            tested={info.testable}
                            envMask={key.envSet ? maskText(info.dots, key.envTail) : null}
                            seen={key.seen}
                            back={back}
                          />
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
