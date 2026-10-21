/**
 * سرویس صفحه‌های فرود و «تعرفه» در پنل (`pages.ts`، برش ۱۵٫۲) با ذخیره‌گاه حافظه‌ای: مجوز در سرور پیش از هر خواندن، فرم یکدست و سنجیده با سایت
 * همین حالا، صفحهٔ تازه با اولین ذخیره، پیش‌نویس با خطا هم و همان متن روی سایت بی پیش‌نویس، «چه عوض می‌شود»، هر سنجش انتشار پیش از کد تازه،
 * همین حالا و زمان‌دار، پس گرفتن بی کد، برداشتن با پیوندهایی که «پیدا نشد» را می‌بندند، و پاسخ ذخیره‌گاه زیر قفل. قفل، تراکنش، رویداد و
 * محافظ‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { describe, expect, it } from 'vitest';

import {
  SEED_FACTS,
  defaultTariffPage,
  emptyLanding,
  pageFieldsOf,
  pageValues,
  placeholderValues,
  readPagePath,
  type AnyPageContent,
  type LandingContent,
  type SitePageKind,
} from '@jozveyar/content';
import {
  pageStateAt,
  slugWasOnSite,
  type PageWriteOutcome,
  type SitePageDetail,
  type SitePageDraftRow,
  type SitePageStore,
  type SitePageVersionRow,
  type SlugResolution,
} from '@jozveyar/db';
import { NONE_PAUSED } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

import type { AdminSession } from './auth';
import {
  applyPageFaqOp,
  createPanelPages,
  liveFromOf,
  loadPageFacts,
  loadSiteTexts,
  pageFaqOpOf,
  pagePublishFromOf,
  pageRefOf,
  pageSeen,
  tehranInstant,
  type PageFacts,
  type SiteTexts,
} from './pages';
import { fail, ok, type Result } from './result';

const NOW = new Date('2026-10-21T07:50:00Z'); // چهارشنبه 29 مهر 1405، 11:20 تهران
const SECRET = 's'.repeat(64);
const IP = '203.0.113.7';
const GOOD_CODE = '123456';

function session(roles: string[], permissions: string[]): AdminSession {
  return {
    sessionId: 's1',
    userId: 'admin-1',
    username: 'sara',
    displayName: 'سارا',
    roles,
    permissions,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    partner: null,
  };
}
const OWNER = session(['owner'], ['orders.read', 'content.edit', 'content.bar']);
const OPERATOR = session(['operator'], ['orders.read', 'orders.status', 'content.bar']);

const FACTS: PageFacts = {
  priceList: SEED_PRICE_LIST,
  paused: NONE_PAUSED,
  maxPages: 1500,
  values: pageValues(placeholderValues(SEED_FACTS), { at: NOW, priceChangedAt: new Date('2026-10-07T08:00:00Z') }),
  priceChangedAt: new Date('2026-10-07T08:00:00Z'),
};

/** صفحهٔ فرود درست، با نشانی و تیترش. */
const landing = (slug: string, change: Partial<LandingContent> = {}): LandingContent => ({
  slug,
  name: 'پرینت PDF',
  title: 'پرینت PDF آنلاین، با صحافی و ارسال',
  lead: 'فایل PDF را بینداز؛ قیمت همان لحظه.',
  body: '## PDF همان‌طور چاپ می‌شود\nبند با [تعرفه](/tarefe).\n\n[[قیمت: 200 صفحه، سیاه‌سفید، دورو، طلق و سیم]]',
  faq: [{ q: 'صفحهٔ افقی؟', a: 'می‌چرخد.' }],
  desk: { color: '', sides: '', size: '', paper: '', binding: '' },
  inFooter: true,
  seo: { title: 'پرینت فایل PDF آنلاین {سال}', description: 'چاپ هر رو {نرخ_سیاه_سفید} تومان.' },
  ...change,
});

/**
 * ذخیره‌گاه حافظه‌ای با همان قرارداد: نسخه‌ها پشت‌سرهم، نشانی‌ای که صفحه یک بار گرفت مال اوست، یک زمان‌دار در راه، «همان که دیده شد» با آخرین
 * شماره، و پیش‌نویس منتشرشده پاک. `answerNext` جواب بعدی نوشتن را عوض می‌کند (همان که ذخیره‌گاه واقعی زیر قفل می‌بیند).
 */
