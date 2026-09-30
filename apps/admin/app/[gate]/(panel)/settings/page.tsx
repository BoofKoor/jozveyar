import type { Metadata } from 'next';
import Link from 'next/link';

import { SETTING_SCHEMAS, type Holiday } from '@jozveyar/contracts';
import { formatJalaliNumeric, formatNumber, formatTehranTime } from '@jozveyar/text';

import { Alert } from '../../../../components/Alert';
import { HolidayAddForm } from '../../../../components/HolidayAddForm';
import { KeyForm } from '../../../../components/KeyForm';
import { KeyTestForm } from '../../../../components/KeyTestForm';
import { NoAccess } from '../../../../components/NoAccess';
import { NumberSettingForm } from '../../../../components/NumberSettingForm';
import { StatusButton } from '../../../../components/StatusButton';
import { panelPath } from '../../../../lib/gate';
import { messageOf } from '../../../../lib/messages';
import { can } from '../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../lib/server/context';
import { whenText } from '../../../../lib/format';
import type { KeyLastTest, KeyView } from '../../../../lib/server/settings';
import type { CreditState } from '../../../../lib/server/sms';
import { HOLIDAYS_SHOWN, KEY_INFO, KEY_TESTS, holidaysView, maskText } from '../../../../lib/settings';
import { confirmHolidaysAction, removeHolidayAction } from '../../actions';

export const metadata: Metadata = { title: 'تنظیمات' };

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');

const SLA = SETTING_SCHEMAS['order.sla_days'];
const OTP = SETTING_SCHEMAS['otp.site_hourly_limit'];
const OTP_DAY = SETTING_SCHEMAS['otp.site_daily_limit'];
const CREDIT = SETTING_SCHEMAS['sms.credit_alert'];
const KEEP = SETTING_SCHEMAS['order.files_retention_days'];

/** «آزموده: درست، اعتبار 12,480 پیامک · امروز 11:02» (۷٫۱، سؤال ۱۳۹): آخرین آزمایش هر کلید sms.ir. */
function LastTest({ test, credit, now }: { test: KeyLastTest; credit: boolean; now: Date }) {
  const answer = test.http !== null ? <> (پاسخ <span className="num">{test.http}</span>)</> : null;
  const [icon, text] =
    test.outcome === 'ok'
      ? ['success', credit && test.credit !== null ? <>درست، اعتبار <span className="num">{formatNumber(Math.floor(test.credit))}</span> پیامک</> : credit ? 'درست' : 'درست، پیامک آزمایشی رفت']
      : test.outcome === 'rejected'
        ? ['error', <>رد شد{answer}</>]
        : test.outcome === 'unconfigured'
          ? ['warning', 'آزموده نشد: کلید API sms.ir خالی بود']
          : ['warning', <>sms.ir جواب نداد{answer}</>];
  return (
    <p className="ad-keys__last" data-last-test={test.outcome}>
      <span className={`jy-icon jy-icon-${icon}`} aria-hidden="true" /> آزموده: {text} · {whenText(test.at, now)}
    </p>
  );
}

