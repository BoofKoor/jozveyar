/**
 * سرویس متن‌های سایت در پنل (`content.ts`، برش ۱۱٫۱) با ذخیره‌گاه حافظه‌ای: مجوز در سرور پیش از هر خواندن، فرم یکدست و سنجیده، پیش‌نویس با
 * خطا هم و همان متن روی سایت بی پیش‌نویس، کار فهرست سؤال‌ها، «چه عوض می‌شود» و پایهٔ کهنه، هر سنجش انتشار پیش از کد تازه، برگرداندن نسخه
 * و متن پیش‌فرض، و پاسخ ذخیره‌گاه زیر قفل. قفل، تراکنش، رویداد و محافظ‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { describe, expect, it } from 'vitest';

import {
  FAQ_MAX_ITEMS,
  PLACEHOLDERS,
  SEED_FACTS,
  defaultContent,
  fieldsOf,
  readPath,
  type AnyContent,
  type ContentKind,
  type FaqContent,
  type PageContent,
} from '@jozveyar/content';
import type { ContentDraftRow, ContentVersionRow, PublishOutcome, SiteContentStore } from '@jozveyar/db';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

import { ipHashOf, type AdminSession } from './auth';
import { applyFaqOp, contentSeen, createPanelContent, faqOpOf, loadContentFacts, publishFromOf } from './content';
import { fail, ok, type Result } from './result';

const NOW = new Date('2026-10-17T08:00:00Z');
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
const OWNER = session(['owner'], ['orders.read', 'content.edit']);
const OPERATOR = session(['operator'], ['orders.read', 'orders.status']);

/** ذخیره‌گاه حافظه‌ای با همان قرارداد: پایهٔ پیش‌نویس ثابت، انتشار فقط از نسخه‌ای که صفحه دید، و پیش‌نویس منتشرشده پاک. */
function memoryStore() {
  const versions: ContentVersionRow[] = [];
  const drafts = new Map<ContentKind, ContentDraftRow>();
  const calls: string[] = [];
  const publishes: Parameters<SiteContentStore['publish']>[0][] = [];
  let next: PublishOutcome | null = null;
  const latestOf = (kind: ContentKind) => versions.filter((row) => row.kind === kind).sort((a, b) => b.version - a.version)[0];
  const store: SiteContentStore = {
    async live() {
      calls.push('live');
      const out: Partial<Record<ContentKind, ContentVersionRow>> = {};
      for (const row of versions) if (row.version === latestOf(row.kind)!.version) out[row.kind] = row;
      return out;
    },
    async versions(kind) {
      calls.push('versions');
      return versions.filter((row) => row.kind === kind).sort((a, b) => b.version - a.version);
    },
    async drafts() {
      calls.push('drafts');
      return Object.fromEntries(drafts);
    },
    async saveDraft({ kind, content, at }) {
      calls.push('saveDraft');
      const before = drafts.get(kind);
      const row: ContentDraftRow = {
        kind,
        content: structuredClone(content),
        baseVersion: before?.baseVersion ?? latestOf(kind)?.version ?? 0,
        updatedBy: 'admin-1',
        updatedByName: 'سارا',
        createdAt: before?.createdAt ?? at,
        updatedAt: at,
      };
      drafts.set(kind, row);
      return row;
    },
    async discardDraft(kind) {
      calls.push('discardDraft');
      return drafts.delete(kind);
    },
    async publish(input) {
      calls.push('publish');
      publishes.push(input);
      if (next) {
        const outcome = next;
        next = null;
        return outcome;
      }
      const { kind, expectedLive, source, at } = input;
      const latest = latestOf(kind);
      if ((latest?.version ?? 0) !== expectedLive) return { ok: false, reason: 'stale' };
      let content: unknown;
      if (source.type === 'draft') {
        const draft = drafts.get(kind);
        if (!draft || !source.verify(draft.content)) return { ok: false, reason: 'draft_changed' };
        content = source.content;
        drafts.delete(kind);
      } else if (source.version === 0) content = null;
      else {
        const row = versions.find((v) => v.kind === kind && v.version === source.version);
        if (!row || row.content === null) return { ok: false, reason: 'not_found' };
        content = row.content;
      }
      const version = (latest?.version ?? 0) + 1;
      versions.push({
        id: versions.length + 1,
        kind,
        version,
        content: structuredClone(content),
        restoredFrom: source.type === 'restore' ? source.version : null,
        createdBy: 'admin-1',
        createdByName: 'سارا',
        createdAt: at,
      });
      return { ok: true, version };
    },
  };
  return { store, versions, drafts, calls, publishes, answerNext: (outcome: PublishOutcome) => (next = outcome) };
}