function memoryStore() {
  const pages: { id: number; kind: SitePageKind; createdAt: Date }[] = [];
  const versions: SitePageVersionRow[] = [];
  const drafts = new Map<number, SitePageDraftRow>();
  const slugs: { slug: string; pageId: number }[] = [];
  const calls: string[] = [];
  const writes: { kind: string; input: unknown }[] = [];
  let next: PageWriteOutcome | null = null;

  const detailOf = (page: (typeof pages)[number]): SitePageDetail => ({
    page,
    versions: versions.filter((row) => row.pageId === page.id).sort((a, b) => b.version - a.version),
    draft: drafts.get(page.id) ?? null,
    slugs: slugs.filter((row) => row.pageId === page.id).map((row) => row.slug),
  });
  const all = () => pages.map(detailOf);
  const latest = (pageId: number) => Math.max(0, ...versions.filter((row) => row.pageId === pageId).map((row) => row.version));
  const forced = () => {
    const outcome = next;
    next = null;
    return outcome;
  };
  const push = (row: Omit<SitePageVersionRow, 'id' | 'createdBy' | 'createdByName' | 'withdrawnAt'>) => {
    versions.push({ ...row, id: versions.length + 1, createdBy: 'admin-1', createdByName: 'سارا', withdrawnAt: null });
  };
  function pathOf(pageId: number | null, at: Date): string | null {
    if (pageId === null) return '/';
    const page = pages.find((row) => row.id === pageId);
    if (!page) return '/';
    if (page.kind === 'tariff') return '/tarefe';
    const live = pageStateAt(detailOf(page).versions, at).live;
    if (!live) return null;
    if (live.content !== null) return `/${live.slug}`;
    return live.removal === 'moved' ? pathOf(live.movedTo, at) : null;
  }
  function resolve(slug: string, at: Date): SlugResolution {
    const owner = slugs.find((row) => row.slug === slug);
    if (!owner) return { kind: 'none' };
    const page = pages.find((row) => row.id === owner.pageId)!;
    const live = pageStateAt(detailOf(page).versions, at).live;
    if (!live || !slugWasOnSite(detailOf(page).versions, slug, at)) return { kind: 'none' };
    if (live.content !== null) {
      return live.slug === slug
        ? { kind: 'page', page: { pageId: page.id, kind: page.kind, slug, content: live.content, version: live.version, since: live.liveFrom } }
        : { kind: 'redirect', to: `/${live.slug}` };
    }
    const to = live.removal === 'moved' ? pathOf(live.movedTo, at) : null;
    return to ? { kind: 'redirect', to } : { kind: 'gone' };
  }

  const store: SitePageStore = {
    async all() {
      calls.push('all');
      return all();
    },
    async detail(id) {
      calls.push('detail');
      const page = pages.find((row) => row.id === id);
      return page ? detailOf(page) : null;
    },
    async tariff() {
      calls.push('tariff');
      const page = pages.find((row) => row.kind === 'tariff');
      return page ? detailOf(page) : null;
    },
    async live(at) {
      return all().flatMap((detail) => {
        const live = pageStateAt(detail.versions, at).live;
        return live && live.content !== null
          ? [{ pageId: detail.page.id, kind: detail.page.kind, slug: live.slug, content: live.content, version: live.version, since: live.liveFrom }]
          : [];
      });
    },
    async resolve(slug, at) {
      return resolve(slug, at);
    },
    async routes(at) {
      calls.push('routes');
      const out = { redirects: new Map<string, string>(), pages: new Set<string>() };
      for (const row of slugs) {
        const found = resolve(row.slug, at);
        if (found.kind === 'redirect') out.redirects.set(row.slug, found.to);
        else if (found.kind === 'page' && found.page.kind === 'landing') out.pages.add(row.slug);
      }
      return out;
    },
    async slugOwner(slug) {
      return slugs.find((row) => row.slug === slug)?.pageId ?? null;
    },
    async saveDraft({ pageId, kind, content, at }) {
      calls.push('saveDraft');
      let id = pageId ?? (kind === 'tariff' ? (pages.find((row) => row.kind === 'tariff')?.id ?? null) : null);
      if (id === null) {
        id = pages.length + 1;
        pages.push({ id, kind, createdAt: at });
      }
      const before = drafts.get(id);
      const draft: SitePageDraftRow = {
        pageId: id,
        content: structuredClone(content),
        baseVersion: before?.baseVersion ?? latest(id),
        updatedBy: 'admin-1',
        updatedByName: 'سارا',
        createdAt: before?.createdAt ?? at,
        updatedAt: at,
      };
      drafts.set(id, draft);
      return { pageId: id, draft };
    },
    async discardDraft(pageId) {
      calls.push('discardDraft');
      const discarded = drafts.delete(pageId);
      const page = pages.find((row) => row.id === pageId);
      const deleted = page?.kind === 'landing' && latest(pageId) === 0;
      if (deleted) pages.splice(pages.indexOf(page!), 1);
      return { discarded, deleted };
    },
    async publish(input) {
      calls.push('publish');
      writes.push({ kind: 'publish', input });
      const outcome = forced();
      if (outcome) return outcome;
      const { pageId, expectedVersion, source, liveFrom, at } = input;
      const page = pages.find((row) => row.id === pageId);
      if (!page) return { ok: false, reason: 'not_found' };
      if (latest(pageId) !== expectedVersion) return { ok: false, reason: 'stale' };
      if (pageStateAt(detailOf(page).versions, at).pending) return { ok: false, reason: 'pending' };
      let content: unknown;
      let slug = 'tarefe';
      let restoredFrom: number | null = null;
      if (source.type === 'draft') {
        const draft = drafts.get(pageId);
        if (!draft || !source.verify(draft.content)) return { ok: false, reason: 'draft_changed' };
        content = source.content;
        if (page.kind === 'landing') slug = source.slug;
      } else if (source.type === 'default') {
        content = null;
        restoredFrom = 0;
      } else {
        const row = versions.find((v) => v.pageId === pageId && v.version === source.version);
        if (!row || row.content === null) return { ok: false, reason: 'not_found' };
        content = row.content;
        slug = row.slug;
        restoredFrom = source.version;
      }
      if (page.kind === 'landing') {
        const owner = slugs.find((row) => row.slug === slug);
        if (owner && owner.pageId !== pageId) return { ok: false, reason: 'slug_taken' };
        if (!owner) slugs.push({ slug, pageId });
      }
      const version = latest(pageId) + 1;
      push({ pageId, version, slug, content: structuredClone(content), restoredFrom, removal: null, movedTo: null, liveFrom, createdAt: at });
      if (source.type === 'draft') drafts.delete(pageId);
      return { ok: true, version };
    },
    async withdraw({ pageId, version, at }) {
      calls.push('withdraw');
      writes.push({ kind: 'withdraw', input: { pageId, version } });
      const outcome = forced();
      if (outcome) return outcome;
      const row = versions.find((v) => v.pageId === pageId && v.version === version);
      if (!row) return { ok: false, reason: 'not_found' };
      if (row.withdrawnAt) return { ok: false, reason: 'stale' };
      if (row.liveFrom <= at) return { ok: false, reason: 'live' };
      row.withdrawnAt = at;
      if (row.content !== null && !drafts.has(pageId)) {
        drafts.set(pageId, { pageId, content: row.content, baseVersion: version, updatedBy: 'admin-1', updatedByName: 'سارا', createdAt: at, updatedAt: at });
      }
      return { ok: true, version };
    },
    async remove(input) {
      calls.push('remove');
      writes.push({ kind: 'remove', input });
      const outcome = forced();
      if (outcome) return outcome;
      const { pageId, expectedVersion, mode, movedTo, at } = input;
      if (latest(pageId) !== expectedVersion) return { ok: false, reason: 'stale' };
      const page = pages.find((row) => row.id === pageId)!;
      const live = pageStateAt(detailOf(page).versions, at).live!;
      let target: number | null = null;
      if (mode === 'moved' && movedTo === 'tariff') {
        target = pages.find((row) => row.kind === 'tariff')?.id ?? null;
        if (target === null) {
          target = pages.length + 1;
          pages.push({ id: target, kind: 'tariff', createdAt: at });
        }
      } else if (mode === 'moved' && typeof movedTo === 'number') target = movedTo;
      const version = expectedVersion + 1;
      push({ pageId, version, slug: live.slug, content: null, restoredFrom: null, removal: mode, movedTo: target, liveFrom: at, createdAt: at });
      return { ok: true, version };
    },
  };
  return { store, rows: pages, versions, drafts, slugs, calls, writes, answerNext: (outcome: PageWriteOutcome) => (next = outcome) };
}

