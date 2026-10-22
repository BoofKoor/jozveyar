import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  BLOCK_NAMES,
  PAGE_FAQ_MAX,
  TARIFF_SLUG,
  bindingTables,
  discountTiers,
  inlineText,
  parseInline,
  printTables,
  sampleQuote,
  shippingTable,
  type AnyPageContent,
  type ContentIssue,
  type LandingContent,
  type PageValues,
  type SitePageKind,
} from '@jozveyar/content';
import { TextContent } from '@jozveyar/content/render';
import { DEFAULT_PAPER_SIZE, PAPER_SIZES } from '@jozveyar/pricing';
import { formatNumber, formatTomans } from '@jozveyar/text';

import { Alert } from '../../../../../../components/Alert';
import { ContentField } from '../../../../../../components/ContentField';
import { ContentSegs } from '../../../../../../components/ContentSegs';
import { NoAccess } from '../../../../../../components/NoAccess';
import { PageBadges } from '../../../../../../components/PageBadges';
import { PagePreview } from '../../../../../../components/PagePreview';
import { StatusButton } from '../../../../../../components/StatusButton';
import { countText, fieldError, issueLine, issuesTitle, type ContentSeg } from '../../../../../../lib/content';
import { whenText } from '../../../../../../lib/format';
import { panelPath } from '../../../../../../lib/gate';
import { messageOf } from '../../../../../../lib/messages';
import { deskChoices, fixedText, pageEditorSub, scheduleText, warningLine } from '../../../../../../lib/pages';
import { can } from '../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../lib/server/context';
import type { PageEditorView, PageFacts, PageRow, PlaceholderRow } from '../../../../../../lib/server/pages';
import { discardPageAction, savePageAction, withdrawPageAction } from '../../../../actions';

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');

export async function generateMetadata({ params }: { params: Promise<{ page: string }> }): Promise<Metadata> {
  const { page } = await params;
  return { title: page === 'new' ? 'صفحهٔ تازه' : page === TARIFF_SLUG ? 'ویرایش تعرفه' : 'ویرایش صفحه' };
}

/** متن یک فیلد یک‌خطی با عدد امروز جای‌نگهدارها، همان که سایت نشان می‌دهد و سقف عنوان و توضیح گوگل با آن است (سؤال ۴۶۴). */
const shown = (text: string, values: PageValues) => inlineText(parseInline(text, 'line', { page: true }).nodes, values);

/** راهنمای نحو زیر متن صفحه (طرح «صفحهٔ فرود»): هر نمونه همان‌طور که در فیلد راست‌به‌چپ دیده می‌شود. */
function MarkdownHelp() {
  return (
    <>
      <span>
        <code>## تیتر</code>
      </span>
      <span>
        <code>- فهرست</code>
      </span>
      <span>
        <code>**پررنگ**</code>
      </span>
      <span>
        <code>[تعرفه](/tarefe)</code> پیوند به صفحه‌ای از همین سایت که روی سایت است
      </span>
      <span>
        <code>[[تعرفه]]</code> بلوک زنده، در خط خودش
      </span>
      <span>خط خالی: بند تازه</span>
    </>
  );
}