/** عدد اعتبار sms.ir یا چرا نیست (۷٫۱، سؤال ۱۴۰). */
function CreditValue({ credit, now }: { credit: CreditState; now: Date }) {
  switch (credit.kind) {
    case 'ok':
      return (
        <>
          <p className="ad-credit__n" data-credit={Math.floor(credit.credit)}>
            <span className="num">{formatNumber(Math.floor(credit.credit))}</span>
            <small>پیامک</small>
          </p>
          <p className="ad-meta">
            از sms.ir، ساعت <span className="num">{formatTehranTime(credit.at)}</span>
          </p>
        </>
      );
    case 'error':
      return (
        <p className="jy-note jy-note--warning ad-gap" data-credit="error">
          <span className="jy-icon jy-icon-warning" aria-hidden="true" />
          <span>
            اعتبار خوانده نشد ({whenText(credit.at, now)}):{' '}
            {credit.code === 'unconfigured'
              ? 'کلید API sms.ir خالی است.'
              : credit.code === 'rejected'
                ? <>sms.ir کلید را نپذیرفت{credit.http !== null ? <> (پاسخ <span className="num">{credit.http}</span>)</> : null}.</>
                : 'sms.ir جواب نداد.'}
          </span>
        </p>
      );
    case 'unknown':
      return <p className="ad-meta">هنوز خوانده نشده.</p>;
    default:
      return (
        <p className="ad-hint ad-gap" data-credit="off">
          پیامک پنل کنسولی است؛ اعتبار با پیامک واقعی خوانده می‌شود (<bdi className="ad-ltr">SMS_PROVIDER=smsir</bdi>). «آزمایش» کلید API اعتبار را همین حالا هم
          می‌گوید.
        </p>
      );
  }
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
 * تنظیمات (طرح پنل `m-settings` و `m-key-edit`، ADR-041): روز کاری تحویل به پست، سقف ساعتی کد پیامکی، تعطیلی‌ها، و کلیدهای
 * سرویس‌ها. فقط مالک، و سرور هر کار را خودش می‌سنجد. کلید با «تغییر» همین‌جا باز می‌شود (`?key=`)، و «برگرداندن به .env» با
 * `?revert=`، هر دو با کد تازه و بی JS.
 */
export default async function SettingsPage({ params, searchParams }: { params: Promise<{ gate: string }>; searchParams: Promise<Query> }) {
  const { gate } = await params;
  const query = await searchParams;
  const { settings, sms: smsPanel } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'settings.edit') && !can(session, 'secrets.edit')) return <NoAccess gate={gate} partner={session.partner} />;
  const [result, smsResult] = await Promise.all([settings.overview(session), smsPanel.overview(session)]);
  if (!result.ok) return <NoAccess gate={gate} partner={session.partner} />;
  const { now, values, keys } = result.value;
  const sms = smsResult.ok ? smsResult.value : null;

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
    ) : values && done === 'otp.site_hourly_limit' && v === values.otpLimit ? (
      <Alert tone="success">
        سقف ساعتی کد پیامکی کل سایت ذخیره شد: <span className="num">{formatNumber(v)}</span> کد در ساعت.
      </Alert>
    ) : values && done === 'otp.site_daily_limit' && v === values.otpDaily ? (
      <Alert tone="success">
        سقف روزانهٔ کد پیامکی کل سایت ذخیره شد: <span className="num">{formatNumber(v)}</span> کد در روز.
      </Alert>
    ) : values && done === 'sms.credit_alert' && v === values.creditAlert ? (
      <Alert tone="success">
        آستانهٔ هشدار اعتبار پیامک ذخیره شد: <span className="num">{formatNumber(v)}</span>
        {v === 0 ? '؛ هشدار اعتبار خاموش است.' : '.'}
      </Alert>
    ) : values && done === 'order.files_retention_days' && v === values.retentionDays ? (
      <Alert tone="success">
        روزهای نگهداری فایل‌های سفارش ذخیره شد: <span className="num">{v}</span> روز. کارگر در دور بعدش با همین پاک می‌کند.
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
  const keyNote =
    error === 'key_changed' || error === 'key_not_found' || error === 'forbidden' ? (
      <Alert tone="error">{messageOf(error)}</Alert>
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
              {/* برش ۷ (ADR-049، سؤال ۱۱۷): ترمز آخر کل سایت، ساعتی و روزانه؛ لایه‌های ثابت زیرش (طرح `m-settings`) */}
              <section className="jy-card" aria-labelledby="t-otp" data-card="otp">
                <h2 id="t-otp" className="jy-card__title">
                  سقف کد پیامکی
                </h2>
                {sms ? (
                  <p className="ad-meta" data-otp-usage="">
                    امروز <span className="num">{formatNumber(sms.otp.today)}</span> از <span className="num">{formatNumber(sms.otp.daily)}</span> · این ساعت{' '}
                    <span className="num">{formatNumber(sms.otp.hour)}</span> از <span className="num">{formatNumber(sms.otp.hourly)}</span>
                  </p>
                ) : null}
                <NumberSettingForm
                  key={`otp:${values.otpLimit}:${mark}`}
                  bare
                  gate={gate}
                  settingKey="otp.site_hourly_limit"
                  id="otp"
                  title="سقف ساعتی کد پیامکی"
                  label="کد در ساعت، برای کل سایت"
                  value={values.otpLimit}
                  min={OTP.minValue ?? 1}
                  max={OTP.maxValue ?? 100_000}
                  stepper={false}
                  rangeError={`سقف عدد صحیح ${formatNumber(OTP.minValue ?? 1)} تا ${formatNumber(OTP.maxValue ?? 100_000)} باشد.`}
                  hint="جلوی رباتی که با شماره‌ها و اینترنت‌های زیاد پیامک می‌فرستد."
                />
                <NumberSettingForm
                  key={`otp-day:${values.otpDaily}:${mark}`}
                  bare
                  gate={gate}
                  settingKey="otp.site_daily_limit"
                  id="otp-day"
                  title="سقف روزانهٔ کد پیامکی"
                  label="کد در روز، برای کل سایت"
                  value={values.otpDaily}
                  min={OTP_DAY.minValue ?? 1}
                  max={OTP_DAY.maxValue ?? 1_000_000}
                  stepper={false}
                  rangeError={`سقف عدد صحیح ${formatNumber(OTP_DAY.minValue ?? 1)} تا ${formatNumber(OTP_DAY.maxValue ?? 1_000_000)} باشد.`}
                  hint={
                    <>
                      بدترین مصرف روزانهٔ کد همین است؛ روز از نیمه‌شب تهران. زیرش ثابت: کد فقط برای مرورگری که جزوهٔ آماده روی سرور دارد؛ هر
                      مرورگر <span className="num">5</span> در ساعت، هر شماره <span className="num">5</span> در ساعت و <span className="num">10</span> در{' '}
                      <span className="num">24</span> ساعت، و هر اینترنت <span className="num">20</span> در ساعت.
                    </>
                  }
                />
              </section>
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
              {/* برش ۷ (ADR-049): اعتبار از GET /v1/credit sms.ir، و هشدار پیشخوان زیر آستانه (sms.credit_alert) */}
              {sms ? (
                <section className="jy-card" aria-labelledby="t-credit" data-card="credit">
                  <h2 id="t-credit" className="jy-card__title">
                    اعتبار پیامک
                  </h2>
                  <CreditValue credit={sms.credit} now={now} />
                  {sms.usage.messages > 0 ? (
                    <p className="ad-meta" data-usage="">
                      مصرف <span className="num">7</span> روز گذشته <span className="num">{formatNumber(Math.round(sms.usage.cost))}</span> پیامک
                      {Math.round(sms.usage.cost) !== sms.usage.messages ? (
                        <>
                          {' '}
                          (<span className="num">{formatNumber(sms.usage.messages)}</span> پیامک رفت)
                        </>
                      ) : null}
                    </p>
                  ) : null}
                  <NumberSettingForm
                    key={`credit:${values.creditAlert}:${mark}`}
                    bare
                    gate={gate}
                    settingKey="sms.credit_alert"
                    id="credit"
                    title="هشدار اعتبار پیامک"
                    label="هشدار پیشخوان زیر"
                    value={values.creditAlert}
                    min={CREDIT.minValue ?? 0}
                    max={CREDIT.maxValue ?? 100_000_000}
                    stepper={false}
                    rangeError={`آستانه عدد صحیح ${formatNumber(CREDIT.minValue ?? 0)} تا ${formatNumber(CREDIT.maxValue ?? 100_000_000)} باشد.`}
                    hint={
                      <>
                        به همان واحد اعتبار sms.ir؛ <span className="num">0</span> یعنی هشدار نه. بی اعتبار نه کد تأیید می‌رود، نه پیامک پرداخت و رهگیری.
                      </>
                    }
                  />
                  <div className="ad-actions">
                    <a className="jy-btn jy-btn--text" href="https://app.sms.ir/" target="_blank" rel="noopener noreferrer">
                      شارژ در پنل sms.ir<span className="sr-only"> (زبانهٔ تازه)</span>
                    </a>
                  </div>
                </section>
              ) : null}
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
                کلیدها رمزشده نگه داشته می‌شوند و کاملشان دیگر نشان داده نمی‌شود. مقدار پنل بر مقدار <bdi className="ad-ltr">.env</bdi>{' '}
                مقدم است. کلید و قالب‌های sms.ir پیش از ذخیره با خود sms.ir آزموده می‌شوند؛ رد شده ذخیره نمی‌شود.
              </span>
            </p>
            <ul className="ad-keys ad-gap">
              {keys.map((key) => {
                const info = KEY_INFO[key.name];
                const tested = KEY_TESTS[key.name];
                const panelValue = key.source === 'panel' || key.source === 'unreadable';
                const open = editing === key.name ? 'set' : reverting === key.name && panelValue ? 'revert' : null;
                return (
                  <li key={key.name} id={`key-${key.name}`} data-key={key.name} data-source={key.source}>
                    <div>
                      <p className="ad-keys__name">{info.label}</p>
                      <p className="ad-keys__meta">
                        <SourceBadge source={key.source} />
                        {key.source === 'panel' || key.source === 'env' ? <span className="ad-mask">{maskText(info.dots, key.tail)}</span> : null}
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
                      {tested && key.lastTest ? <LastTest test={key.lastTest} credit={tested === 'credit'} now={now} /> : null}
                    </div>
                    <div className="ad-keys__btns">
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
                    {open === 'set' && tested ? (
                      <div className="ad-keys__form">
                        <KeyTestForm
                          gate={gate}
                          name={key.name}
                          kind={tested}
                          field={info.field}
                          hint={info.test}
                          seen={key.seen}
                          back={`${home}#key-${key.name}`}
                        />
                      </div>
                    ) : open ? (
                      <div className="ad-keys__form">
                        <KeyForm
                          gate={gate}
                          name={key.name}
                          mode={open}
                          field={info.field}
                          test={info.test}
                          envMask={key.envSet ? maskText(info.dots, key.envTail) : null}
                          seen={key.seen}
                          back={`${home}#key-${key.name}`}
                        />
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