function setup(texts: SiteTexts = { links: [], contact: true }) {
  const memory = memoryStore();
  const stepUps: unknown[] = [];
  let now = NOW;
  const pages = createPanelPages({
    store: memory.store,
    facts: async () => FACTS,
    siteTexts: async () => texts,
    secret: SECRET,
    now: () => now,
    async stepUp(_session, code): Promise<Result<true>> {
      stepUps.push(code);
      return code === GOOD_CODE ? ok(true) : fail(400, 'wrong_code');
    },
  });
  return { ...memory, pages, stepUps, setNow: (at: Date) => (now = at) };
}

/** فیلدهای فرم از یک متن، به نام مسیرشان. */
function formOf(kind: SitePageKind, value: AnyPageContent, change: Record<string, string> = {}) {
  const fields = new Map(pageFieldsOf(kind, value.faq.length).map((spec) => [spec.name, readPagePath(value, spec.name)]));
  if (kind === 'landing') {
    const page = value as LandingContent;
    for (const name of ['color', 'sides', 'size', 'paper', 'binding'] as const) fields.set(`desk.${name}`, page.desk[name]);
    fields.set('inFooter', page.inFooter ? '1' : '');
  }
  for (const [name, text] of Object.entries(change)) fields.set(name, text);
  return { field: (name: string) => fields.get(name) ?? '', faqCount: value.faq.length };
}

/** صفحهٔ فرود تازه با ذخیره و انتشار همین حالا، از راه خود سرویس. */
async function publishedPage(env: ReturnType<typeof setup>, content: LandingContent): Promise<string> {
  const saved = await env.pages.save(OWNER, 'new', formOf('landing', content), IP);
  if (!saved.ok || !saved.value.param) throw new Error(saved.ok ? 'no page' : saved.error);
  const view = await env.pages.publishView(OWNER, saved.value.param, undefined);
  if (!view.ok) throw new Error(view.error);
  const done = await env.pages.publish(
    OWNER,
    saved.value.param,
    { from: 'draft', version: String(view.value.seenVersion), seen: view.value.seen, when: 'now', day: '', hour: '', code: GOOD_CODE },
    IP,
  );
  if (!done.ok) throw new Error(done.error);
  return saved.value.param;
}

const errorOf = (result: { ok: boolean; status?: number; error?: string }) => (result.ok ? 'ok' : `${result.status} ${result.error}`);