/** جدول «بلوک‌های زنده» (طرح «صفحهٔ فرود»، سؤال ۴۶۳): بنویس، روی سایت، و آنچه امروز با تعرفهٔ فعال نشان می‌دهد. */
function BlocksHelp({ facts }: { facts: PageFacts }) {
  const list = facts.priceList;
  const a4 = printTables(list, facts.paused).find((table) => table.size === DEFAULT_PAPER_SIZE);
  const bindings = bindingTables(list, facts.paused);
  const shipping = shippingTable(list);
  const tiers = discountTiers(list);
  const sample = sampleQuote({ pages: 200, copies: 1, color: null, sides: null, size: null, binding: null, paper: null }, list, facts.paused);
  const rows: { write: string; shows: string; today: ContentSeg[] }[] = [
    {
      write: `[[${BLOCK_NAMES.tariff}]]`,
      shows: 'چاپ هر رو، هر اندازه و رنگ',
      today: a4
        ? [
            { ltr: PAPER_SIZES[DEFAULT_PAPER_SIZE].label },
            ': ',
            { num: formatTomans(list.printRates[DEFAULT_PAPER_SIZE]!.double.bw, false) },
            ' و ',
            { num: formatTomans(list.printRates[DEFAULT_PAPER_SIZE]!.double.color, false) },
          ]
        : ['—'],
    },
    {
      write: `[[${BLOCK_NAMES.binding}]]`,
      shows: 'بازه‌های هر صحافی روشن',
      today: bindings.flatMap((table, i): ContentSeg[] => [
        i > 0 ? '؛ ' : '',
        `${table.name}${bindings.some((other) => other.id === table.id && other.size !== table.size) ? ` ${table.label}` : ''}، `,
        { num: formatNumber(table.bands.length) },
        ' بازه',
      ]),
    },
    {
      write: `[[${BLOCK_NAMES.shipping}]]`,
      shows: 'کرایهٔ هر منطقه و وزن',
      today: [{ num: formatNumber(shipping.rows.length) }, ' وزن، ', { num: formatNumber(shipping.zones.length) }, ' منطقه'],
    },
    {
      write: `[[${BLOCK_NAMES.discount}]]`,
      shows: 'پله‌های تخفیف سفارش بزرگ',
      today: tiers.length > 0 ? [{ num: formatNumber(tiers.length) }, ' پله'] : ['پله‌ای نیست؛ چیزی نشان نمی‌دهد'],
    },
    {
      write: '[[قیمت: 200 صفحه، سیاه‌سفید، دورو، طلق و سیم]]',
      shows: 'قیمت یک جزوهٔ نمونه، با همان حساب میز سفارش، و با ارسال به هر منطقه',
      today: sample.ok ? [{ num: formatTomans(sample.quote.breakdown.totalWithoutShippingRials, false) }, ' تومان'] : ['فعلاً ارائه نمی‌شود'],
    },
  ];
  return (
    <details className="ad-phs" open>
      <summary>
        بلوک‌های زنده: جدول و قیمتی که با تعرفه عوض می‌شود
        <span className="jy-icon jy-icon-chevron" aria-hidden="true" />
      </summary>
      <table className="ad-table ad-blocks">
        <thead>
          <tr>
            <th scope="col">بنویس</th>
            <th scope="col">روی سایت</th>
            <th scope="col">امروز</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.write}>
              <td>
                <span className="ad-ph">{row.write}</span>
              </td>
              <td>{row.shows}</td>
              <td>
                <ContentSegs segs={row.today} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ad-hint">
        در «قیمت» هر چه نگویی پیش‌فرض میز است (سیاه‌سفید، دورو، <bdi className="ad-ltr">A4</bdi>، کاغذ و صحافی پیش‌فرض، یک نسخه)؛ واژه‌ها همان میز،
        با «،». گزینه‌ای که امروز خاموش است هشدار می‌دهد و روی سایت «فعلاً ارائه نمی‌شود».
      </p>
    </details>
  );
}

/** جای‌نگهدارها، به‌علاوهٔ `{سال}` و `{تغییر_قیمت}` صفحه‌ها: نام، عدد امروز و منبعش (سؤال ۴۶۲). */
function Placeholders({ rows }: { rows: readonly PlaceholderRow[] }) {
  return (
    <details className="ad-phs">
      <summary>
        جای‌نگهدارها: عددهایی که خودشان به‌روز می‌مانند
        <span className="jy-icon jy-icon-chevron" aria-hidden="true" />
      </summary>
      <table className="ad-table">
        <thead>
          <tr>
            <th scope="col">بنویس</th>
            <th scope="col">امروز</th>
            <th scope="col">از کجا</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>
                <span className="ad-ph">{`{${row.name}}`}</span>
              </td>
              <td>
                <TextContent text={row.value} />
              </td>
              <td>
                <TextContent text={row.source} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ad-hint">در عنوان و توضیح گوگل هم کار می‌کنند.</p>
    </details>
  );
}

