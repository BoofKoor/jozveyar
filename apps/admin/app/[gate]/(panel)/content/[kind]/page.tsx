import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import {
  FAQ_MAX_ITEMS,
  KIND_NAMES,
  faqCountOf,
  isPageKind,
  type ContactContent,
  type ContentIssue,
  type ContentKind,
  type FaqContent,
  type HomeContent,
  type PageContent,
  type Seo,
} from '@jozveyar/content';
import { TextContent } from '@jozveyar/content/render';
import { formatJalaliNumeric, formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../../components/Alert';
import { ContentField } from '../../../../../components/ContentField';
import { ContentPreview } from '../../../../../components/ContentPreview';
import { ContentSegs } from '../../../../../components/ContentSegs';
import { NoAccess } from '../../../../../components/NoAccess';
import { StatusButton } from '../../../../../components/StatusButton';
import { countText, editorSub, issueLine, issuesTitle, previewBlocked, previewMeta } from '../../../../../lib/content';
import { whenText } from '../../../../../lib/format';
import { panelPath } from '../../../../../lib/gate';
import { messageOf } from '../../../../../lib/messages';
import { can } from '../../../../../lib/server/auth';
import type { EditorView, PlaceholderRow } from '../../../../../lib/server/content';
import { requirePanel, requireSession } from '../../../../../lib/server/context';
import { discardContentAction, saveContentAction } from '../../../actions';

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');

const ERRORS = new Set([
  'forbidden',
  'content_not_found',
  'content_faq_full',
  'content_too_large',
  'content_no_draft',
  'content_invalid',
  'content_unchanged',
  'content_changed',
]);

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const { kind } = await params;
  return { title: kind in KIND_NAMES ? `ویرایش ${KIND_NAMES[kind as ContentKind]}` : 'محتوای سایت' };
}

/** راهنمای نحو زیر متن صفحه (طرح «ویرایش قوانین»): هر نمونه همان‌طور که در فیلد راست‌به‌چپ دیده می‌شود. */
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
        <code>[تماس](/contact)</code> پیوند به همین سایت، و <bdi className="ad-ltr">tel:</bdi> و <bdi className="ad-ltr">mailto:</bdi>
      </span>
      <span>خط خالی: بند تازه</span>
      <span>HTML، تصویر، جدول و پیوند به سایت دیگر نه.</span>
    </>
  );
}

/** جدول جای‌نگهدارها: نام، عدد امروز و منبعش (سؤال ۲۸۵). */
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
    </details>
  );
}

/** «در گوگل»: عنوان و توضیح با شمار نویسه، و نمونهٔ نتیجهٔ گوگل (سؤال ۲۸۳). صفحهٔ اصلی عنوانش را بی «| جزوه‌یار» دارد. */
function SeoFields({ kind, seo, issues }: { kind: ContentKind; seo: Seo; issues: readonly ContentIssue[] }) {
  const full = kind === 'home' ? seo.title : `${seo.title} | جزوه‌یار`;
  const path = kind === 'home' ? '' : ` › ${kind}`;
  return (
    <fieldset className="ad-fs">
      <legend>در گوگل</legend>
      <ContentField
        name="seo.title"
        label="عنوان"
        value={seo.title}
        issues={issues}
        hint={
          kind === 'home' ? (
            <ContentSegs segs={countText(seo.title, 60)} />
          ) : (
            <>
              در زبانهٔ مرورگر و گوگل «{full}» می‌شود · <ContentSegs segs={countText(seo.title, 60)} />
            </>
          )
        }
      />
      <ContentField name="seo.description" label="توضیح" value={seo.description} issues={issues} rows={3} hint={<ContentSegs segs={countText(seo.description, 160)} />} />
      <div className="ad-serp" aria-label="نمونهٔ نتیجهٔ گوگل">
        <p className="ad-serp__url">
          <bdi className="ad-ltr">{`jozveyar.com${path}`}</bdi>
        </p>
        <p className="ad-serp__t">{full}</p>
        <p className="ad-serp__d">{seo.description}</p>
      </div>
    </fieldset>
  );
}