describe('ورودی‌ها', () => {
  it('نشانی پنل: تازه، «تعرفه» و شماره', () => {
    expect([pageRefOf('new'), pageRefOf('tarefe'), pageRefOf('12'), pageRefOf('0'), pageRefOf('x')]).toEqual([
      { type: 'new' },
      { type: 'tariff' },
      { type: 'id', id: 12 },
      null,
      null,
    ]);
    expect([pagePublishFromOf(undefined), pagePublishFromOf('default'), pagePublishFromOf('3'), pagePublishFromOf('-1')]).toEqual([
      { type: 'draft' },
      { type: 'default' },
      { type: 'version', version: 3 },
      null,
    ]);
  });

  it('کار سؤال‌ها: افزودن تا سقف ده، جابه‌جایی و حذف؛ جای ناموجود هیچ', () => {
    const page = landing('print-pdf', { faq: [{ q: 'یک', a: '۱' }, { q: 'دو', a: '۲' }] });
    expect(applyPageFaqOp(page, { op: 'add' })!.faq).toHaveLength(3);
    expect(applyPageFaqOp(page, { op: 'down', index: 0 })!.faq.map((item) => item.q)).toEqual(['دو', 'یک']);
    expect(applyPageFaqOp(page, { op: 'delete', index: 1 })!.faq.map((item) => item.q)).toEqual(['یک']);
    expect(applyPageFaqOp(page, { op: 'up', index: 0 })).toBeNull();
    expect(applyPageFaqOp({ ...page, faq: Array.from({ length: 10 }, () => ({ q: 'پ', a: 'پا' })) }, { op: 'add' })).toBeNull();
    expect([pageFaqOpOf('add'), pageFaqOpOf('up:2'), pageFaqOpOf('drop:1')]).toEqual([{ op: 'add' }, { op: 'up', index: 2 }, null]);
  });

  it('کی روی سایت برود: همین حالا، یا روز و ساعت تهران؛ گذشته، دورتر از ۹۰ روز، و شکل نادرست هر کدام با فیلدش', () => {
    expect(tehranInstant(new Date('2026-10-22T20:30:00Z'), 9, 0).toISOString()).toBe('2026-10-23T05:30:00.000Z');
    expect(liveFromOf({ when: 'now', day: '', hour: '' }, NOW)).toEqual({ ok: true, at: NOW });
    expect(liveFromOf({ when: 'at', day: '1405/08/01', hour: '۰۹:۰۰' }, NOW)).toEqual({ ok: true, at: new Date('2026-10-23T05:30:00Z') });
    expect(liveFromOf({ when: 'later', day: '', hour: '' }, NOW)).toMatchObject({ ok: false, error: 'page_when_invalid', field: 'when' });
    expect(liveFromOf({ when: 'at', day: '1405/13/01', hour: '09:00' }, NOW)).toMatchObject({ ok: false, error: 'page_day_invalid', field: 'day' });
    expect(liveFromOf({ when: 'at', day: '1405/08/01', hour: '24:00' }, NOW)).toMatchObject({ ok: false, error: 'page_hour_invalid', field: 'hour' });
    // امروز ۱۱:۲۰ تهران است: ساعت ۱۱:۰۰ امروز گذشته، و خود همین دقیقه هم «همین حالا» است، نه زمان‌دار؛ دقیقهٔ بعد زمان‌دار.
    expect(liveFromOf({ when: 'at', day: '1405/07/29', hour: '11:00' }, NOW)).toMatchObject({ ok: false, error: 'page_time_past', field: 'day' });
    expect(liveFromOf({ when: 'at', day: '1405/07/29', hour: '11:20' }, NOW)).toMatchObject({ ok: false, error: 'page_time_past', field: 'day' });
    expect(liveFromOf({ when: 'at', day: '1405/07/29', hour: '11:21' }, NOW)).toEqual({ ok: true, at: new Date(NOW.getTime() + 60_000) });
    // تا ۹۰ روز بعد: هر ساعت روز نودم (۲۹ دی) پذیرفته، و روز نود و یکم نه.
    expect(liveFromOf({ when: 'at', day: '1405/10/29', hour: '23:59' }, NOW)).toMatchObject({ ok: true });
    expect(liveFromOf({ when: 'at', day: '1405/10/30', hour: '00:00' }, NOW)).toMatchObject({ ok: false, error: 'page_time_far', field: 'day' });
  });
});

describe('دسترسی', () => {
  it('هر کار فقط با `content.edit`، پیش از هر خواندن؛ نشانی ناشناس ۴۰۴', async () => {
    const env = setup();
    const results = await Promise.all([
      env.pages.overview(OPERATOR),
      env.pages.editor(OPERATOR, 'new'),
      env.pages.save(OPERATOR, 'new', formOf('landing', landing('print-pdf')), IP),
      env.pages.discard(OPERATOR, '1'),
      env.pages.publishView(OPERATOR, '1', undefined),
      env.pages.publish(OPERATOR, '1', { from: 'draft', version: '0', seen: 'x', when: 'now', day: '', hour: '', code: GOOD_CODE }, IP),
      env.pages.withdraw(OPERATOR, '1', { version: '1' }, IP),
      env.pages.removeView(OPERATOR, '1'),
      env.pages.remove(OPERATOR, '1', { version: '1', mode: 'gone', to: '', code: GOOD_CODE }, IP),
      env.pages.versions(OPERATOR, 'tarefe'),
      env.pages.version(OPERATOR, 'tarefe', 'default'),
    ]);
    expect(results.map(errorOf)).toEqual(Array(11).fill('403 forbidden'));
    expect([env.calls, env.stepUps]).toEqual([[], []]);
    expect(errorOf(await env.pages.editor(OWNER, 'print-pdf'))).toBe('404 page_not_found');
    expect(errorOf(await env.pages.editor(OWNER, '9'))).toBe('404 page_not_found');
  });
});