function setup() {
  const memory = memoryStore();
  const stepUps: unknown[] = [];
  const content = createPanelContent({
    store: memory.store,
    facts: async () => SEED_FACTS,
    secret: SECRET,
    now: () => NOW,
    async stepUp(_session, code): Promise<Result<true>> {
      stepUps.push(code);
      return code === GOOD_CODE ? ok(true) : fail(400, 'wrong_code');
    },
  });
  return { ...memory, content, stepUps };
}

/** فیلدهای فرم از یک متن، به نام مسیرشان. */
function formOf(kind: ContentKind, value: AnyContent, change: Record<string, string> = {}) {
  const count = kind === 'faq' ? (value as FaqContent).items.length : 0;
  const fields = new Map(fieldsOf(kind, count).map((spec) => [spec.name, readPath(value, spec.name)]));
  for (const [name, text] of Object.entries(change)) fields.set(name, text);
  return { field: (name: string) => fields.get(name) ?? '', faqCount: count };
}

const TERMS = defaultContent('terms');
const NEW_BODY = `${TERMS.body}\n\n## یک بخش تازه\nسؤالی بود؟ از [تماس](/contact) بپرس.`;

describe('دسترسی', () => {
  it('هر کار فقط با `content.edit`، پیش از هر خواندن؛ نوع ناشناس ۴۰۴', async () => {
    const { content, calls, stepUps } = setup();
    const results = await Promise.all([
      content.overview(OPERATOR),
      content.editor(OPERATOR, 'terms'),
      content.save(OPERATOR, 'terms', formOf('terms', TERMS), IP),
      content.discard(OPERATOR, 'terms'),
      content.publishView(OPERATOR, 'terms', undefined),
      content.publish(OPERATOR, 'terms', { from: 'draft', live: '0', seen: 'x', code: GOOD_CODE }, IP),
      content.versions(OPERATOR, 'terms'),
      content.version(OPERATOR, 'terms', 'default'),
    ]);
    expect(results.map((result) => (result.ok ? 'ok' : `${result.status} ${result.error}`))).toEqual(Array(8).fill('403 forbidden'));
    expect(calls).toEqual([]);
    expect(stepUps).toEqual([]);

    expect(await content.editor(OWNER, 'banner')).toMatchObject({ ok: false, status: 404, error: 'content_not_found' });
    expect(await content.save(OWNER, 'banner', formOf('terms', TERMS), IP)).toMatchObject({ ok: false, error: 'content_not_found' });
    expect(calls).toEqual([]);
  });
});