function PageFields({ view, page }: { view: EditorView; page: PageContent }) {
  return (
    <>
      <ContentField name="title" label="تیتر صفحه" value={page.title} issues={view.issues} />
      <ContentField name="lead" label="جملهٔ آغاز" value={page.lead} issues={view.issues} rows={3} />
      <ContentField name="body" label="متن صفحه" value={page.body} issues={view.issues} rows={18} className="ad-md" help={<MarkdownHelp />} />
      <Placeholders rows={view.placeholders} />
      <SeoFields kind={view.kind} seo={page.seo} issues={view.issues} />
    </>
  );
}

function HomeFields({ view, home }: { view: EditorView; home: HomeContent }) {
  const { issues } = view;
  return (
    <>
      <fieldset className="ad-fs">
        <legend>قهرمان</legend>
        <ContentField name="eyebrow" label="خط بالای تیتر" value={home.eyebrow} issues={issues} />
        <ContentField
          name="title"
          label="تیتر"
          value={home.title}
          issues={issues}
          hint="تیتر فقط سر ویرگول به خط بعد می‌رود. متن میان دو ستاره سبز می‌شود، فقط یک جا."
        />
        <ContentField name="lead" label="جملهٔ زیر تیتر" value={home.lead} issues={issues} rows={2} />
      </fieldset>
      <fieldset className="ad-fs">
        <legend>سه نوید زیر کارت بارگذاری</legend>
        {home.promises.map((promise, i) => (
          <div key={i} className="ad-pair">
            <ContentField
              name={`promises.${i}.title`}
              label={
                <>
                  نوید <span className="num">{i + 1}</span>
                </>
              }
              value={promise.title}
              issues={issues}
            />
            <ContentField name={`promises.${i}.sub`} label="خط دوم" value={promise.sub} issues={issues} />
          </div>
        ))}
        <p className="ad-hint">آیکون هر نوید (برچسب، کامیون، قفل) همان می‌ماند.</p>
      </fieldset>
      <fieldset className="ad-fs">
        <legend>سه قدم</legend>
        <ContentField name="howTitle" label="تیتر بخش" value={home.howTitle} issues={issues} />
        {home.steps.map((step, i) => (
          <div key={i} className="ad-stepfield">
            <ContentField
              name={`steps.${i}.title`}
              label={
                <>
                  قدم <span className="num">{i + 1}</span>
                </>
              }
              value={step.title}
              issues={issues}
            />
            <ContentField name={`steps.${i}.body`} label={null} ariaLabel={`متن قدم ${i + 1}`} value={step.body} issues={issues} rows={2} />
          </div>
        ))}
      </fieldset>
      <Placeholders rows={view.placeholders} />
      <SeoFields kind="home" seo={home.seo} issues={issues} />
    </>
  );
}

function ContactFields({ view, contact }: { view: EditorView; contact: ContactContent }) {
  const { issues } = view;
  return (
    <>
      <fieldset className="ad-fs">
        <legend>راه‌های تماس</legend>
        <div className="ad-pair">
          <ContentField
            name="mobile"
            label="موبایل، پیامک و تماس"
            optional
            ltr
            inputMode="tel"
            value={contact.mobile}
            issues={issues}
            hint={
              <>
                با <span className="num">09</span>؛ ارقام فارسی و <bdi className="ad-ltr">+98</bdi> هم پذیرفته‌اند.
              </>
            }
          />
          <ContentField name="phone" label="تلفن ثابت" optional ltr inputMode="tel" value={contact.phone} issues={issues} hint="با پیش‌شمارهٔ شهر." />
        </div>
        <ContentField name="email" label="ایمیل" optional ltr inputMode="email" value={contact.email} issues={issues} />
        <div className="ad-pair">
          <ContentField
            name="telegram"
            label="تلگرام"
            optional
            ltr
            prefix="t.me/"
            value={contact.telegram}
            issues={issues}
            hint="فقط شناسه؛ پیوند را سایت می‌سازد."
          />
          <ContentField name="instagram" label="اینستاگرام" optional ltr prefix="instagram.com/" value={contact.instagram} issues={issues} />
        </div>
        <ContentField name="hours" label="ساعت پاسخ‌گویی" optional value={contact.hours} issues={issues} />
        <ContentField name="address" label="نشانی" optional value={contact.address} issues={issues} rows={3} />
        <ContentField
          name="postalCode"
          label="کد پستی"
          optional
          ltr
          inputMode="numeric"
          value={contact.postalCode}
          issues={issues}
          className="ad-code"
          hint="ده رقم، کنار نشانی."
        />
        <p className="ad-hint">هر راهی که خالی بماند روی سایت نمی‌آید. بی هیچ راه تماسی، صفحهٔ «تماس» و پیوندش در پاورقی پنهان می‌شوند.</p>
      </fieldset>
      <fieldset className="ad-fs">
        <legend>پاورقی</legend>
        <ContentField name="footerIntro" label="معرفی زیر لوگو" value={contact.footerIntro} issues={issues} rows={2} />
        <ContentField name="footerLegal" label="جملهٔ پایین" optional value={contact.footerLegal} issues={issues} />
      </fieldset>
      <SeoFields kind="contact" seo={contact.seo} issues={issues} />
    </>
  );
}