describe('ویرایشگر و پیش‌نویس (سؤال ۴۶۲)', () => {
  it('صفحهٔ تازه: خالی ذخیره نمی‌شود؛ با متن، شماره می‌گیرد و پیش‌نویس با خطا هم می‌ماند', async () => {
    const env = setup();
    const empty = await env.pages.save(OWNER, 'new', formOf('landing', emptyLanding()), IP);
    expect(empty).toEqual({ ok: true, value: { param: null, draft: null, issues: [], warnings: [] } });
    expect(env.rows).toEqual([]);
    expect(env.calls).not.toContain('saveDraft');

    const saved = await env.pages.save(OWNER, 'new', formOf('landing', emptyLanding(), { slug: ' /Print PDF ', title: 'پرينت ۱' }), IP);
    if (!saved.ok) throw new Error(saved.error);
    expect(saved.value.param).toBe('1');
    expect(saved.value.draft?.content).toMatchObject({ slug: 'print-pdf', title: 'پرینت 1' });
    expect(saved.value.issues.map((issue) => [issue.field, issue.code])).toEqual([
      ['name', 'required'],
      ['lead', 'required'],
      ['body', 'required'],
      ['seo.title', 'required'],
      ['seo.description', 'required'],
    ]);

    const view = await env.pages.editor(OWNER, '1');
    if (!view.ok) throw new Error(view.error);
    expect([view.value.kind, (view.value.content as LandingContent).slug, view.value.issues.length]).toEqual(['landing', 'print-pdf', 5]);
    expect(view.value.placeholders.map((row) => row.name).slice(-2)).toEqual(['سال', 'تغییر_قیمت']);
    expect(view.value.placeholders.at(-2)?.value).toBe('1405');
  });

  it('سنجش با سایت همین حالا: نشانی رزرو و نشانی صفحهٔ دیگر، پیوند به صفحه‌ای که روی سایت نیست، و پیوند به نشانی خود صفحه', async () => {
    const env = setup({ links: [], contact: false });
    await publishedPage(env, landing('sahafi', { name: 'صحافی' }));
    const body = '[صحافی](/sahafi) و [خودش](/print-pdf) و [تماس](/contact) و [مقاله](/articles/scan-zard).';
    const saved = await env.pages.save(OWNER, 'new', formOf('landing', landing('print-pdf', { body })), IP);
    if (!saved.ok) throw new Error(saved.error);
    expect(saved.value.issues.map((issue) => [issue.code, issue.detail])).toEqual([
      ['link_not_live', '/contact'],
      ['link_not_live', '/articles/scan-zard'],
    ]);
    const taken = await env.pages.save(OWNER, saved.value.param!, formOf('landing', landing('sahafi')), IP);
    const orders = await env.pages.save(OWNER, saved.value.param!, formOf('landing', landing('orders')), IP);
    expect([taken.ok && taken.value.issues[0]?.code, orders.ok && orders.value.issues[0]?.code]).toEqual(['slug_taken', 'slug_reserved']);
  });

  it('متنی که همان روی سایت است پیش‌نویس نمی‌ماند؛ سؤال‌ها بی JS؛ متن خیلی بزرگ ۴۱۳', async () => {
    const env = setup();
    const param = await publishedPage(env, landing('print-pdf'));
    await env.pages.save(OWNER, param, formOf('landing', landing('print-pdf', { title: 'تیتر تازه' })), IP);
    expect(env.drafts.size).toBe(1);
    const same = await env.pages.save(OWNER, param, formOf('landing', landing('print-pdf')), IP);
    expect(same).toEqual({ ok: true, value: { param, draft: null, issues: [], warnings: [] } });
    expect(env.drafts.size).toBe(0);

    const added = await env.pages.save(OWNER, param, { ...formOf('landing', landing('print-pdf')), op: { op: 'add' } }, IP);
    if (!added.ok) throw new Error(added.error);
    expect((added.value.draft!.content as LandingContent).faq).toHaveLength(2);
    expect(added.value.issues.map((issue) => issue.field)).toEqual(['faq.1.q', 'faq.1.a']);
    const full = { ...formOf('landing', landing('print-pdf', { faq: Array.from({ length: 10 }, () => ({ q: 'پ', a: 'پا' })) })), op: { op: 'add' as const } };
    expect(errorOf(await env.pages.save(OWNER, param, full, IP))).toBe('400 page_faq_full');
    expect(errorOf(await env.pages.save(OWNER, param, formOf('landing', landing('print-pdf', { body: 'ا'.repeat(140_000) })), IP))).toBe('413 page_too_large');
  });

  it('«تعرفه» با متن پیش‌فرض باز می‌شود و با اولین ذخیره ساخته می‌شود؛ متن پیش‌فرض پیش‌نویس نمی‌ماند', async () => {
    const env = setup();
    const view = await env.pages.editor(OWNER, 'tarefe');
    if (!view.ok) throw new Error(view.error);
    expect([view.value.detail, view.value.isDefault, view.value.content]).toEqual([null, true, defaultTariffPage()]);
    expect(await env.pages.save(OWNER, 'tarefe', formOf('tariff', defaultTariffPage()), IP)).toEqual({
      ok: true,
      value: { param: null, draft: null, issues: [], warnings: [] },
    });
    const saved = await env.pages.save(OWNER, 'tarefe', formOf('tariff', defaultTariffPage(), { title: 'قیمت چاپ جزوه' }), IP);
    expect(saved).toMatchObject({ ok: true, value: { param: 'tarefe', issues: [] } });
    expect(env.rows.map((row) => row.kind)).toEqual(['tariff']);
  });
});

