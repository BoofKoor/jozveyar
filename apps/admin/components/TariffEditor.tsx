'use client';

import Link from 'next/link';
import { Fragment, useActionState, useMemo, useRef, useState } from 'react';

import type { PaperSize, PriceList } from '@jozveyar/contracts';
import { PAPER_SIZES, PAPER_SIZE_ORDER } from '@jozveyar/pricing';
import { DEFAULT_BINDING_TYPE_ID, DEFAULT_PAPER_TYPE_ID } from '@jozveyar/pricing/seed';
import { formatNumber, formatTomans } from '@jozveyar/text';

import { deleteDraftAction, saveDraftAction, type DraftState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import type { Seg } from '../lib/orders';
import {
  BANDS_MAX,
  LABEL_MAX,
  NAME_MAX,
  OPTIONS_MAX,
  TOMANS_MAX,
  canonicalJson,
  diffText,
  newBinding,
  newPaper,
  parseWhole,
  previewRows,
  rateRows,
  readDraft,
  weightLabel,
  ZONES,
  type BandInput,
  type BindingInput,
  type DraftForm,
  type DraftIssue,
  type PaperInput,
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

const SIDES = ['double', 'single'] as const;
const COLORS = ['bw', 'color'] as const;
const RATE_LABEL = {
  double: { bw: 'سیاه‌سفید دورو', color: 'رنگی دورو' },
  single: { bw: 'سیاه‌سفید یکرو', color: 'رنگی یکرو' },
} as const;

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
  [/^print\./, 'چاپ'],
  [/^(paper|papers)\b/, 'کاغذ'],
  [/^(binding|bindings)\b/, 'صحافی'],
  [/^ship\./, 'کرایه'],
  [/^label$/, 'نام'],
];

/** «تا خطای صحافی درست نشود…» وقتی همهٔ خطاها از یک گروه‌اند؛ وگرنه کلی. */
function previewBlocked(errors: DraftIssue[]): string {
  const groups = new Set(errors.map((e) => GROUP_OF.find(([pattern]) => pattern.test(e.field))?.[1] ?? ''));
  const [only] = [...groups];
  return groups.size === 1 && only ? `تا خطای ${only} درست نشود، پیش‌نمایش حساب نمی‌شود.` : 'تا خطاها درست نشوند، پیش‌نمایش حساب نمی‌شود.';
}

/** کلید ردیف‌های بازهٔ یک صحافی در یک اندازه، برای کلید پایدار React و فوکوس ردیف تازه. */
const tableKey = (bindingId: string, size: PaperSize) => `${bindingId}.${size}`;

/** «A4»، با جهت خودش. */
const SizeName = ({ size }: { size: PaperSize }) => <bdi>{PAPER_SIZES[size].label}</bdi>;

/**
 * ویرایشگر پیش‌نویس تعرفه (طرح پنل `m-tariff-draft` و `m-tariff-invalid`؛ کاتالوگ کامل از ۸٫۳، سؤال ۱۸۹): نام؛ نرخ هر رو برای هر
 * اندازه، یکرو و دورو (A5 و A3 با تیک «ارائه می‌شود»)؛ کاغذها با گرماژ و نرخ هر برگ هر اندازه؛ صحافی‌ها با کمینه و سقف برگ
 * هر جلد، «بالای سقف»، وزن، و بازه‌های هر اندازه (افزودن و حذف)؛ کرایهٔ پست پیشتاز؛ و پیش‌نمایش جزوه‌های نمونه با همان
 * `quote()` سایت؛ همه زنده، با همان سنجشی که سرور هنگام ذخیره دوباره می‌کند (`readDraft`). کاغذ و صحافی پیش‌فرض خاموش و حذف
 * نمی‌شوند. تا خطا هست، پیش‌نمایش حساب نمی‌شود و جای «فعال کن…» «اول خطا را درست کن» است.
 */
export function TariffEditor({ gate, version, initial, fingerprint, base, active, saved, activateHref }: Props) {
  const [form, setForm] = useState(initial);
  const nextKey = useRef(1);
  const [rowKeys, setRowKeys] = useState<Record<string, number[]>>(() => {
    const keys: Record<string, number[]> = {};
    for (const binding of initial.bindings) {
      for (const size of PAPER_SIZE_ORDER) keys[tableKey(binding.id, size)] = binding.bands[size].map(() => nextKey.current++);
    }
    return keys;
  });
  /** فیلدی که تازه ساخته شد و فوکوس می‌گیرد: ردیف بازه، کاغذ یا صحافی. */
  const [added, setAdded] = useState<string | null>(null);
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

  const sizes = PAPER_SIZE_ORDER.filter((size) => size === 'a4' || form.sizes[size]);
  const set = (patch: Partial<DraftForm>) => setForm((current) => ({ ...current, ...patch }));
  const setRate = (size: PaperSize, sides: (typeof SIDES)[number], color: (typeof COLORS)[number], value: string) =>
    setForm((current) => ({
      ...current,
      print: { ...current.print, [size]: { ...current.print[size], [sides]: { ...current.print[size][sides], [color]: value } } },
    }));
  const setSize = (size: PaperSize, offered: boolean) => setForm((current) => ({ ...current, sizes: { ...current.sizes, [size]: offered } }));

  const setPaper = (index: number, patch: Partial<PaperInput>) =>
    setForm((current) => ({ ...current, papers: current.papers.map((paper, i) => (i === index ? { ...paper, ...patch } : paper)) }));
  const setPaperRate = (index: number, size: PaperSize, value: string) =>
    setForm((current) => ({
      ...current,
      papers: current.papers.map((paper, i) => (i === index ? { ...paper, rates: { ...paper.rates, [size]: value } } : paper)),
    }));
  const addPaper = () => {
    const paper = newPaper(form.sizes);
    setForm((current) => ({ ...current, papers: [...current.papers, paper] }));
    setAdded(`paper:${paper.id}`);
  };
  const removePaper = (index: number) => setForm((current) => ({ ...current, papers: current.papers.filter((_, i) => i !== index) }));

  const setBinding = (index: number, patch: Partial<BindingInput>) =>
    setForm((current) => ({ ...current, bindings: current.bindings.map((binding, i) => (i === index ? { ...binding, ...patch } : binding)) }));
  const setBands = (index: number, size: PaperSize, change: (bands: BandInput[]) => BandInput[]) =>
    setForm((current) => ({
      ...current,
      bindings: current.bindings.map((binding, i) =>
        i === index ? { ...binding, bands: { ...binding.bands, [size]: change(binding.bands[size]) } } : binding,
      ),
    }));
  const setBand = (index: number, size: PaperSize, row: number, part: keyof BandInput, value: string) =>
    setBands(index, size, (bands) => bands.map((band, j) => (j === row ? { ...band, [part]: value } : band)));
  const addBand = (index: number, size: PaperSize) => {
    const binding = form.bindings[index]!;
    const key = nextKey.current++;
    setBands(index, size, (bands) => [...bands, { from: '', to: '', price: '' }]);
    setRowKeys((keys) => ({ ...keys, [tableKey(binding.id, size)]: [...(keys[tableKey(binding.id, size)] ?? []), key] }));
    setAdded(`band:${key}`);
  };
  const removeBand = (index: number, size: PaperSize, row: number) => {
    const binding = form.bindings[index]!;
    setBands(index, size, (bands) => bands.filter((_, j) => j !== row));
    setRowKeys((keys) => ({ ...keys, [tableKey(binding.id, size)]: (keys[tableKey(binding.id, size)] ?? []).filter((_, j) => j !== row) }));
  };
  const addBinding = () => {
    const binding = newBinding();
    setForm((current) => ({ ...current, bindings: [...current.bindings, binding] }));
    setRowKeys((keys) => {
      const next = { ...keys };
      for (const size of PAPER_SIZE_ORDER) next[tableKey(binding.id, size)] = binding.bands[size].map(() => nextKey.current++);
      return next;
    });
    setAdded(`binding:${binding.id}`);
  };
  const removeBinding = (index: number) => setForm((current) => ({ ...current, bindings: current.bindings.filter((_, i) => i !== index) }));

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

  /** یک فیلد پول یا عدد با برچسب و خطا و هشدارش؛ `hint` زیر فیلد وقتی ایرادی نیست. */
  const field = (opts: {
    id: string;
    name: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    money?: boolean;
    hint?: Seg[] | null;
    disabled?: boolean;
    readOnly?: boolean;
    className?: string;
    autoFocus?: boolean;
    ltr?: boolean;
  }) => {
    const errors = errorsAt(opts.name);
    const warnings = warningsAt(opts.name);
    return (
      <div className={`jy-field${opts.className ? ` ${opts.className}` : ''}`}>
        <label className="jy-label" htmlFor={opts.id}>
          {opts.label}
        </label>
        <input
          id={opts.id}
          name={opts.name}
          className={opts.ltr === false ? 'jy-input' : 'jy-input jy-input--ltr'}
          inputMode={opts.ltr === false ? undefined : 'numeric'}
          autoComplete="off"
          value={opts.value}
          disabled={opts.disabled}
          readOnly={opts.readOnly}
          autoFocus={opts.autoFocus}
          maxLength={opts.ltr === false ? NAME_MAX * 2 : undefined}
          onChange={(event) => opts.onChange(event.target.value)}
          onBlur={opts.money ? (event) => opts.onChange(tidyMoney(event.target.value)) : undefined}
          aria-invalid={errors.length ? true : undefined}
          aria-describedby={described(opts.id, errors, warnings, opts.hint ? `${opts.id}-hint` : undefined)}
        />
        {errors.length || warnings.length ? (
          <Issues id={opts.id} errors={errors} warnings={warnings} />
        ) : opts.hint ? (
          <p id={`${opts.id}-hint`} className="jy-hint">
            <Segments segs={opts.hint} />
          </p>
        ) : null}
      </div>
    );
  };
  /** «نسخهٔ فعال: 1,600»، اگر نسخهٔ فعال این عدد را دارد. */
  const was = (rials: number | undefined): Seg[] | null =>
    rials === undefined ? null : ['نسخهٔ فعال: ', { num: formatNumber(Math.round(rials / 10)) }];

  const shipIssues: { key: string; place: Seg[]; issue: DraftIssue; kind: 'error' | 'warn' }[] = [];
  for (const row of rateRows(base)) {
    ZONES.forEach((zone) => {
      const key = `${zone.id}:${row.minGrams}`;
      const place: Seg[] = [zone.name, '، ', ...weightLabel(row.minGrams, row.maxGrams), ': '];
      for (const issue of errorsAt(`ship.${key}`)) shipIssues.push({ key, place, issue, kind: 'error' });
      for (const issue of warningsAt(`ship.${key}`)) shipIssues.push({ key, place, issue, kind: 'warn' });
    });
  }
  const listIssues = [...errorsAt('list'), ...errorsAt('papers'), ...errorsAt('bindings')];

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
            <p className="ad-hint ad-gap">تومان، هر رو چاپ‌شده. اندازه‌ای که تیک ندارد در سایت ارائه نمی‌شود.</p>
            {PAPER_SIZE_ORDER.map((size) => {
              const offered = size === 'a4' || form.sizes[size];
              return (
                <fieldset key={size} className="ad-size" data-size={size}>
                  <legend className="ad-size__legend">
                    {size === 'a4' ? (
                      <SizeName size={size} />
                    ) : (
                      <label className="ad-size__toggle">
                        <input
                          type="checkbox"
                          className="ad-check"
                          name={`size.${size}`}
                          checked={offered}
                          onChange={(event) => setSize(size, event.target.checked)}
                        />
                        <SizeName size={size} /> ارائه می‌شود
                      </label>
                    )}
                  </legend>
                  {offered ? (
                    <div className="ad-rates ad-rates--4">
                      {SIDES.flatMap((sides) =>
                        COLORS.map((color) => (
                          <Fragment key={`${sides}-${color}`}>
                            {field({
                              id: `d-print-${size}-${sides}-${color}`,
                              name: `print.${size}.${sides}.${color}`,
                              label: RATE_LABEL[sides][color],
                              value: form.print[size][sides][color],
                              onChange: (value) => setRate(size, sides, color, value),
                              money: true,
                              hint: was(active.printRates[size]?.[sides][color]),
                            })}
                          </Fragment>
                        )),
                      )}
                    </div>
                  ) : null}
                </fieldset>
              );
            })}
          </section>

          <section className="jy-card" aria-labelledby="t-d-paper" data-papers="">
            <h2 id="t-d-paper" className="jy-card__title">
              کاغذ
            </h2>
            <p className="ad-hint">تومان هر برگ، روی نرخ چاپ؛ خالی یعنی این کاغذ آن اندازه را ندارد. تحریر صفر است.</p>
            {form.papers.map((paper, i) => {
              const isDefault = paper.id === DEFAULT_PAPER_TYPE_ID;
              return (
                <fieldset key={paper.id} className="ad-option" data-paper={paper.id} aria-label={paper.name || 'کاغذ تازه'}>
                  <input type="hidden" name={`paper.${i}.id`} value={paper.id} />
                  <div className="ad-option__row">
                    {field({
                      id: `d-paper-${paper.id}-name`,
                      name: `paper.${i}.name`,
                      label: 'نام کاغذ',
                      value: paper.name,
                      onChange: (value) => setPaper(i, { name: value }),
                      ltr: false,
                      className: 'ad-in-name',
                      autoFocus: added === `paper:${paper.id}`,
                    })}
                    {field({
                      id: `d-paper-${paper.id}-gsm`,
                      name: `paper.${i}.gsm`,
                      label: 'گرماژ',
                      value: paper.gsm,
                      onChange: (value) => setPaper(i, { gsm: value }),
                      className: 'ad-in-n',
                    })}
                    {sizes.map((size) => (
                      <Fragment key={size}>
                        {field({
                          id: `d-paper-${paper.id}-${size}`,
                          name: `paper.${i}.rate.${size}`,
                          label: `هر برگ ${PAPER_SIZES[size].label}`,
                          value: paper.rates[size],
                          onChange: (value) => setPaperRate(i, size, value),
                          money: true,
                          className: 'ad-in-p',
                        })}
                      </Fragment>
                    ))}
                  </div>
                  <div className="ad-option__row ad-option__foot">
                    {isDefault ? (
                      <>
                        <input type="hidden" name={`paper.${i}.enabled`} value="on" />
                        <p className="ad-hint">پیش‌فرض: همیشه روشن، و نرخ هر اندازه را دارد.</p>
                      </>
                    ) : (
                      <>
                        <label className="ad-size__toggle">
                          <input
                            type="checkbox"
                            className="ad-check"
                            name={`paper.${i}.enabled`}
                            checked={paper.enabled}
                            onChange={(event) => setPaper(i, { enabled: event.target.checked })}
                          />
                          روشن
                        </label>
                        <button type="button" className="jy-btn jy-btn--text" onClick={() => removePaper(i)}>
                          حذف این کاغذ
                        </button>
                      </>
                    )}
                  </div>
                  <Issues id={`d-paper-${paper.id}-enabled`} errors={errorsAt(`paper.${i}.enabled`)} warnings={[]} />
                </fieldset>
              );
            })}
            {form.papers.length < OPTIONS_MAX ? (
              <button type="button" className="jy-btn jy-btn--text ad-add" onClick={addPaper}>
                <span className="jy-icon jy-icon-plus" aria-hidden="true" />
                افزودن کاغذ
              </button>
            ) : null}
          </section>

          <section className="jy-card" aria-labelledby="t-d-bind" data-bindings="">
            <h2 id="t-d-bind" className="jy-card__title">
              صحافی
            </h2>
            <p className="ad-hint">
              بر حسب <b>برگ</b>، نه صفحه: <span className="num">300</span> صفحهٔ دورو <span className="num">150</span> برگ است. بازه‌های هر
              اندازه از کمینه تا سقف هر جلد، بی شکاف؛ اندازهٔ بی بازه یعنی این صحافی آن اندازه را ندارد.
            </p>
            {form.bindings.map((binding, i) => {
              const isDefault = binding.id === DEFAULT_BINDING_TYPE_ID;
              const at = (part: string) => `binding.${i}.${part}`;
              const splitsErrors = errorsAt(at('splits'));
              return (
                <fieldset key={binding.id} className="ad-option" data-binding={binding.id} aria-label={binding.name || 'صحافی تازه'}>
                  <input type="hidden" name={`binding.${i}.id`} value={binding.id} />
                  <div className="ad-option__row">
                    {field({
                      id: `d-bind-${binding.id}-name`,
                      name: at('name'),
                      label: 'نام صحافی',
                      value: binding.name,
                      onChange: (value) => setBinding(i, { name: value }),
                      ltr: false,
                      className: 'ad-in-name',
                      autoFocus: added === `binding:${binding.id}`,
                    })}
                    {field({
                      id: `d-bind-${binding.id}-min`,
                      name: at('min'),
                      label: 'کمینهٔ برگ',
                      value: binding.min,
                      onChange: (value) => setBinding(i, { min: value }),
                      readOnly: isDefault,
                      className: 'ad-in-n',
                    })}
                    {field({
                      id: `d-bind-${binding.id}-max`,
                      name: at('max'),
                      label: 'سقف برگ هر جلد',
                      value: binding.max,
                      onChange: (value) => setBinding(i, { max: value }),
                      className: 'ad-in-n',
                    })}
                    {field({
                      id: `d-bind-${binding.id}-weight`,
                      name: at('weight'),
                      label: 'وزن هر جلد (گرم)',
                      value: binding.weight,
                      onChange: (value) => setBinding(i, { weight: value }),
                      className: 'ad-in-n',
                    })}
                  </div>
                  {isDefault ? (
                    <>
                      <input type="hidden" name={at('splits')} value="1" />
                      <input type="hidden" name={at('enabled')} value="on" />
                      <p className="ad-hint">پیش‌فرض: همیشه روشن، از برگ ۱، بالای سقف چند جلد می‌شود، و بازه‌های هر اندازه را دارد.</p>
                    </>
                  ) : (
                    <div className="ad-option__row ad-option__foot">
                      <fieldset className="ad-split" aria-describedby={described(`d-bind-${binding.id}-splits`, splitsErrors, [])}>
                        <legend className="jy-label">بالای سقف</legend>
                        <label className="ad-size__toggle">
                          <input
                            type="radio"
                            className="jy-radio"
                            name={at('splits')}
                            value="1"
                            checked={binding.splits}
                            onChange={() => setBinding(i, { splits: true })}
                          />
                          چند جلد می‌شود
                        </label>
                        <label className="ad-size__toggle">
                          <input
                            type="radio"
                            className="jy-radio"
                            name={at('splits')}
                            value="0"
                            checked={!binding.splits}
                            onChange={() => setBinding(i, { splits: false })}
                          />
                          نمی‌خورد
                        </label>
                      </fieldset>
                      <label className="ad-size__toggle">
                        <input
                          type="checkbox"
                          className="ad-check"
                          name={at('enabled')}
                          checked={binding.enabled}
                          onChange={(event) => setBinding(i, { enabled: event.target.checked })}
                        />
                        روشن
                      </label>
                      <button type="button" className="jy-btn jy-btn--text" onClick={() => removeBinding(i)}>
                        حذف این صحافی
                      </button>
                    </div>
                  )}
                  <Issues id={`d-bind-${binding.id}-splits`} errors={splitsErrors} warnings={[]} />
                  <Issues id={`d-bind-${binding.id}-enabled`} errors={errorsAt(at('enabled'))} warnings={[]} />
                  {sizes.map((size) => {
                    const bands = binding.bands[size];
                    const keys = rowKeys[tableKey(binding.id, size)] ?? [];
                    const tableIssues = errorsAt(at(`bands.${size}`));
                    return (
                      <div key={size} className="ad-binding-bands">
                        <table className="ad-table ad-table--edit" data-bands={tableKey(binding.id, size)}>
                          <caption className="ad-binding-bands__caption">
                            بازه‌های <SizeName size={size} />
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">از برگ</th>
                              <th scope="col">تا برگ</th>
                              <th scope="col">قیمت هر جلد (تومان)</th>
                              <th scope="col">
                                <span className="sr-only">حذف</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {bands.map((band, j) => {
                              const key = keys[j] ?? j;
                              const id = `d-band-${key}`;
                              const name = (part: keyof BandInput) => at(`band.${size}.${j}.${part}`);
                              const parts = {
                                from: { errors: errorsAt(name('from')), warnings: warningsAt(name('from')) },
                                to: { errors: errorsAt(name('to')), warnings: warningsAt(name('to')) },
                                price: { errors: errorsAt(name('price')), warnings: warningsAt(name('price')) },
                              };
                              const input = (part: keyof BandInput, label: string, className: string) => (
                                <input
                                  name={name(part)}
                                  className={`jy-input jy-input--ltr ${className}`}
                                  inputMode="numeric"
                                  autoComplete="off"
                                  autoFocus={part === 'from' && added === `band:${key}`}
                                  value={band[part]}
                                  onChange={(event) => setBand(i, size, j, part, event.target.value)}
                                  onBlur={part === 'price' ? (event) => setBand(i, size, j, part, tidyMoney(event.target.value)) : undefined}
                                  aria-label={label}
                                  aria-invalid={parts[part].errors.length ? true : undefined}
                                  aria-describedby={described(`${id}-${part}`, parts[part].errors, parts[part].warnings)}
                                />
                              );
                              const flagged = Object.values(parts).some((p) => p.errors.length || p.warnings.length);
                              return (
                                <Fragment key={key}>
                                  <tr data-band={j}>
                                    <td>{input('from', 'از برگ', 'ad-in-n')}</td>
                                    <td>{input('to', 'تا برگ', 'ad-in-n')}</td>
                                    <td>{input('price', 'قیمت', 'ad-in-p')}</td>
                                    <td className="ad-x">
                                      <button
                                        type="button"
                                        className="jy-btn jy-btn--text jy-btn--icon"
                                        aria-label="حذف این بازه"
                                        disabled={isDefault && bands.length <= 1}
                                        onClick={() => removeBand(i, size, j)}
                                      >
                                        <span className="jy-icon jy-icon-close" aria-hidden="true" />
                                      </button>
                                    </td>
                                  </tr>
                                  {flagged ? (
                                    <tr data-band-issues={j}>
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
                        {bands.length === 0 ? (
                          <p className="ad-hint">
                            این صحافی <SizeName size={size} /> ندارد.
                          </p>
                        ) : null}
                        {tableIssues.length ? (
                          <div className="ad-issues">
                            <Issues id={`d-bands-${binding.id}-${size}`} errors={tableIssues} warnings={[]} />
                          </div>
                        ) : null}
                        {bands.length < BANDS_MAX ? (
                          <button type="button" className="jy-btn jy-btn--text ad-add" onClick={() => addBand(i, size)}>
                            <span className="jy-icon jy-icon-plus" aria-hidden="true" />
                            افزودن بازه
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </fieldset>
              );
            })}
            {form.bindings.length < OPTIONS_MAX ? (
              <button type="button" className="jy-btn jy-btn--text ad-add" onClick={addBinding}>
                <span className="jy-icon jy-icon-plus" aria-hidden="true" />
                افزودن صحافی
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
                        .map((s) => (typeof s === 'string' ? s : 'num' in s ? s.num : 'ltr' in s ? s.ltr : 'name' in s ? s.name : s.barcode))
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

          <section className="jy-card" aria-labelledby="t-d-prev">
            <h2 id="t-d-prev" className="jy-card__title">
              پیش‌نمایش
            </h2>
            <p className="ad-hint">قیمت چند جزوهٔ نمونه با همان موتور قیمت سایت، بی کرایه؛ و یک نمونه برای هر اندازه، کاغذ و صحافی دیگر.</p>
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
                      <td className="num">{row.activeRials === null ? '—' : formatTomans(row.activeRials, false)}</td>
                      <td className="num">{row.draftRials === null ? '—' : formatTomans(row.draftRials, false)}</td>
                      <td className="ad-diff">{row.diffRials === null ? 'تازه' : <span className="num">{diffText(row.diffRials)}</span>}</td>
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