describe('ویرایشگر و پیش‌نویس', () => {
  it('بی نسخه متن پیش‌فرض است، بی خطا، با جدول جای‌نگهدارها و عدد امروز', async () => {
    const { content } = setup();
    const view = await content.editor(OWNER, 'terms');
    if (!view.ok) throw new Error(view.error);
    expect(view.value.live).toMatchObject({ latest: null, isDefault: true });
    expect(view.value.content).toEqual(TERMS);
    expect(view.value.draft).toBeNull();
    expect(view.value.issues).toEqual([]);
    expect(view.value.placeholders.map((row) => row.name)).toEqual([...PLACEHOLDERS]);
    expect(view.value.values['روز_کاری']).toBe('2');

    const overview = await content.overview(OWNER);
    if (!overview.ok) throw new Error(overview.error);
    expect(overview.value.rows.map((row) => [row.kind, row.live.isDefault, row.draft])).toEqual([
      ['home', true, null],
      ['faq', true, null],
      ['terms', true, null],
      ['privacy', true, null],
      ['about', true, null],
      ['contact', true, null],
    ]);
  });

  it('ذخیره یکدست می‌کند و پیش‌نویس با خطا هم می‌ماند؛ خطا با شمارهٔ خط و آغاز همان خط', async () => {
    const { content, drafts } = setup();
    const body = `${TERMS.body}\n\nسؤال‌ها در [تلگرام ما](https://t.me/jozveyar).`;
    const saved = await content.save(OWNER, 'terms', formOf('terms', TERMS, { title: 'قوانين جزوه‌يار  ', body }), IP);
    if (!saved.ok) throw new Error(saved.error);
    expect(saved.value.draft).not.toBeNull();
    expect((drafts.get('terms')!.content as PageContent).title).toBe('قوانین جزوه‌یار');
    expect(saved.value.issues).toEqual([
      expect.objectContaining({ field: 'body', code: 'link_external', detail: 'https://t.me/jozveyar', line: body.split('\n').length, excerpt: 'سؤال‌ها در [تلگرام…' }),
    ]);

    const view = await content.editor(OWNER, 'terms');
    if (!view.ok) throw new Error(view.error);
    expect((view.value.content as PageContent).title).toBe('قوانین جزوه‌یار');
    expect(view.value.issues.map((issue) => issue.code)).toEqual(['link_external']);
    // ذخیرهٔ دوم پایهٔ پیش‌نویس را عوض نمی‌کند، و زمان آغازش هم.
    expect(drafts.get('terms')).toMatchObject({ baseVersion: 0, createdAt: NOW });
  });

  it('متن بلندتر از سقف فیلد با خطای سقف ذخیره می‌شود؛ بزرگ‌تر از سقف پایگاه داده نه، با پیام خودش', async () => {
    const { content, drafts, calls } = setup();
    const long = await content.save(OWNER, 'terms', formOf('terms', TERMS, { body: 'ب'.repeat(20_001) }), IP);
    if (!long.ok) throw new Error(long.error);
    expect(long.value.issues.map((issue) => [issue.field, issue.code])).toEqual([['body', 'too_long']]);
    drafts.clear();
    calls.length = 0;
    // ۶۶٬۰۰۰ نویسهٔ فارسی ۱۳۲ هزار بایت است، بیش از سقف ۱۲۸ کیلوبایتی `site_content_drafts_content`.
    const huge = await content.save(OWNER, 'terms', formOf('terms', TERMS, { body: 'ب'.repeat(66_000) }), IP);
    expect(huge).toMatchObject({ ok: false, status: 413, error: 'content_too_large' });
    expect(calls).not.toContain('saveDraft');
    expect(drafts.has('terms')).toBe(false);
  });

  it('متنی که همان روی سایت است پیش‌نویس نمی‌ماند، پیش‌نویسی هم که بود دور انداخته می‌شود', async () => {
    const { content, drafts, calls } = setup();
    await content.save(OWNER, 'terms', formOf('terms', TERMS, { lead: 'جملهٔ تازه.' }), IP);
    expect(drafts.has('terms')).toBe(true);
    calls.length = 0;
    const same = await content.save(OWNER, 'terms', formOf('terms', TERMS, { title: ` ${TERMS.title}` }), IP);
    expect(same).toEqual({ ok: true, value: { draft: null, issues: [] } });
    expect(drafts.has('terms')).toBe(false);
    expect(calls).toContain('discardDraft');
    expect(calls).not.toContain('saveDraft');
  });

  it('«دور انداختن» دو کلیک یکی است', async () => {
    const { content } = setup();
    await content.save(OWNER, 'terms', formOf('terms', TERMS, { lead: 'جملهٔ تازه.' }), IP);
    expect(await content.discard(OWNER, 'terms')).toEqual({ ok: true, value: { discarded: true } });
    expect(await content.discard(OWNER, 'terms')).toEqual({ ok: true, value: { discarded: false } });
  });
});