describe('انتشار (سؤال ۴۶۵)', () => {
  it('هر سنجش پیش از کد: بی پیش‌نویس، پیش‌نویس خطادار، همان متن، و آنچه صفحه دید', async () => {
    const env = setup();
    const param = await publishedPage(env, landing('print-pdf'));
    expect(errorOf(await env.pages.publishView(OWNER, param, undefined))).toBe('409 page_no_draft');
    await env.pages.save(OWNER, param, formOf('landing', landing('print-pdf', { seo: { title: '', description: 'x' } })), IP);
    expect(errorOf(await env.pages.publishView(OWNER, param, undefined))).toBe('409 page_invalid');
    expect(errorOf(await env.pages.publishView(OWNER, param, '1'))).toBe('409 page_unchanged');

    await env.pages.save(OWNER, param, formOf('landing', landing('print-pdf-online', { title: 'تیتر تازه' })), IP);
    const view = await env.pages.publishView(OWNER, param, undefined);
    if (!view.ok) throw new Error(view.error);
    expect(view.value.liveSlug).toBe('print-pdf');
    expect(view.value.diff?.changes.map((change) => change.section)).toEqual(['نشانی', 'تیتر صفحه']);
    expect(view.value.seenVersion).toBe(1);
    const input = { from: 'draft', version: '1', seen: view.value.seen, when: 'now', day: '', hour: '', code: GOOD_CODE };
    const before = env.stepUps.length;
    expect(errorOf(await env.pages.publish(OWNER, param, { ...input, version: '0' }, IP))).toBe('409 page_changed');
    expect(errorOf(await env.pages.publish(OWNER, param, { ...input, seen: 'x' }, IP))).toBe('409 page_changed');
    expect(await env.pages.publish(OWNER, param, { ...input, when: 'at', day: '1405/07/01', hour: '09:00' }, IP)).toMatchObject({ ok: false, error: 'page_time_past', field: 'day' });
    expect(await env.pages.publish(OWNER, param, { ...input, code: ' ' }, IP)).toMatchObject({ ok: false, error: 'page_code_required', field: 'code' });
    expect(env.stepUps.length).toBe(before);
    expect(errorOf(await env.pages.publish(OWNER, param, { ...input, code: '000000' }, IP))).toBe('400 wrong_code');
    expect(await env.pages.publish(OWNER, param, input, IP)).toEqual({ ok: true, value: { param, version: 2, scheduled: false } });
    expect(env.writes.at(-1)).toMatchObject({ kind: 'publish', input: { expectedVersion: 1, liveFrom: NOW, source: { type: 'draft', slug: 'print-pdf-online' } } });
  });

  it('زمان‌دار: تا ساعتش روی سایت نیست، تا در راه است انتشار دیگر نه، و پس گرفتن بی کد که پیش‌نویس می‌شود', async () => {
    const env = setup();
    const saved = await env.pages.save(OWNER, 'new', formOf('landing', landing('print-rangi')), IP);
    const param = saved.ok ? saved.value.param! : '';
    const view = await env.pages.publishView(OWNER, param, undefined);
    if (!view.ok) throw new Error(view.error);
    expect([view.value.diff, view.value.liveSlug, view.value.dayDefault]).toEqual([null, null, '1405/07/30']);
    const done = await env.pages.publish(
      OWNER,
      param,
      { from: 'draft', version: '0', seen: view.value.seen, when: 'at', day: '1405/08/01', hour: '09:00', code: GOOD_CODE },
      IP,
    );
    expect(done).toEqual({ ok: true, value: { param, version: 1, scheduled: true } });
    const editor = await env.pages.editor(OWNER, param);
    if (!editor.ok) throw new Error(editor.error);
    expect([editor.value.state.pending?.version, editor.value.state.live, editor.value.draft]).toEqual([1, null, null]);
    await env.pages.save(OWNER, param, formOf('landing', landing('print-rangi', { title: 'دیگر' })), IP);
    expect(errorOf(await env.pages.publishView(OWNER, param, undefined))).toBe('409 page_pending');

    env.drafts.clear();
    expect(await env.pages.withdraw(OWNER, param, { version: '1' }, IP)).toEqual({ ok: true, value: { param, version: 1 } });
    expect(env.drafts.get(1)?.content).toMatchObject({ slug: 'print-rangi' });
    expect(env.stepUps).toEqual([GOOD_CODE]);
    env.answerNext({ ok: false, reason: 'live' });
    expect(errorOf(await env.pages.withdraw(OWNER, param, { version: '1' }, IP))).toBe('409 page_already_live');
  });

  it('برگرداندن نسخه با سنجش امروز، و «تعرفه» به متن پیش‌فرض؛ پاسخ ذخیره‌گاه زیر قفل به خطای پنل', async () => {
    const env = setup();
    const param = await publishedPage(env, landing('print-pdf'));
    await env.pages.save(OWNER, param, formOf('landing', landing('print-pdf', { title: 'دوم' })), IP);
    const second = await env.pages.publishView(OWNER, param, undefined);
    if (!second.ok) throw new Error(second.error);
    await env.pages.publish(OWNER, param, { from: 'draft', version: '1', seen: second.value.seen, when: 'now', day: '', hour: '', code: GOOD_CODE }, IP);
    const restore = await env.pages.publishView(OWNER, param, '1');
    if (!restore.ok) throw new Error(restore.error);
    expect(restore.value.source?.version).toBe(1);
    env.answerNext({ ok: false, reason: 'slug_taken' });
    expect(
      errorOf(await env.pages.publish(OWNER, param, { from: '1', version: '2', seen: restore.value.seen, when: 'now', day: '', hour: '', code: GOOD_CODE }, IP)),
    ).toBe('409 page_slug_taken');

    // «تعرفه»: متن پیش‌فرض تا نسخه‌ای نیست برنمی‌گردد.
    expect(errorOf(await env.pages.publishView(OWNER, 'tarefe', 'default'))).toBe('404 page_not_found');
    await env.pages.save(OWNER, 'tarefe', formOf('tariff', defaultTariffPage(), { title: 'قیمت چاپ' }), IP);
    const tariff = await env.pages.publishView(OWNER, 'tarefe', undefined);
    if (!tariff.ok) throw new Error(tariff.error);
    expect(tariff.value.diff?.changes.map((change) => change.section)).toEqual(['تیتر صفحه']);
    await env.pages.publish(OWNER, 'tarefe', { from: 'draft', version: '0', seen: tariff.value.seen, when: 'now', day: '', hour: '', code: GOOD_CODE }, IP);
    const back = await env.pages.publishView(OWNER, 'tarefe', 'default');
    expect(back).toMatchObject({ ok: true, value: { isDefault: false, content: defaultTariffPage() } });
  });
});