/** سؤالی که باز است: همانی که کار فهرست جابه‌جا یا افزود (`?open=`)، وگرنه سؤال‌های خطادار، وگرنه هیچ. */
function openItems(content: AnyPageContent, issues: readonly ContentIssue[], openParam: string): Set<number> {
  const asked = /^\d{1,2}$/.test(openParam) ? Number(openParam) : -1;
  if (asked >= 0 && asked < content.faq.length) return new Set([asked]);
  return new Set(
    issues.flatMap((issue) => {
      const match = /^faq\.(\d+)\./.exec(issue.field);
      return match ? [Number(match[1])] : [];
    }),
  );
}

/** سؤال‌های صفحه، بی JS: هر کار فهرست همان فرم را ذخیره می‌کند (مثل ۱۱٫۱). */
function FaqFields({ content, issues, open }: { content: AnyPageContent; issues: readonly ContentIssue[]; open: Set<number> }) {
  const last = content.faq.length - 1;
  return (
    <>
      {content.faq.length > 0 ? (
        <ol className="ad-faq" data-testid="page-faq">
          {content.faq.map((item, i) => (
            <li key={i}>
              <details open={open.has(i)}>
                <summary>
                  <span className="ad-faq__n num">{i + 1}</span>
                  <span className="ad-faq__q">{item.q || 'سؤال تازه'}</span>
                  <span className="jy-icon jy-icon-chevron" aria-hidden="true" />
                </summary>
                <div className="ad-faq__body">
                  <ContentField name={`faq.${i}.q`} label="پرسش" value={item.q} issues={issues} />
                  <ContentField
                    name={`faq.${i}.a`}
                    label="پاسخ"
                    value={item.a}
                    issues={issues}
                    rows={4}
                    hint={
                      <>
                        یک بند، تا <span className="num">800</span> نویسه؛ پررنگ، پیوند و جای‌نگهدار مثل متن صفحه.
                      </>
                    }
                  />
                  <div className="ad-faq__ctl">
                    <button type="submit" name="op" value={`up:${i}`} className="jy-btn jy-btn--secondary" disabled={i === 0}>
                      بالاتر
                    </button>
                    <button type="submit" name="op" value={`down:${i}`} className="jy-btn jy-btn--secondary" disabled={i === last}>
                      پایین‌تر
                    </button>
                    <button type="submit" name="op" value={`delete:${i}`} className="jy-btn jy-btn--text">
                      حذف این سؤال
                    </button>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ol>
      ) : (
        <p className="ad-hint">این صفحه هنوز سؤالی ندارد.</p>
      )}
      <div>
        <button type="submit" name="op" value="add" className="jy-btn jy-btn--secondary" disabled={content.faq.length >= PAGE_FAQ_MAX}>
          <span className="jy-icon jy-icon-plus" aria-hidden="true" />
          سؤال تازه
        </button>
      </div>
    </>
  );
}

/** «میز سفارش این صفحه» (سؤال ۴۵۵): فقط ردیفی که امروز بیش از یک گزینهٔ روشن دارد. */
function DeskFields({ content, issues, facts }: { content: LandingContent; issues: readonly ContentIssue[]; facts: PageFacts }) {
  const { rows, fixed } = deskChoices(facts.priceList);
  const fixedHint = fixedText(fixed);
  return (
    <fieldset className="ad-fs">
      <legend>میز سفارش این صفحه</legend>
      <p className="ad-hint">انتخاب از پیش مشتری‌ای که از این صفحه فایل می‌اندازد؛ فقط گزینه‌ای که امروز روشن است، و مشتری عوضش می‌کند.</p>
      <div className="ad-pair">
        {rows.map((row) => {
          const name = `desk.${row.name}`;
          const error = fieldError(name, issues);
          const id = `f-desk-${row.name}`;
          return (
            <div key={row.name} className="jy-field ad-select">
              <label className="jy-label" htmlFor={id}>
                {row.label}
              </label>
              <select
                id={id}
                name={name}
                className="jy-input"
                defaultValue={content.desk[row.name]}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
              >
                {row.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {error ? (
                <p id={`${id}-error`} className="jy-error">
                  <span className="jy-icon jy-icon-error" aria-hidden="true" />
                  <span>
                    <ContentSegs segs={error} />
                  </span>
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {fixedHint ? <p className="ad-hint">{fixedHint}</p> : null}
    </fieldset>
  );
}

/** «در گوگل»: عنوان و توضیح با شمار نویسه با عدد امروز (سؤال ۴۶۴)، و نمونهٔ نتیجهٔ گوگل. */
function SeoFields({ slug, content, issues, values }: { slug: string; content: AnyPageContent; issues: readonly ContentIssue[]; values: PageValues }) {
  const title = shown(content.seo.title, values);
  const description = shown(content.seo.description, values);
  return (
    <fieldset className="ad-fs">
      <legend>در گوگل</legend>
      <ContentField
        name="seo.title"
        label="عنوان"
        value={content.seo.title}
        issues={issues}
        hint={
          <>
            در گوگل «… | جزوه‌یار» می‌شود · با عدد امروز <ContentSegs segs={countText(title, 60)} />
          </>
        }
      />
      <ContentField
        name="seo.description"
        label="توضیح"
        value={content.seo.description}
        issues={issues}
        rows={3}
        hint={
          <>
            با عدد امروز <ContentSegs segs={countText(description, 160)} />
          </>
        }
      />
      <div className="ad-serp" aria-label="نمونهٔ نتیجهٔ گوگل">
        <p className="ad-serp__url">
          <bdi className="ad-ltr">{`jozveyar.com › ${slug || '…'}`}</bdi>
        </p>
        <p className="ad-serp__t">
          <TextContent text={`${title} | جزوه‌یار`} />
        </p>
        <p className="ad-serp__d">
          <TextContent text={description} />
        </p>
      </div>
    </fieldset>
  );
}

function LandingFields({ view, page, open }: { view: PageEditorView; page: LandingContent; open: Set<number> }) {
  const { issues } = view;
  return (
    <>
      <fieldset className="ad-fs">
        <legend>نشانی و تیتر</legend>
        <ContentField
          name="slug"
          label="نشانی"
          value={page.slug}
          issues={issues}
          ltr
          prefix="jozveyar.com/"
          hint={
            <>
              حرف کوچک لاتین، رقم و خط تیره، آوانگار فارسی (<bdi className="ad-ltr">print-arzan</bdi>، <bdi className="ad-ltr">sahafi</bdi>). پس از انتشار
              عوضش که کنی، نشانی قبلی برای همیشه به تازه می‌رود.
            </>
          }
        />
        <ContentField name="name" label="نام کوتاه" value={page.name} issues={issues} hint="در مسیر دیدنی («جزوه‌یار ‹ …»)، پاورقی و «سؤال‌های …»." />
        <ContentField name="title" label="تیتر صفحه" value={page.title} issues={issues} />
        <ContentField name="lead" label="جملهٔ زیر تیتر" value={page.lead} issues={issues} rows={2} />
        <p className="ad-hint">زیر جمله همان کارت بارگذاری، سه نوید و میز سفارش صفحهٔ اصلی است؛ متن پایین پس از آن‌ها می‌آید.</p>
      </fieldset>
      <fieldset className="ad-fs">
        <legend>متن صفحه</legend>
        <ContentField name="body" label="متن صفحه" value={page.body} issues={issues} rows={16} className="ad-md" help={<MarkdownHelp />} />
        <BlocksHelp facts={view.facts} />
        <Placeholders rows={view.placeholders} />
      </fieldset>
      <fieldset className="ad-fs">
        <legend>سؤال‌های این صفحه</legend>
        <FaqFields content={page} issues={issues} open={open} />
      </fieldset>
      <DeskFields content={page} issues={issues} facts={view.facts} />
      <fieldset className="ad-fs">
        <legend>پیوندها</legend>
        <label className="ad-toggle">
          <input className="ad-check" type="checkbox" name="inFooter" value="1" defaultChecked={page.inFooter} />
          در پاورقی، گروه «چاپ جزوه»
        </label>
        <p className="ad-hint">فقط صفحه‌ای که روی سایت است در پاورقی می‌آید، به ترتیب همین فهرست، با «تعرفه» تا ۱۲ پیوند.</p>
      </fieldset>
      <SeoFields slug={page.slug} content={page} issues={issues} values={view.facts.values} />
    </>
  );
}

function TariffFields({ view, page, open }: { view: PageEditorView; page: AnyPageContent; open: Set<number> }) {
  const { issues } = view;
  return (
    <>
      <fieldset className="ad-fs">
        <legend>تیتر و جمله</legend>
        <ContentField name="title" label="تیتر صفحه" value={page.title} issues={issues} />
        <ContentField name="lead" label="جملهٔ زیر تیتر" value={page.lead} issues={issues} rows={2} />
        <p className="ad-hint">ماشین‌حساب، جدول‌های چاپ، صحافی و ارسال و سه قیمت نمونه از تعرفهٔ فعال‌اند و اینجا نیستند.</p>
        <Placeholders rows={view.placeholders} />
      </fieldset>
      <fieldset className="ad-fs">
        <legend>سؤال‌های قیمت</legend>
        <FaqFields content={page} issues={issues} open={open} />
      </fieldset>
      <SeoFields slug={TARIFF_SLUG} content={page} issues={issues} values={view.facts.values} />
    </>
  );
}

/** حال صفحه برای نشان‌های سرِ ویرایشگر، همان نشان‌های فهرست. */
function headRow(view: PageEditorView, kind: SitePageKind): PageRow {
  return {
    param: view.param,
    kind,
    name: '',
    slug: '',
    state: view.state,
    isDefault: view.isDefault,
    draft: view.draft,
    removed: view.removed ? { version: view.removed, to: null } : null,
    warnings: [],
    blockIssues: [],
    inFooter: false,
  };
}

/**
 * ویرایش یک صفحهٔ فرود یا «تعرفه» (برش ۱۵٫۲، ADR-071؛ طرح «صفحهٔ فرود» و «خطاها»، سؤال‌های ۴۶۲ تا ۴۶۵): همان ویرایشگر ۱۱٫۱، با نشانی، بلوک‌های
 * زنده، سؤال‌های صفحه، میز سفارش این صفحه، پاورقی و گوگل؛ کنارش پیش‌نمایش با ظاهر سایت و عدد امروز. فرم پیش‌نویس است، نه سایت: «ذخیره و
 * پیش‌نمایش» با خطا هم نگه می‌دارد، و «انتشار…» فقط بی خطا. زمان‌دار در راه را همین‌جا بی کد پس می‌گیری. فقط مالک (`content.edit`).
 */
export default async function PageEditorPage({ params, searchParams }: { params: Promise<{ gate: string; page: string }>; searchParams: Promise<Query> }) {
  const { gate, page: param } = await params;
  const query = await searchParams;
  const { pages } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'content.edit')) return <NoAccess gate={gate} session={session} />;
  const result = await pages.editor(session, param);
  if (!result.ok) {
    if (result.error === 'page_not_found') notFound();
    return <NoAccess gate={gate} session={session} />;
  }
  const view = result.value;
  const { kind, draft, issues, warnings, state, now, content } = view;
  const isNew = view.detail === null && kind === 'landing';
  const self = panelPath(gate, `/content/pages/${view.param}`);
  const error = one(query, 'e');
  const discarding = one(query, 'discard') === '1' && draft !== null;
  const formKey = `${one(query, 'n')}:${draft?.updatedAt.getTime() ?? 0}:${state.latest}`;
  const slug = kind === 'tariff' ? TARIFF_SLUG : (content as LandingContent).slug;
  const name = kind === 'tariff' ? 'تعرفه' : isNew ? 'صفحهٔ تازه' : (content as LandingContent).name || 'صفحهٔ بی‌نام';
  const open = openItems(content, issues, one(query, 'open'));
  const withdrawn = one(query, 'withdrawn');
  const hasVersions = (view.detail?.versions.length ?? 0) > 0;

  return (
    <>
      <Link href={panelPath(gate, '/content/pages')} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        صفحه‌ها و مقاله‌ها
      </Link>
      <div className="ad-pagehead">
        <div>
          <div className="ad-title-row">
            <h1 className="ad-title">{name}</h1>
            <PageBadges row={headRow(view, kind)} />
          </div>
          <p className="ad-sub">
            <ContentSegs segs={pageEditorSub({ slug, state, draft, isDefault: view.isDefault, isNew }, now)} />
          </p>
        </div>
        <div className="ad-headbtns">
          {state.pending ? (
            <form action={withdrawPageAction}>
              <input type="hidden" name="gate" value={gate} />
              <input type="hidden" name="page" value={view.param} />
              <input type="hidden" name="version" value={state.pending.version} />
              <StatusButton className="jy-btn jy-btn--secondary">پس گرفتن زمان‌دار</StatusButton>
            </form>
          ) : null}
          {hasVersions ? (
            <Link href={`${self}/versions`} className="jy-btn jy-btn--secondary">
              نسخه‌ها
            </Link>
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert tone="error">{messageOf(error)}</Alert>
      ) : one(query, 'discarded') === '1' ? (
        <Alert tone="success">پیش‌نویس دور انداخته شد؛ فرم همان متن روی سایت را دارد.</Alert>
      ) : one(query, 'same') === '1' ? (
        <Alert tone="info">متن همان است که روی سایت (یا زمان‌دار) است؛ پیش‌نویسی نماند.</Alert>
      ) : one(query, 'empty') === '1' ? (
        <Alert tone="info">صفحهٔ تازه هنوز خالی است، پس چیزی ذخیره نشد.</Alert>
      ) : withdrawn ? (
        <Alert tone="success">
          زمان‌دار نسخهٔ <span className="num">{withdrawn}</span> پس گرفته شد و روی سایت نمی‌رود؛ متنش در پیش‌نویس است.
        </Alert>
      ) : one(query, 'saved') === '1' && draft && issues.length === 0 ? (
        <Alert tone="success">پیش‌نویس ذخیره شد. روی سایت چیزی عوض نشده تا «انتشار…».</Alert>
      ) : null}

      {state.pending ? (
        <Alert tone="info">
          نسخهٔ <span className="num">{state.pending.version}</span> برای {scheduleText(state.pending.liveFrom)} زمان‌دار است و تا آن ساعت روی سایت نیست.
          برای انتشار متن دیگری اول «پس گرفتن زمان‌دار» را بزن؛ متنش پیش‌نویس می‌شود.
        </Alert>
      ) : view.removed ? (
        <Alert tone="info">
          این صفحه {view.removed.removal === 'gone' ? '«پیدا نشد» ' : ''}از سایت برداشته شده؛ فرم آخرین متنش را دارد. با «انتشار…» همان نشانی برمی‌گردد.
        </Alert>
      ) : null}

      {issues.length > 0 ? (
        <div className="jy-note jy-note--error ad-gap" role="alert" data-testid="page-issues">
          <span className="jy-icon jy-icon-error" aria-hidden="true" />
          <span>
            <b>{issuesTitle(issues.length)}</b>
            <ul className="ad-errs">
              {issues.map((issue, i) => (
                <li key={i}>
                  <ContentSegs segs={issueLine(issue)} />
                </li>
              ))}
            </ul>
          </span>
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div className="jy-note jy-note--warning ad-gap" data-testid="page-warnings">
          <span className="jy-icon jy-icon-warning" aria-hidden="true" />
          <span>
            <b>{warnings.length === 1 ? 'یک هشدار، که انتشار را نمی‌بندد:' : `${formatNumber(warnings.length)} هشدار، که انتشار را نمی‌بندند:`}</b>
            <ul className="ad-errs">
              {warnings.map((warning, i) => (
                <li key={i}>
                  <ContentSegs segs={warningLine(warning)} />
                </li>
              ))}
            </ul>
          </span>
        </div>
      ) : null}

      {discarding && draft ? (
        <div className="ad-step ad-gap" data-testid="page-discard">
          <p className="ad-step__title">دور انداختن پیش‌نویس</p>
          <p className="jy-note jy-note--warning ad-gap">
            <span className="jy-icon jy-icon-warning" aria-hidden="true" />
            <span>
              پیش‌نویس {whenText(draft.createdAt, now)} پاک می‌شود و برنمی‌گردد.{' '}
              {hasVersions || kind === 'tariff' ? 'روی سایت همان می‌ماند.' : 'این صفحه هرگز منتشر نشده، پس خودش هم از فهرست می‌رود.'}
            </span>
          </p>
          <form action={discardPageAction} className="ad-actions">
            <input type="hidden" name="gate" value={gate} />
            <input type="hidden" name="page" value={view.param} />
            <StatusButton className="jy-btn jy-btn--danger">دور بینداز</StatusButton>
            <Link href={self} className="jy-btn jy-btn--text" scroll={false}>
              انصراف
            </Link>
          </form>
        </div>
      ) : null}

      <div className="ad-ed ad-gap">
        <section className="jy-card" aria-labelledby="ed-title">
          <h2 id="ed-title" className="jy-card__title">
            صفحه
          </h2>
          <form action={savePageAction} key={formKey}>
            <input type="hidden" name="gate" value={gate} />
            <input type="hidden" name="page" value={view.param} />
            <input type="hidden" name="faqCount" value={content.faq.length} />
            <div className="ad-form">
              {kind === 'tariff' ? (
                <TariffFields view={view} page={content} open={open} />
              ) : (
                <LandingFields view={view} page={content as LandingContent} open={open} />
              )}
            </div>
            <div className="ad-actions">
              <StatusButton className="jy-btn jy-btn--primary" name="intent" value="publish" disabled={issues.length > 0 || state.pending !== null}>
                انتشار…
              </StatusButton>
              <StatusButton className="jy-btn jy-btn--secondary" name="intent" value="save">
                ذخیره و پیش‌نمایش
              </StatusButton>
              {draft ? (
                <Link href={`${self}?discard=1`} className="jy-btn jy-btn--text" scroll={false}>
                  دور انداختن پیش‌نویس
                </Link>
              ) : null}
            </div>
          </form>
          <p className="ad-hint ad-gap">پیش‌نویس تا انتشار یا «دور انداختن» می‌ماند و روی سایت نیست. رقم‌ها لاتین و «ي» و «ك» فارسی می‌شوند.</p>
        </section>

        <section className="jy-card ad-pv" aria-labelledby="pv-title">
          <div className="jy-card__head">
            <h2 id="pv-title" className="jy-card__title">
              پیش‌نمایش
            </h2>
            <span className="jy-card__meta">
              {draft
                ? `پیش‌نویس، ${whenText(draft.updatedAt, now)}`
                : state.pending
                  ? 'زمان‌دار'
                  : state.live && state.live.content !== null
                    ? `روی سایت، نسخهٔ ${formatNumber(state.live.version)}`
                    : view.isDefault
                      ? 'متن پیش‌فرض'
                      : ''}
            </span>
          </div>
          {issues.length > 0 ? (
            <Alert tone="info">پیش‌نمایش پس از درست شدن خطاها ساخته می‌شود. {view.live ? 'روی سایت همان متن قبلی است.' : 'این صفحه هنوز روی سایت نیست.'}</Alert>
          ) : isNew && !draft ? (
            <p className="ad-hint">پس از «ذخیره و پیش‌نمایش» همین‌جا صفحه را با ظاهر سایت و عدد امروز می‌بینی.</p>
          ) : (
            <>
              <PagePreview kind={kind} content={content} facts={view.facts} />
              <p className="ad-hint ad-gap">
                عددهای خط‌چین از تعرفهٔ فعال‌اند و با تعرفهٔ تازه خودشان عوض می‌شوند.{' '}
                {kind === 'landing' ? 'روی سایت در نقشهٔ سایت هم هست، و با «در پاورقی» در پاورقی.' : null}
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