describe('فهرست سؤال‌ها', () => {
  const faq = defaultContent('faq');

  it('کار فهرست از فرم: «add» و «up:3»، و هر چیز دیگر هیچ', () => {
    expect(['add', 'up:3', 'down:0', 'delete:19', 'up:-1', 'remove:1', 'up:1x', '', undefined].map(faqOpOf)).toEqual([
      { op: 'add' },
      { op: 'up', index: 3 },
      { op: 'down', index: 0 },
      { op: 'delete', index: 19 },
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('افزودن ته فهرست، بالاتر و پایین‌تر جابه‌جا، حذف؛ بیرون از فهرست و سقف هیچ', () => {
    const [a, b, c] = faq.items;
    const three = { items: [a!, b!, c!] };
    expect(applyFaqOp(three, { op: 'add' })?.items).toEqual([a, b, c, { q: '', a: '' }]);
    expect(applyFaqOp(three, { op: 'up', index: 1 })?.items).toEqual([b, a, c]);
    expect(applyFaqOp(three, { op: 'down', index: 1 })?.items).toEqual([a, c, b]);
    expect(applyFaqOp(three, { op: 'delete', index: 0 })?.items).toEqual([b, c]);
    expect(applyFaqOp(three, { op: 'up', index: 0 })).toBeNull();
    expect(applyFaqOp(three, { op: 'down', index: 2 })).toBeNull();
    expect(applyFaqOp(three, { op: 'delete', index: 3 })).toBeNull();
    expect(applyFaqOp({ items: Array.from({ length: FAQ_MAX_ITEMS }, () => a!) }, { op: 'add' })).toBeNull();
  });

  it('ذخیره با کار فهرست: سؤال تازهٔ خالی خطای «خالی است» دارد؛ سقف ۴۰۰', async () => {
    const { content, drafts } = setup();
    const added = await content.save(OWNER, 'faq', { ...formOf('faq', faq), op: { op: 'add' } }, IP);
    if (!added.ok) throw new Error(added.error);
    expect((drafts.get('faq')!.content as FaqContent).items).toHaveLength(faq.items.length + 1);
    expect(added.value.issues.map((issue) => [issue.field, issue.code])).toEqual([
      [`items.${faq.items.length}.q`, 'required'],
      [`items.${faq.items.length}.a`, 'required'],
    ]);

    const full = { items: Array.from({ length: FAQ_MAX_ITEMS }, (_, i) => ({ q: `پرسش ${i + 1}؟`, a: 'پاسخ.' })) };
    expect(await content.save(OWNER, 'faq', { ...formOf('faq', full), op: { op: 'add' } }, IP)).toMatchObject({ ok: false, status: 400, error: 'content_faq_full' });
    // فرمی که بیش از سقف سؤال بفرستد، فقط تا سقف خوانده می‌شود.
    const over = await content.save(OWNER, 'faq', { ...formOf('faq', full), faqCount: FAQ_MAX_ITEMS + 5 }, IP);
    if (!over.ok) throw new Error(over.error);
    expect((drafts.get('faq')!.content as FaqContent).items).toHaveLength(FAQ_MAX_ITEMS);
  });
});

describe('انتشار', () => {
  async function draftReady(t = setup()) {
    const saved = await t.content.save(OWNER, 'terms', formOf('terms', TERMS, { body: NEW_BODY }), IP);
    if (!saved.ok) throw new Error(saved.error);
    const view = await t.content.publishView(OWNER, 'terms', undefined);
    if (!view.ok) throw new Error(view.error);
    return { ...t, view: view.value };
  }

  it('صفحهٔ انتشار: «چه عوض می‌شود» بند به بند، و همان که دیده شد', async () => {
    const { view } = await draftReady();
    expect(view.from).toEqual({ type: 'draft' });
    expect(view.staleBase).toBe(false);
    expect(view.seenLive).toBe(0);
    expect(view.seen).toBe(contentSeen('terms', { ...TERMS, body: NEW_BODY }));
    expect(view.diff.changes.map((change) => change.section)).toEqual(['یک بخش تازه', 'یک بخش تازه']);
    expect(view.diff.changes.every((change) => change.before === null)).toBe(true);
    expect(view.diff.unchanged).toEqual(['تیتر صفحه', 'جملهٔ آغاز', 'بقیهٔ متن صفحه', 'عنوان گوگل', 'توضیح گوگل']);
  });

  it('هر سنجشی که بی کد جواب دارد پیش از کد: نسخهٔ دیگری روی سایت، متن دیگری، بی پیش‌نویس، خطادار و بی تغییر', async () => {
    const t = await draftReady();
    const input = { from: 'draft', live: String(t.view.seenLive), seen: t.view.seen, code: GOOD_CODE };
    expect(await t.content.publish(OWNER, 'terms', { ...input, live: '1' }, IP)).toMatchObject({ ok: false, status: 409, error: 'content_changed' });
    expect(await t.content.publish(OWNER, 'terms', { ...input, live: 'x' }, IP)).toMatchObject({ error: 'content_changed' });
    expect(await t.content.publish(OWNER, 'terms', { ...input, seen: 'b'.repeat(64) }, IP)).toMatchObject({ error: 'content_changed' });
    expect(await t.content.publish(OWNER, 'terms', { ...input, from: 'nope' }, IP)).toMatchObject({ status: 404, error: 'content_not_found' });

    // پیش‌نویس پس از دیدن صفحه عوض شد: اثر انگشت دیگر.
    await t.content.save(OWNER, 'terms', formOf('terms', TERMS, { body: `${NEW_BODY}\n\nیک بند دیگر.` }), IP);
    expect(await t.content.publish(OWNER, 'terms', input, IP)).toMatchObject({ error: 'content_changed' });
    // خطادار و بی پیش‌نویس.
    await t.content.save(OWNER, 'terms', formOf('terms', TERMS, { body: `${NEW_BODY}\n\n<b>تند</b>` }), IP);
    expect(await t.content.publish(OWNER, 'terms', input, IP)).toMatchObject({ error: 'content_invalid' });
    await t.content.discard(OWNER, 'terms');
    expect(await t.content.publish(OWNER, 'terms', input, IP)).toMatchObject({ error: 'content_no_draft' });
    expect(await t.content.publishView(OWNER, 'terms', 'draft')).toMatchObject({ error: 'content_no_draft' });

    expect(t.stepUps).toEqual([]);
    expect(t.publishes).toEqual([]);
  });

  it('کد نادرست چیزی منتشر نمی‌کند؛ درست، نسخهٔ ۱ با پیش‌نویس پاک و رویداد به نام همان ادمین', async () => {
    const t = await draftReady();
    const input = { from: 'draft', live: String(t.view.seenLive), seen: t.view.seen };
    expect(await t.content.publish(OWNER, 'terms', { ...input, code: '000000' }, IP)).toMatchObject({ ok: false, error: 'wrong_code' });
    expect(t.publishes).toEqual([]);

    expect(await t.content.publish(OWNER, 'terms', { ...input, code: GOOD_CODE }, IP)).toEqual({ ok: true, value: { kind: 'terms', version: 1 } });
    expect(t.stepUps).toEqual(['000000', GOOD_CODE]);
    expect(t.publishes[0]).toMatchObject({
      kind: 'terms',
      expectedLive: 0,
      source: { type: 'draft', content: { ...TERMS, body: NEW_BODY } },
      actor: { adminUserId: 'admin-1', ipHash: ipHashOf(SECRET, IP) },
      at: NOW,
    });
    expect(t.drafts.has('terms')).toBe(false);

    const view = await t.content.editor(OWNER, 'terms');
    if (!view.ok) throw new Error(view.error);
    expect(view.value.live).toMatchObject({ isDefault: false, latest: { version: 1 } });
    expect((view.value.content as PageContent).body).toBe(NEW_BODY);

    // همان متن دوباره: «چیزی برای انتشار نیست»، پیش از کد.
    await t.content.save(OWNER, 'terms', formOf('terms', TERMS, { body: NEW_BODY, lead: 'جملهٔ تازه.' }), IP);
    const unchanged = await t.content.save(OWNER, 'terms', formOf('terms', TERMS, { body: NEW_BODY }), IP);
    expect(unchanged).toMatchObject({ ok: true, value: { draft: null } });
  });

  it('پیش‌نویسی که از روی نسخهٔ دیگری ساخته شد پایهٔ کهنه دارد', async () => {
    const t = await draftReady();
    // نسخهٔ دیگری از جای دیگری منتشر شد، پیش‌نویس همان ماند.
    t.versions.push({ id: 99, kind: 'terms', version: 1, content: { ...TERMS, lead: 'از جای دیگر.' }, restoredFrom: null, createdBy: 'admin-2', createdByName: 'علی', createdAt: NOW });
    const view = await t.content.publishView(OWNER, 'terms', undefined);
    if (!view.ok) throw new Error(view.error);
    expect(view.value.staleBase).toBe(true);
    expect(view.value.seenLive).toBe(1);
  });

  it('پیش‌نویسی که همان متن روی سایت شد (همان متن از جای دیگر منتشر شد): «چیزی برای انتشار نیست»، پیش از کد', async () => {
    const t = await draftReady();
    t.versions.push({ id: 98, kind: 'terms', version: 1, content: { ...TERMS, body: NEW_BODY }, restoredFrom: null, createdBy: 'admin-2', createdByName: 'علی', createdAt: NOW });
    expect(await t.content.publishView(OWNER, 'terms', undefined)).toMatchObject({ ok: false, status: 409, error: 'content_unchanged' });
    expect(await t.content.publish(OWNER, 'terms', { from: 'draft', live: '1', seen: t.view.seen, code: GOOD_CODE }, IP)).toMatchObject({
      ok: false,
      error: 'content_unchanged',
    });
    expect(t.stepUps).toEqual([]);
  });

  it('پاسخ ذخیره‌گاه زیر قفل: کهنه و پیش‌نویس عوض‌شده «همین حالا عوض شد»، بی تغییر و نسخهٔ ناپیدا هم پیام خودشان', async () => {
    const answers: [PublishOutcome, string][] = [
      [{ ok: false, reason: 'stale' }, 'content_changed'],
      [{ ok: false, reason: 'draft_changed' }, 'content_changed'],
      [{ ok: false, reason: 'noop' }, 'content_unchanged'],
      [{ ok: false, reason: 'not_found' }, 'content_not_found'],
    ];
    for (const [outcome, error] of answers) {
      const t = await draftReady();
      t.answerNext(outcome);
      expect(await t.content.publish(OWNER, 'terms', { from: 'draft', live: '0', seen: t.view.seen, code: GOOD_CODE }, IP)).toMatchObject({ ok: false, error });
    }
  });
});

describe('برگرداندن و نسخه‌ها', () => {
  async function twoVersions() {
    const t = setup();
    for (const body of [NEW_BODY, `${NEW_BODY}\n\nیک بند دیگر.`]) {
      await t.content.save(OWNER, 'terms', formOf('terms', TERMS, { body }), IP);
      const view = await t.content.publishView(OWNER, 'terms', 'draft');
      if (!view.ok) throw new Error(view.error);
      const done = await t.content.publish(OWNER, 'terms', { from: 'draft', live: String(view.value.seenLive), seen: view.value.seen, code: GOOD_CODE }, IP);
      if (!done.ok) throw new Error(done.error);
    }
    return t;
  }

  it('نشانی صفحه: پیش‌نویس، «default» یا شمارهٔ نسخه', () => {
    expect([undefined, '', 'draft', 'default', '1', '42', '0', '-1', '1.5', 'x', '1234567'].map(publishFromOf)).toEqual([
      { type: 'draft' },
      { type: 'draft' },
      { type: 'draft' },
      { type: 'default' },
      { type: 'version', version: 1 },
      { type: 'version', version: 42 },
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('برگرداندن نسخهٔ ۱ نسخهٔ تازه با همان متن می‌سازد؛ متن روی سایت را نه', async () => {
    const t = await twoVersions();
    const view = await t.content.publishView(OWNER, 'terms', '1');
    if (!view.ok) throw new Error(view.error);
    expect(view.value.source?.version).toBe(1);
    expect((view.value.content as PageContent).body).toBe(NEW_BODY);
    expect(view.value.staleBase).toBe(false);
    expect(await t.content.publishView(OWNER, 'terms', '2')).toMatchObject({ ok: false, error: 'content_unchanged' });
    expect(await t.content.publishView(OWNER, 'terms', '7')).toMatchObject({ ok: false, status: 404, error: 'content_not_found' });

    const done = await t.content.publish(OWNER, 'terms', { from: '1', live: '2', seen: view.value.seen, code: GOOD_CODE }, IP);
    expect(done).toEqual({ ok: true, value: { kind: 'terms', version: 3 } });
    expect(t.publishes.at(-1)).toMatchObject({ expectedLive: 2, source: { type: 'restore', version: 1 } });
  });

  it('برگشت به متن پیش‌فرض، و پس از آن «دیدن» هر نسخه با حال روی سایتش', async () => {
    const t = await twoVersions();
    const view = await t.content.publishView(OWNER, 'terms', 'default');
    if (!view.ok) throw new Error(view.error);
    expect(view.value.content).toEqual(TERMS);
    const done = await t.content.publish(OWNER, 'terms', { from: 'default', live: '2', seen: view.value.seen, code: GOOD_CODE }, IP);
    expect(done).toEqual({ ok: true, value: { kind: 'terms', version: 3 } });
    expect(t.publishes.at(-1)).toMatchObject({ source: { type: 'restore', version: 0 } });

    expect(await t.content.publishView(OWNER, 'terms', 'default')).toMatchObject({ ok: false, error: 'content_unchanged' });
    // نسخه‌ای که خودش برگشت به پیش‌فرض بود «برگرداندن» ندارد: همان متن پیش‌فرض است.
    expect(await t.content.publishView(OWNER, 'terms', '3')).toMatchObject({ ok: false, error: 'content_not_found' });

    const versions = await t.content.versions(OWNER, 'terms');
    if (!versions.ok) throw new Error(versions.error);
    expect(versions.value.versions.map((row) => [row.version, row.restoredFrom])).toEqual([
      [3, 0],
      [2, null],
      [1, null],
    ]);
    expect(versions.value.live.isDefault).toBe(true);

    const seen = async (which: string) => {
      const one = await t.content.version(OWNER, 'terms', which);
      return one.ok ? [one.value.version?.version ?? 'default', one.value.isLive] : one.error;
    };
    expect(await Promise.all(['3', '2', '1', 'default', '9', 'draft'].map(seen))).toEqual([
      [3, true],
      [2, false],
      [1, false],
      ['default', true],
      'content_not_found',
      'content_not_found',
    ]);

    // نسخهٔ ۱ برگشت (۴) و دوباره متن پیش‌فرض (۵): برگشت قدیمی‌تر به پیش‌فرض (۳) هم همان متن روی سایت است، نه فقط آخرین نسخه.
    for (const from of ['1', 'default']) {
      const again = await t.content.publishView(OWNER, 'terms', from);
      if (!again.ok) throw new Error(again.error);
      const live = String(again.value.seenLive);
      expect(await t.content.publish(OWNER, 'terms', { from, live, seen: again.value.seen, code: GOOD_CODE }, IP)).toMatchObject({ ok: true });
    }
    expect(await Promise.all(['5', '4', '3', 'default'].map(seen))).toEqual([
      [5, true],
      [4, false],
      [3, true],
      ['default', true],
    ]);
  });
});

describe('واقعیت‌های امروز', () => {
  it('همان تعرفهٔ فعال و تنظیم‌هایی که سایت می‌خواند', async () => {
    const settings: Record<string, unknown> = { 'order.sla_days': 3, 'file.retention_days': 1, 'order.files_retention_days': 45, 'file.formats': { word: true, slides: false, image: true } };
    const facts = await loadContentFacts({
      activePriceList: async () => SEED_PRICE_LIST,
      setting: async (key: string) => settings[key] ?? null,
    } as never);
    expect(facts).toMatchObject({ slaDays: 3, uploadDays: 1, orderFilesDays: 45, formats: { word: true, slides: false, image: true } });
  });
});