describe('برداشتن (سؤال ۴۶۶)', () => {
  it('مقصدها، پیوندهای روی سایت و زمان‌دار، و نشانی‌هایی که همین حالا به صفحه می‌روند', async () => {
    const texts: SiteTexts = { links: [{ where: 'سؤال‌ها', path: '/print-arzan', scheduled: false }], contact: true };
    const env = setup(texts);
    const arzan = await publishedPage(env, landing('print-arzan', { name: 'پرینت ارزان' }));
    await publishedPage(env, landing('sahafi', { name: 'صحافی', body: 'بند [ارزان](/print-arzan).' }));
    expect(errorOf(await env.pages.removeView(OWNER, 'tarefe'))).toBe('404 page_not_found');

    const view = await env.pages.removeView(OWNER, arzan);
    if (!view.ok) throw new Error(view.error);
    expect(view.value.targets.map((target) => [target.value, target.path])).toEqual([
      ['home', '/'],
      ['tariff', '/tarefe'],
      ['2', '/sahafi'],
    ]);
    expect(view.value.inbound).toEqual([
      { where: 'صحافی', path: '/print-arzan', scheduled: false },
      { where: 'سؤال‌ها', path: '/print-arzan', scheduled: false },
    ]);
    // «پیدا نشد» بسته، پیش از کد؛ مقصد ناشناس هم.
    const input = { version: '1', mode: 'gone', to: '', code: GOOD_CODE };
    expect(await env.pages.remove(OWNER, arzan, input, IP)).toMatchObject({ ok: false, error: 'page_remove_linked', field: 'mode' });
    expect(await env.pages.remove(OWNER, arzan, { ...input, mode: 'moved', to: '9' }, IP)).toMatchObject({ ok: false, error: 'page_remove_target', field: 'to' });
    expect(await env.pages.remove(OWNER, arzan, { ...input, mode: 'x' }, IP)).toMatchObject({ ok: false, error: 'page_remove_mode' });
    expect(errorOf(await env.pages.remove(OWNER, arzan, { ...input, version: '0', mode: 'moved', to: 'home' }, IP))).toBe('409 page_changed');
    expect(env.stepUps).toEqual([GOOD_CODE, GOOD_CODE]);
    expect(await env.pages.remove(OWNER, arzan, { ...input, mode: 'moved', to: 'tariff' }, IP)).toEqual({ ok: true, value: { param: arzan, version: 2 } });
    expect(env.writes.at(-1)).toMatchObject({ kind: 'remove', input: { mode: 'moved', movedTo: 'tariff', expectedVersion: 1 } });
    expect(errorOf(await env.pages.removeView(OWNER, arzan))).toBe('409 page_not_live');

    // نشانی قبلی صفحه‌ای که برداشته شد اکنون به «تعرفه» می‌رود؛ فهرست همین را «نشانی‌های قبلی» دارد.
    const overview = await env.pages.overview(OWNER);
    if (!overview.ok) throw new Error(overview.error);
    expect(overview.value.moved).toEqual([{ from: '/print-arzan', to: '/tarefe', name: 'پرینت ارزان', why: 'removed' }]);
    expect(overview.value.landings.map((row) => [row.slug, row.removed?.to ?? null])).toEqual([
      ['print-arzan', '/tarefe'],
      ['sahafi', null],
    ]);
  });

  it('پیوند صفحه‌ای که زمان‌دار است هم «پیدا نشد» را می‌بندد؛ مقصد فقط صفحه‌ای که همین حالا روی سایت است', async () => {
    const env = setup();
    const arzan = await publishedPage(env, landing('print-arzan', { name: 'پرینت ارزان' }));
    const saved = await env.pages.save(OWNER, 'new', formOf('landing', landing('sahafi', { name: 'صحافی', body: 'بند [ارزان](/print-arzan).' })), IP);
    const param = saved.ok ? saved.value.param! : '';
    const view = await env.pages.publishView(OWNER, param, undefined);
    if (!view.ok) throw new Error(view.error);
    const scheduled = await env.pages.publish(
      OWNER,
      param,
      { from: 'draft', version: '0', seen: view.value.seen, when: 'at', day: '1405/08/01', hour: '09:00', code: GOOD_CODE },
      IP,
    );
    expect(scheduled).toMatchObject({ ok: true, value: { scheduled: true } });
    const remove = await env.pages.removeView(OWNER, arzan);
    if (!remove.ok) throw new Error(remove.error);
    expect(remove.value.inbound).toEqual([{ where: 'صحافی', path: '/print-arzan', scheduled: true }]);
    expect(remove.value.targets.map((target) => target.value)).toEqual(['home', 'tariff']);
    expect(await env.pages.remove(OWNER, arzan, { version: '1', mode: 'gone', to: '', code: GOOD_CODE }, IP)).toMatchObject({ error: 'page_remove_linked' });
    expect(await env.pages.remove(OWNER, arzan, { version: '1', mode: 'moved', to: param, code: GOOD_CODE }, IP)).toMatchObject({ error: 'page_remove_target' });
  });

  it('بی پیوند «پیدا نشد» باز است، با کد تازه', async () => {
    const env = setup();
    const param = await publishedPage(env, landing('konkur', { name: 'کنکور' }));
    const view = await env.pages.removeView(OWNER, param);
    expect(view).toMatchObject({ ok: true, value: { inbound: [], redirectsHere: [], seenVersion: 1 } });
    expect(await env.pages.remove(OWNER, param, { version: '1', mode: 'gone', to: '', code: ' ' }, IP)).toMatchObject({ error: 'page_code_required' });
    expect(await env.pages.remove(OWNER, param, { version: '1', mode: 'gone', to: '', code: GOOD_CODE }, IP)).toMatchObject({ ok: true });
  });
});