/** سؤالی که باز است: همانی که کار فهرست جابه‌جا یا افزود (`?open=`)، وگرنه سؤال‌های خطادار، وگرنه اولی. */
function openItems(view: EditorView, openParam: string): Set<number> {
  const count = (view.content as FaqContent).items.length;
  const asked = /^\d{1,2}$/.test(openParam) ? Number(openParam) : -1;
  if (asked >= 0 && asked < count) return new Set([asked]);
  const withIssues = view.issues.flatMap((issue) => {
    const match = /^items\.(\d+)\./.exec(issue.field);
    return match ? [Number(match[1])] : [];
  });
  return new Set(withIssues.length > 0 ? withIssues : [0]);
}

function FaqFields({ view, faq, open }: { view: EditorView; faq: FaqContent; open: Set<number> }) {
  const last = faq.items.length - 1;
  return (
    <ol className="ad-faq" data-testid="faq-items">
      {faq.items.map((item, i) => (
        <li key={i} id={`faq-${i + 1}`}>
          <details open={open.has(i)}>
            <summary>
              <span className="ad-faq__n num">{i + 1}</span>
              <span className="ad-faq__q">{item.q || 'سؤال تازه'}</span>
              <span className="jy-icon jy-icon-chevron" aria-hidden="true" />
            </summary>
            <div className="ad-faq__body">
              <ContentField name={`items.${i}.q`} label="پرسش" value={item.q} issues={view.issues} />
              <ContentField
                name={`items.${i}.a`}
                label="پاسخ"
                value={item.a}
                issues={view.issues}
                rows={4}
                hint={
                  <>
                    یک بند، تا <span className="num">800</span> نویسه؛ پررنگ، پیوند و جای‌نگهدار مثل متن صفحه‌ها.
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
  );
}

/** «انتشار…»، «ذخیره و پیش‌نمایش» و «دور انداختن پیش‌نویس»؛ «انتشار…» با پیش‌نویس خطادار بسته است (طرح «خطای متن»). */
function Actions({ view, discardHref }: { view: EditorView; discardHref: string }) {
  return (
    <div className="ad-actions">
      <StatusButton className="jy-btn jy-btn--primary" name="intent" value="publish" disabled={view.issues.length > 0}>
        انتشار…
      </StatusButton>
      <StatusButton className="jy-btn jy-btn--secondary" name="intent" value="save">
        ذخیره و پیش‌نمایش
      </StatusButton>
      {view.draft ? (
        <Link href={discardHref} className="jy-btn jy-btn--text" scroll={false}>
          دور انداختن پیش‌نویس
        </Link>
      ) : null}
    </div>
  );
}

/**
 * ویرایش یک متن سایت (برش ۱۱٫۱، ADR-065؛ طرح «ویرایش قوانین»، «خطای متن»، «صفحهٔ اصلی»، «سؤال‌ها» و «تماس و پاورقی»؛ سؤال‌های ۲۸۳ تا ۲۹۰).
 * فرم پیش‌نویس است، نه سایت: «ذخیره و پیش‌نمایش» پیش‌نویس را با خطا هم نگه می‌دارد و پیش‌نمایش با ظاهر سایت و عدد امروز جای‌نگهدارها کنارش
 * است؛ «انتشار…» فقط بی خطا به صفحهٔ انتشار می‌رود. سؤال‌ها فهرستی بی JS با افزودن، حذف، بالاتر و پایین‌تر، که هر کدام همان فرم را ذخیره
 * می‌کند. فرم با هر ذخیره از نو سوار می‌شود (`key`)، تا فیلدها همان متن یکدست‌شدهٔ سرور را داشته باشند. فقط مالک (`content.edit`).
 */
export default async function ContentEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string; kind: string }>;
  searchParams: Promise<Query>;
}) {
  const { gate, kind: param } = await params;
  const query = await searchParams;
  const { content } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'content.edit')) return <NoAccess gate={gate} session={session} />;
  const result = await content.editor(session, param);
  if (!result.ok) {
    if (result.error === 'content_not_found') notFound();
    return <NoAccess gate={gate} session={session} />;
  }
  const view = result.value;
  const { kind, live, draft, issues, now } = view;
  const self = panelPath(gate, `/content/${kind}`);
  const error = ERRORS.has(one(query, 'e')) ? one(query, 'e') : null;
  const discarding = one(query, 'discard') === '1' && draft !== null;
  const formKey = `${one(query, 'n')}:${draft?.updatedAt.getTime() ?? 0}:${live.latest?.version ?? 0}`;
  const liveCount = faqCountOf(live.content);

  let fields: ReactNode;
  if (kind === 'home') fields = <HomeFields view={view} home={view.content as HomeContent} />;
  else if (kind === 'contact') fields = <ContactFields view={view} contact={view.content as ContactContent} />;
  else if (isPageKind(kind)) fields = <PageFields view={view} page={view.content as PageContent} />;
  else fields = null;

  const form = (children: ReactNode) => (
    <form action={saveContentAction} key={formKey}>
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="faqCount" value={kind === 'faq' ? (view.content as FaqContent).items.length : 0} />
      {children}
    </form>
  );

  return (
    <>
      <Link href={panelPath(gate, '/content')} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        محتوای سایت
      </Link>
      <div className="ad-pagehead">
        <div>
          <div className="ad-title-row">
            <h1 className="ad-title">{KIND_NAMES[kind]}</h1>
            {draft ? (
              <span className="jy-badge jy-badge--warning">
                <span className="jy-icon jy-icon-warning" aria-hidden="true" />
                پیش‌نویس
              </span>
            ) : live.isDefault ? (
              <span className="jy-badge jy-badge--neutral">متن پیش‌فرض سایت</span>
            ) : null}
          </div>
          <p className="ad-sub">
            <ContentSegs segs={editorSub(kind, live, draft, liveCount, now)} />
          </p>
        </div>
        {live.latest ? (
          <Link href={`${self}/versions`} className="jy-btn jy-btn--secondary">
            نسخه‌ها
          </Link>
        ) : null}
      </div>

      {error ? (
        <Alert tone="error">{messageOf(error)}</Alert>
      ) : one(query, 'discarded') === '1' ? (
        <Alert tone="success">پیش‌نویس دور انداخته شد؛ فرم همان متن روی سایت را دارد.</Alert>
      ) : one(query, 'same') === '1' ? (
        <Alert tone="info">متن همان است که روی سایت است؛ پیش‌نویسی نماند.</Alert>
      ) : one(query, 'saved') === '1' && draft && issues.length === 0 ? (
        <Alert tone="success">پیش‌نویس ذخیره شد. روی سایت چیزی عوض نشده تا «انتشار…».</Alert>
      ) : null}

      {issues.length > 0 ? (
        <div className="jy-note jy-note--error ad-gap" role="alert" data-testid="content-issues">
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

      {discarding && draft ? (
        <div className="ad-step ad-gap" data-testid="content-discard">
          <p className="ad-step__title">دور انداختن پیش‌نویس</p>
          <p className="jy-note jy-note--warning ad-gap">
            <span className="jy-icon jy-icon-warning" aria-hidden="true" />
            <span>
              پیش‌نویس {whenText(draft.createdAt, now)} پاک می‌شود و برنمی‌گردد. روی سایت همان{' '}
              {live.isDefault || !live.latest ? (
                'متن پیش‌فرض'
              ) : (
                <>
                  نسخهٔ <span className="num">{formatNumber(live.latest.version)}</span>
                </>
              )}{' '}
              می‌ماند.
            </span>
          </p>
          <form action={discardContentAction} className="ad-actions">
            <input type="hidden" name="gate" value={gate} />
            <input type="hidden" name="kind" value={kind} />
            <StatusButton className="jy-btn jy-btn--danger">دور بینداز</StatusButton>
            <Link href={self} className="jy-btn jy-btn--text" scroll={false}>
              انصراف
            </Link>
          </form>
        </div>
      ) : null}

      {kind === 'faq' ? (
        <section className="jy-card ad-faqcard ad-gap" aria-label="سؤال‌ها">
          {form(
            <>
              <FaqFields view={view} faq={view.content as FaqContent} open={openItems(view, one(query, 'open'))} />
              <div className="ad-actions">
                <button
                  type="submit"
                  name="op"
                  value="add"
                  className="jy-btn jy-btn--secondary"
                  disabled={(view.content as FaqContent).items.length >= FAQ_MAX_ITEMS}
                >
                  <span className="jy-icon jy-icon-plus" aria-hidden="true" />
                  افزودن سؤال
                </button>
              </div>
              <p className="ad-hint ad-gap">
                ترتیب همین است که روی سایت می‌آید، تا <span className="num">{FAQ_MAX_ITEMS}</span> سؤال. پاسخ همان متن، بی پیوند و پررنگ، در دادهٔ گوگل (
                <bdi className="ad-ltr">FAQPage</bdi>) هم هست. کل فهرست با هم منتشر می‌شود.
              </p>
              <Placeholders rows={view.placeholders} />
              <Actions view={view} discardHref={`${self}?discard=1`} />
            </>,
          )}
          <p className="ad-hint ad-gap">پیش‌نویس تا انتشار یا «دور انداختن» می‌ماند و روی سایت نیست. رقم‌ها لاتین و «ي» و «ك» فارسی می‌شوند.</p>
        </section>
      ) : (
        <div className="ad-ed ad-gap">
          <section className="jy-card" aria-labelledby="ed-title">
            <h2 id="ed-title" className={kind === 'home' || kind === 'contact' ? 'sr-only' : 'jy-card__title'}>
              متن
            </h2>
            {form(
              <>
                <div className="ad-form">{fields}</div>
                <Actions view={view} discardHref={`${self}?discard=1`} />
              </>,
            )}
            <p className="ad-hint ad-gap">پیش‌نویس تا انتشار یا «دور انداختن» می‌ماند و روی سایت نیست. رقم‌ها لاتین و «ي» و «ك» فارسی می‌شوند.</p>
          </section>

          <section className="jy-card ad-pv" aria-labelledby="pv-title">
            <div className="jy-card__head">
              <h2 id="pv-title" className="jy-card__title">
                {kind === 'contact' ? 'پیش‌نمایش «تماس»' : 'پیش‌نمایش'}
              </h2>
              <span className="jy-card__meta">
                <ContentSegs segs={previewMeta(live, draft, now)} />
              </span>
            </div>
            {issues.length > 0 ? (
              <Alert tone="info">
                <ContentSegs segs={previewBlocked(issues.length, live)} />
              </Alert>
            ) : (
              <>
                <ContentPreview
                  kind={kind}
                  content={view.content}
                  values={view.values}
                  contactAddress={view.contactAddress}
                  {...(draft && (kind === 'terms' || kind === 'privacy') ? { updated: formatJalaliNumeric(now) } : {})}
                />
                <p className="ad-hint ad-gap">
                  {kind === 'home'
                    ? 'روی سایت کارت بارگذاری کنار قهرمان است و «سه قدم» زیرش، با همان چیدمان امروز. عددهای خط‌چین از جای‌نگهدارند.'
                    : kind === 'contact'
                      ? 'جملهٔ بالا با راه‌ها عوض می‌شود: فقط ایمیل یعنی «شمارهٔ سفارشت را در ایمیلت بنویس».'
                      : 'عددهای خط‌چین از جای‌نگهدارند: با «تنظیمات» و تعرفهٔ فعال عوض می‌شوند و متن هرگز با آن‌ها فرق نمی‌کند.'}
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
