'use client';

import Link from 'next/link';
import { Fragment, useActionState, useMemo, useRef, useState } from 'react';

import type { PriceList } from '@jozveyar/contracts';
import { formatNumber, formatTomans } from '@jozveyar/text';

import { deleteDraftAction, saveDraftAction, type DraftState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import type { Seg } from '../lib/orders';
import {
  BANDS_MAX,
  LABEL_MAX,
  TOMANS_MAX,
  canonicalJson,
  diffText,
  parseWhole,
  previewRows,
  rateRows,
  readDraft,
  weightLabel,
  ZONES,
  type DraftForm,
  type DraftIssue,
} from '../lib/tariff';
import { Segments } from './Segments';
import { StatusButton } from './StatusButton';

interface Props {
  gate: string;
  version: number;
  /** فرم پیش‌نویس ذخیره‌شده. */
  initial: DraftForm;
  /** اثر انگشت همان؛ ذخیره فقط اگر پیش‌نویس از وقتی این صفحه باز شد عوض نشده. */
  fingerprint: string;
  /** پیش‌نویس ذخیره‌شده: هرچه فرم ندارد از همین. */
  base: PriceList;
  /** نسخهٔ فعال، برای «نسخهٔ فعال: …»، هشدار ده برابر و پیش‌نمایش. */
  active: PriceList;
  /** پس از ذخیرهٔ موفق (`?saved=1`). */
  saved: boolean;
  /** صفحهٔ فعال‌سازی، وقتی چیزی برای ذخیره نیست. */
  activateHref: string;
}

/** خطا و هشدار یک فیلد، زیر همان؛ شناسه‌ها برای `aria-describedby`. */
function Issues({ id, errors, warnings }: { id: string; errors: DraftIssue[]; warnings: DraftIssue[] }) {
  return (
    <>
      {errors.map((issue, i) => (
        <p key={`e${i}`} id={`${id}-error${i ? `-${i}` : ''}`} className="jy-error">
          <span className="jy-icon jy-icon-error" aria-hidden="true" />
          <span>
            <Segments segs={issue.text} />
          </span>
        </p>
      ))}
      {warnings.map((issue, i) => (
        <p key={`w${i}`} id={`${id}-warn${i ? `-${i}` : ''}`} className="jy-note jy-note--warning">
          <span className="jy-icon jy-icon-warning" aria-hidden="true" />
          <span>
            <Segments segs={issue.text} />
          </span>
        </p>
      ))}
    </>
  );
}

const described = (id: string, errors: DraftIssue[], warnings: DraftIssue[], hint?: string) =>
  [
    ...errors.map((_, i) => `${id}-error${i ? `-${i}` : ''}`),
    ...warnings.map((_, i) => `${id}-warn${i ? `-${i}` : ''}`),
    ...(hint && errors.length === 0 && warnings.length === 0 ? [hint] : []),
  ].join(' ') || undefined;

/** «1,700» پس از ترک فیلد، اگر عدد درستی است؛ وگرنه همان که نوشته شد. */
function tidyMoney(text: string): string {
  const parsed = parseWhole(text, TOMANS_MAX);
  return parsed.ok ? formatNumber(parsed.value) : text;
}

/** خطاهای ذخیره‌ای که با ویرایش بیشتر درست نمی‌شوند: صفحه باید دوباره باز شود. */
const LASTING = new Set<string>(['draft_changed', 'not_draft', 'tariff_not_found', 'forbidden']);

const GROUP_OF: [RegExp, string][] = [
  [/^(bw|color)$/, 'چاپ'],
  [/^(band|bands)\b/, 'صحافی'],
  [/^ship\./, 'کرایه'],
  [/^label$/, 'نام'],
];

/** «تا خطای صحافی درست نشود…» وقتی همهٔ خطاها از یک گروه‌اند؛ وگرنه کلی. */
function previewBlocked(errors: DraftIssue[]): string {
  const groups = new Set(errors.map((e) => GROUP_OF.find(([pattern]) => pattern.test(e.field))?.[1] ?? ''));
  const [only] = [...groups];
  return groups.size === 1 && only ? `تا خطای ${only} درست نشود، پیش‌نمایش حساب نمی‌شود.` : 'تا خطاها درست نشوند، پیش‌نمایش حساب نمی‌شود.';
}

/**
 * ویرایشگر پیش‌نویس تعرفه (طرح پنل `m-tariff-draft` و `m-tariff-invalid`): نام، نرخ چاپ هر رو، بازه‌های صحافی (افزودن و
 * حذف)، کرایهٔ پست پیشتاز، و پیش‌نمایش چهار جزوهٔ نمونه با همان `quote()` سایت؛ همه زنده، با همان سنجشی که سرور هنگام
 * ذخیره دوباره می‌کند (`readDraft`). تا خطا هست، پیش‌نمایش حساب نمی‌شود و جای «فعال کن…» «اول خطا را درست کن» است.
 */
export function TariffEditor({ gate, version, initial, fingerprint, base, active, saved, activateHref }: Props) {
  const [form, setForm] = useState(initial);
  const nextId = useRef(initial.bands.length);
  const [ids, setIds] = useState(() => initial.bands.map((_, i) => i));
  const [added, setAdded] = useState<number | null>(null);
  const [state, action, pending] = useActionState<DraftState, FormData>(saveDraftAction, {});
  const [intent, setIntent] = useState<'save' | 'activate'>('save');
  const [confirming, setConfirming] = useState(false);

  const [sent, setSent] = useState<string | null>(null);

  const check = useMemo(() => readDraft(form, base, active), [form, base, active]);
  const snapshot = useMemo(() => canonicalJson(form), [form]);
  const dirty = useMemo(() => snapshot !== canonicalJson(initial), [snapshot, initial]);
  const preview = useMemo(() => (check.list ? previewRows(active, check.list) : null), [check.list, active]);
  const errorsAt = (field: string) => check.errors.filter((issue) => issue.field === field);
  const warningsAt = (field: string) => check.warnings.filter((issue) => issue.field === field);

  const set = (patch: Partial<DraftForm>) => setForm((current) => ({ ...current, ...patch }));
  const setBand = (index: number, part: 'from' | 'to' | 'price', value: string) =>
    setForm((current) => ({ ...current, bands: current.bands.map((band, i) => (i === index ? { ...band, [part]: value } : band)) }));
  const addBand = () => {
    const id = nextId.current++;
    setForm((current) => ({ ...current, bands: [...current.bands, { from: '', to: '', price: '' }] }));
    setIds((list) => [...list, id]);
    setAdded(id);
  };
  const removeBand = (index: number) => {
    setForm((current) => ({ ...current, bands: current.bands.filter((_, i) => i !== index) }));
    setIds((list) => list.filter((_, i) => i !== index));
  };

  const activeBw = active.clickRates.bw ?? 0;
  const activeColor = active.clickRates.color ?? 0;
  const binding = base.bindingTypes.spiral_clear;
  const hasErrors = check.errors.length > 0;
  // خطای ذخیره تا وقتی فرم همان است که فرستاده شد؛ پیش‌نویسی که جای دیگر عوض شد یا دیگر پیش‌نویس نیست، تا بازخوانی صفحه.
  const serverError = state.error && (LASTING.has(state.error) || sent === snapshot) ? state.error : null;
  const note = serverError
    ? messageOf(serverError)
    : dirty
      ? 'تغییرهای ذخیره‌نشده داری.'
      : saved
        ? 'پیش‌نویس ذخیره شد.'
        : '';

  const moneyField = (key: 'bw' | 'color', id: string, label: string, activeRials: number) => {
    const errors = errorsAt(key);
    const warnings = warningsAt(key);
    return (
      <div className="jy-field">
        <label className="jy-label" htmlFor={id}>
          {label}
        </label>
        <input
          id={id}
          name={key}
          className="jy-input jy-input--ltr"
          inputMode="numeric"
          autoComplete="off"
          value={form[key]}
          onChange={(event) => set({ [key]: event.target.value })}
          onBlur={(event) => set({ [key]: tidyMoney(event.target.value) })}
          aria-invalid={errors.length ? true : undefined}
          aria-describedby={described(id, errors, warnings, `${id}-hint`)}
        />
        {errors.length || warnings.length ? (
          <Issues id={id} errors={errors} warnings={warnings} />
        ) : (
          <p id={`${id}-hint`} className="jy-hint">
            نسخهٔ فعال: <span className="num">{formatTomans(activeRials, false)}</span>
          </p>
        )}
      </div>
    );
  };

  const shipIssues: { key: string; place: Seg[]; issue: DraftIssue; kind: 'error' | 'warn' }[] = [];
  for (const row of rateRows(base)) {
    ZONES.forEach((zone) => {
      const key = `${zone.id}:${row.minGrams}`;
      const place: Seg[] = [zone.name, '، ', ...weightLabel(row.minGrams, row.maxGrams), ': '];
      for (const issue of errorsAt(`ship.${key}`)) shipIssues.push({ key, place, issue, kind: 'error' });
      for (const issue of warningsAt(`ship.${key}`)) shipIssues.push({ key, place, issue, kind: 'warn' });
    });
  }
  const listIssues = errorsAt('list');
  const bandsIssues = errorsAt('bands');

  return (
    <>
      <form
        id="draft-form"
        action={action}
        onSubmit={() => setSent(snapshot)}
        onKeyDown={(event) => {
          // Enter در یک فیلد عددی فرم را نفرستد: ذخیره و فعال کردن هر کدام دکمهٔ خودشان را دارند.
          if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') event.preventDefault();
        }}
      >
        <input type="hidden" name="gate" value={gate} />
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="fingerprint" value={fingerprint} />
        <input type="hidden" name="intent" value={intent} />
        <div className="ad-stack">
          <section className="jy-card" aria-labelledby="t-d-name">
            <h2 id="t-d-name" className="jy-card__title">
              نام و چاپ
            </h2>
            <div className="ad-form">
              <div className="jy-field">
                <label className="jy-label" htmlFor="d-label">
                  نام نسخه
                </label>
                <input
                  id="d-label"
                  name="label"
                  className="jy-input"
                  autoComplete="off"
                  maxLength={LABEL_MAX * 2}
                  value={form.label}
                  onChange={(event) => set({ label: event.target.value })}
                  aria-invalid={errorsAt('label').length ? true : undefined}
                  aria-describedby={described('d-label', errorsAt('label'), [])}
                />
                <Issues id="d-label" errors={errorsAt('label')} warnings={[]} />
              </div>
            </div>
            <div className="ad-rates">
              {moneyField('bw', 'd-bw', 'سیاه‌سفید، هر رو (تومان)', activeBw)}
              {moneyField('color', 'd-color', 'رنگی، هر رو (تومان)', activeColor)}
            </div>
          </section>

          <div className="ad-cards">
            <section className="jy-card" aria-labelledby="t-d-bind">
              <h2 id="t-d-bind" className="jy-card__title">
                صحافی {binding?.nameFa}
              </h2>
              <p className="ad-hint">
                بر حسب <b>برگ</b>، نه صفحه: <span className="num">300</span> صفحهٔ دورو <span className="num">150</span> برگ است. بالای{' '}
                <span className="num">{formatNumber(binding?.maxSheetsPerVolume ?? 0)}</span> برگ، جلد تازه.
              </p>
              <table className="ad-table ad-table--edit" data-bands="">
                <thead>
                  <tr>
                    <th scope="col">از برگ</th>
                    <th scope="col">تا برگ</th>
                    <th scope="col">قیمت (تومان)</th>
                    <th scope="col">
                      <span className="sr-only">حذف</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {form.bands.map((band, i) => {
                    const id = `d-band-${ids[i]}`;
                    const at = (part: 'from' | 'to' | 'price') => ({ errors: errorsAt(`band.${i}.${part}`), warnings: warningsAt(`band.${i}.${part}`) });
                    const parts = { from: at('from'), to: at('to'), price: at('price') };
                    const input = (part: 'from' | 'to' | 'price', label: string, className: string) => (
                      <input
                        name={`band.${i}.${part}`}
                        className={`jy-input jy-input--ltr ${className}`}
                        inputMode="numeric"
                        autoComplete="off"
                        autoFocus={part === 'from' && added === ids[i]}
                        value={band[part]}
                        onChange={(event) => setBand(i, part, event.target.value)}
                        onBlur={part === 'price' ? (event) => setBand(i, part, tidyMoney(event.target.value)) : undefined}
                        aria-label={label}
                        aria-invalid={parts[part].errors.length ? true : undefined}
                        aria-describedby={described(`${id}-${part}`, parts[part].errors, parts[part].warnings)}
                      />
                    );
                    const flagged = Object.values(parts).some((p) => p.errors.length || p.warnings.length);
                    return (
                      <Fragment key={ids[i]}>
                        <tr data-band={i}>
                          <td>{input('from', 'از برگ', 'ad-in-n')}</td>
                          <td>{input('to', 'تا برگ', 'ad-in-n')}</td>
                          <td>{input('price', 'قیمت', 'ad-in-p')}</td>
                          <td className="ad-x">
                            <button
                              type="button"
                              className="jy-btn jy-btn--text jy-btn--icon"
                              aria-label="حذف این بازه"
                              disabled={form.bands.length <= 1}
                              onClick={() => removeBand(i)}
                            >
                              <span className="jy-icon jy-icon-close" aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                        {flagged ? (
                          <tr data-band-issues={i}>
                            <td colSpan={4}>
                              {(['from', 'to', 'price'] as const).map((part) => (
                                <Issues key={part} id={`${id}-${part}`} errors={parts[part].errors} warnings={parts[part].warnings} />
                              ))}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {bandsIssues.length ? (
                <div className="ad-issues">
                  <Issues id="d-bands" errors={bandsIssues} warnings={[]} />
                </div>
              ) : null}
              {form.bands.length < BANDS_MAX ? (
                <button type="button" className="jy-btn jy-btn--text ad-add" onClick={addBand}>
                  <span className="jy-icon jy-icon-plus" aria-hidden="true" />
                  افزودن بازه
                </button>
              ) : null}
            </section>

            <section className="jy-card" aria-labelledby="t-d-ship">
              <h2 id="t-d-ship" className="jy-card__title">
                {base.shippingMethods.post?.nameFa ?? 'پست'} (تومان)
              </h2>
              <table className="ad-table ad-table--edit ad-table--rates">
                <thead>
                  <tr>
                    <th scope="col">وزن</th>
                    {ZONES.map((zone) => (
                      <th key={zone.id} scope="col">
                        {zone.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rateRows(base).map((row) => (
                    <tr key={row.minGrams}>
                      <th scope="row">
                        <Segments segs={weightLabel(row.minGrams, row.maxGrams, true)} />
                      </th>
                      {ZONES.map((zone, column) => {
                        const key = `${zone.id}:${row.minGrams}`;
                        const errors = errorsAt(`ship.${key}`);
                        const warnings = warningsAt(`ship.${key}`);
                        const place = weightLabel(row.minGrams, row.maxGrams)
                          .map((s) => (typeof s === 'string' ? s : 'num' in s ? s.num : 'ltr' in s ? s.ltr : s.barcode))
                          .join('');
                        return row.prices[column] === null ? (
                          <td key={zone.id}>—</td>
                        ) : (
                          <td key={zone.id}>
                            <input
                              name={`ship.${key}`}
                              className="jy-input jy-input--ltr ad-in-p"
                              inputMode="numeric"
                              autoComplete="off"
                              value={form.ship[key] ?? ''}
                              onChange={(event) => set({ ship: { ...form.ship, [key]: event.target.value } })}
                              onBlur={(event) => set({ ship: { ...form.ship, [key]: tidyMoney(event.target.value) } })}
                              aria-label={`${zone.name}، ${place}`}
                              aria-invalid={errors.length ? true : undefined}
                              aria-describedby={described(`d-ship-${zone.id}-${row.minGrams}`, errors, warnings)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {shipIssues.length ? (
                <div className="ad-issues">
                  {shipIssues.map(({ key, place, issue, kind }, i) => (
                    <Issues
                      key={i}
                      id={`d-ship-${key.replace(':', '-')}`}
                      errors={kind === 'error' ? [{ ...issue, text: [...place, ...issue.text] }] : []}
                      warnings={kind === 'warn' ? [{ ...issue, text: [...place, ...issue.text] }] : []}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          </div>

          <section className="jy-card" aria-labelledby="t-d-prev">
            <h2 id="t-d-prev" className="jy-card__title">
              پیش‌نمایش
            </h2>
            <p className="ad-hint">قیمت چند جزوهٔ نمونه با همان موتور قیمت سایت، بی کرایه.</p>
            {listIssues.length ? (
              <div className="ad-issues">
                <Issues id="d-list" errors={listIssues} warnings={[]} />
              </div>
            ) : null}
            {preview ? (
              <table className="ad-table ad-table--num" data-preview="">
                <thead>
                  <tr>
                    <th scope="col">جزوه</th>
                    <th scope="col">
                      نسخهٔ <span className="num">{active.version}</span>
                    </th>
                    <th scope="col">
                      نسخهٔ <span className="num">{version}</span>
                    </th>
                    <th scope="col">فرق</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i}>
                      <th scope="row">
                        <Segments segs={row.label} />
                      </th>
                      <td className="num">{formatTomans(row.activeRials, false)}</td>
                      <td className="num">{formatTomans(row.draftRials, false)}</td>
                      <td className="ad-diff">
                        <span className="num">{diffText(row.diffRials)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="jy-note ad-gap">{previewBlocked(check.errors)}</p>
            )}
          </section>
        </div>
      </form>

      <div className="ad-bar">
        {confirming ? (
          <>
            <p className="ad-bar__note" role="status">
              پیش‌نویس نسخهٔ <span className="num">{version}</span> با همهٔ تغییرهایش پاک شود؟
            </p>
            <form action={deleteDraftAction}>
              <input type="hidden" name="gate" value={gate} />
              <input type="hidden" name="version" value={version} />
              <StatusButton className="jy-btn jy-btn--danger">پیش‌نویس را پاک کن</StatusButton>
            </form>
            <button type="button" className="jy-btn jy-btn--text" onClick={() => setConfirming(false)}>
              انصراف
            </button>
          </>
        ) : (
          <>
            {hasErrors ? (
              <button type="button" className="jy-btn jy-btn--primary is-status" aria-disabled="true">
                اول خطا را درست کن
              </button>
            ) : dirty ? (
              <button
                type="submit"
                form="draft-form"
                className={`jy-btn jy-btn--primary${pending && intent === 'activate' ? ' is-loading' : ''}`}
                disabled={pending}
                onClick={() => setIntent('activate')}
              >
                فعال کن…
              </button>
            ) : (
              <Link href={activateHref} className="jy-btn jy-btn--primary">
                فعال کن…
              </Link>
            )}
            <button
              type="submit"
              form="draft-form"
              className={`jy-btn jy-btn--secondary${pending && intent === 'save' ? ' is-loading' : ''}`}
              disabled={pending}
              onClick={() => setIntent('save')}
            >
              ذخیرهٔ پیش‌نویس
            </button>
            <button type="button" className="jy-btn jy-btn--text" onClick={() => setConfirming(true)}>
              حذف پیش‌نویس
            </button>
            <p className="ad-bar__note" role="status" data-note="">
              {note}
            </p>
          </>
        )}
      </div>
    </>
  );
}