describe('فهرست (سؤال ۴۶۱)', () => {
  it('«تعرفه» اول، صفحه‌ها به ترتیب، شمارها، و هشدار بلوکی که امروز قیمت ندارد', async () => {
    const env = setup();
    await publishedPage(env, landing('sahafi', { name: 'صحافی', body: '[[قیمت: 100 صفحه، A5، دورو]]' }));
    await env.pages.save(OWNER, 'new', formOf('landing', landing('print-word', { name: 'پرینت ورد' })), IP);
    const overview = await env.pages.overview(OWNER);
    if (!overview.ok) throw new Error(overview.error);
    const { tariff, landings, counts } = overview.value;
    expect([tariff.param, tariff.isDefault, tariff.slug]).toEqual(['tarefe', true, 'tarefe']);
    expect(landings.map((row) => [row.name, row.slug, row.inFooter, row.warnings.map((warning) => warning.off.reason), row.draft !== null])).toEqual([
      ['صحافی', 'sahafi', true, ['size'], false],
      ['پرینت ورد', 'print-word', false, [], true],
    ]);
    expect(counts).toEqual({ live: 2, pending: 0, drafts: 1 });
  });
});

describe('واقعیت‌ها و متن‌های دیگر سایت', () => {
  it('جای‌نگهدارها، سال و روز تغییر قیمت، خاموش موقت و سقف صفحه از همان تنظیم‌ها', async () => {
    // صحافی پیش‌فرض (طلق و سیم) هرگز خاموش نیست؛ منگنهٔ روشن هست.
    const list = { ...SEED_PRICE_LIST, bindingTypes: { ...SEED_PRICE_LIST.bindingTypes, staple: { ...SEED_PRICE_LIST.bindingTypes.spiral_clear!, nameFa: 'منگنه' } } };
    const settings: Record<string, unknown> = { 'catalog.paused': { sizes: [], papers: [], bindings: ['staple', 'spiral_clear'] }, 'file.max_pages': 400 };
    const facts = await loadPageFacts(
      { activePriceList: async () => list, setting: async (key: string) => settings[key] },
      async () => new Date('2026-10-07T08:00:00Z'),
      NOW,
    );
    expect([facts.maxPages, [...facts.paused.bindings], facts.values['سال'], facts.values['تغییر_قیمت'], facts.values['نرخ_سیاه_سفید']]).toEqual([
      400,
      ['staple'],
      '1405',
      '15 مهر 1405',
      '1,600',
    ]);
  });

  it('پیوندهای متن‌های ۱۱٫۱، نوار اعلانی که حالا یا بعداً روی سایت است، بنر روشن، و راه تماس', async () => {
    const termsRow = { version: 2, content: { title: 'قوانین', lead: 'ل', body: 'بند [ارزان](/print-arzan#x).', seo: { title: 't', description: 'd' } } };
    const settings: Record<string, unknown> = {
      'content.bar': { mode: 'range', from: '2026-10-22T20:30:00.000Z', until: '2026-10-25T20:30:00.000Z', text: 'نوار', href: '/sahafi?a=1', linkText: 'ببین' },
      'content.banner': { mode: 'on', imageId: 3, alt: 'بنر', href: '/print-pdf' },
    };
    const deps = (values: Record<string, unknown>, live: Record<string, unknown> = {}) => ({
      content: { live: async () => live as never },
      settings: { read: async (key: string) => values[key] },
    });
    // بنر خاموش، بنر بی تصویر و نوار خاموش پیوندی روی سایت ندارند؛ «تماس» با متن منتشرشدهٔ بی راه تماس یعنی `/contact` روی سایت نیست.
    const quiet = await loadSiteTexts(
      deps(
        {
          'content.bar': { ...(settings['content.bar'] as object), mode: 'off' },
          'content.banner': { mode: 'off', imageId: 3, alt: 'بنر', href: '/print-pdf' },
        },
        {
          contact: {
            version: 1,
            content: { mobile: '', phone: '', email: '', telegram: '', instagram: '', hours: '', address: '', postalCode: '', footerIntro: 'م', footerLegal: '' },
          },
        },
      ),
      NOW,
    );
    expect(quiet).toEqual({ links: [], contact: false });
    expect((await loadSiteTexts(deps({ 'content.banner': { mode: 'on', imageId: null, alt: '', href: '/print-pdf' } }), NOW)).links).toEqual([]);
    const texts = await loadSiteTexts(
      {
        content: { live: async () => ({ terms: termsRow as never }) },
        settings: { read: async (key: string) => settings[key] },
      },
      NOW,
    );
    expect(texts).toEqual({
      links: [
        { where: 'قوانین', path: '/print-arzan', scheduled: false },
        { where: 'نوار اعلان', path: '/sahafi', scheduled: true },
        { where: 'بنر صفحهٔ اصلی', path: '/print-pdf', scheduled: false },
      ],
      contact: true,
    });
  });
});

it('اثر انگشت متن همان JSON یکتاست', () => {
  expect(pageSeen('landing', landing('a'))).toBe(pageSeen('landing', { ...landing('a') }));
  expect(pageSeen('landing', landing('a'))).not.toBe(pageSeen('landing', landing('b')));
});
