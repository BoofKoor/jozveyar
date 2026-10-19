/**
 * سرویس لوگو و بنر در پنل (`images.ts`، برش ۱۱٫۲) با ذخیره‌گاه حافظه‌ای: مجوز هر نوع در سرور پیش از هر خواندن، نوع و اندازهٔ فایل از
 * بایت‌ها، «همان که دیده شد» و آماده بودن بارگذاری پیش از کد تازه، کد فقط برای آنچه روی سایت می‌آید، و پاسخ ذخیره‌گاه زیر قفل. قفل،
 * تراکنش، رویداد و محافظ‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { describe, expect, it } from 'vitest';

import type { SiteBanner } from '@jozveyar/contracts';
import type { SettingDecision, SiteImageRow, SiteImageStore } from '@jozveyar/db';

import { ipHashOf, type AdminSession } from './auth';
import { bannerSeen, createPanelImages } from './images';
import { fail, ok, type Result } from './result';

const NOW = new Date('2026-10-19T08:00:00Z');
const SECRET = 's'.repeat(64);
const IP = '203.0.113.7';
const GOOD_CODE = '123456';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const WEBP = new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBPVP8 ')]);
const SVG = new TextEncoder().encode('\ufeff  <?xml version="1.0"?><svg onload="x()"/>');

function session(roles: string[], permissions: string[]): AdminSession {
  return {
    sessionId: 's1',
    userId: 'admin-1',
    username: 'bahar',
    displayName: 'بهار',
    roles,
    permissions,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    partner: null,
  };
}
const OWNER = session(['owner'], ['orders.read', 'content.edit', 'content.bar']);
const OPERATOR = session(['operator'], ['orders.read', 'orders.status', 'content.bar']);
const ACCOUNTANT = session(['accountant'], ['orders.read', 'orders.money']);

function row(over: Partial<SiteImageRow> & Pick<SiteImageRow, 'id' | 'kind'>): SiteImageRow {
  return {
    version: over.id,
    mainName: 'logo.png',
    mainBytes: 11,
    extraName: null,
    extraBytes: null,
    createdBy: 'admin-1',
    createdByName: 'بهار',
    createdAt: NOW,
    builtAt: NOW,
    error: null,
    publishedAt: null,
    files: [],
    ...over,
  };
}

/** ذخیره‌گاه حافظه‌ای با همان قرارداد: `change` مقدار امروز و ردیف تصویر را به `decide` می‌دهد، و نوشتن `published_at` اول را می‌نشاند. */
function harness() {
  const rows = new Map<number, SiteImageRow>();
  const values = new Map<string, unknown>();
  const uploads: Parameters<SiteImageStore['upload']>[0][] = [];
  const changes: { key: string; action: string; imageId: number | null; decision: SettingDecision }[] = [];
  const steps: unknown[] = [];
  let onLock: (() => void) | null = null;
  const store: SiteImageStore = {
    async upload(input) {
      uploads.push(input);
      const id = rows.size + 1;
      const created = row({ id, kind: input.kind, builtAt: null, mainName: input.main.name, extraName: input.extra?.name ?? null });
      rows.set(id, created);
      return created;
    },
    async get(id) {
      return rows.get(id) ?? null;
    },
    async recent(kind, limit) {
      return [...rows.values()].filter((r) => r.kind === kind).slice(0, limit);
    },
    async file(id, name) {
      return rows.has(id) && name === 'favicon' ? { contentType: 'image/x-icon', bytes: Buffer.from([0, 0, 1, 0]), sha256: 'a'.repeat(64) } : null;
    },
    async publishedFile() {
      return null;
    },
    async publishedFiles() {
      return null;
    },
    async change(input) {
      onLock?.();
      onLock = null;
      const image = input.imageId === null ? null : (rows.get(input.imageId) ?? null);
      const decision = input.decide(values.get(input.key), image);
      changes.push({ key: input.key, action: input.action, imageId: input.imageId, decision });
      if (decision.kind === 'reject') return { ok: false, reason: decision.reason };
      if (decision.kind === 'same') return { ok: true, written: false };
      values.set(input.key, decision.value);
      if (image && image.publishedAt === null) rows.set(image.id, { ...image, publishedAt: input.at });
      return { ok: true, written: true };
    },
  };
  const images = createPanelImages({
    store,
    settings: { read: async (key) => values.get(key) },
    logoEvent: async () => null,
    bannerEvent: async () => null,
    stepUp: async (_session, code): Promise<Result<true>> => {
      steps.push(code);
      return code === GOOD_CODE ? ok(true) : fail(400, 'wrong_code');
    },
    secret: SECRET,
    now: () => NOW,
  });
  return {
    images,
    rows,
    values,
    uploads,
    changes,
    steps,
    lockThen: (fn: () => void) => {
      onLock = fn;
    },
  };
}

describe('مجوز هر نوع در سرور، پیش از هر خواندن', () => {
  it('لوگو فقط مالک؛ بنر مالک و متصدی؛ حسابدار هیچ‌کدام؛ فایل پیش‌نمایش با مجوز نوع همان بارگذاری', async () => {
    const t = harness();
    t.rows.set(1, row({ id: 1, kind: 'logo' }));
    t.rows.set(2, row({ id: 2, kind: 'banner' }));
    expect((await t.images.logo(OWNER)).ok).toBe(true);
    expect(await t.images.logo(OPERATOR)).toMatchObject({ ok: false, status: 403, error: 'forbidden' });
    expect((await t.images.banner(OPERATOR)).ok).toBe(true);
    expect(await t.images.banner(ACCOUNTANT)).toMatchObject({ ok: false, status: 403 });
    expect(await t.images.image(OPERATOR, 'logo', '1')).toMatchObject({ ok: false, status: 403 });
    expect(await t.images.file(OPERATOR, '1', 'favicon')).toMatchObject({ ok: false, status: 403 });
    expect(await t.images.upload(OPERATOR, { kind: 'logo', main: { name: 'l.png', bytes: PNG }, extra: null }, IP)).toMatchObject({ status: 403 });
    expect(await t.images.publishLogo(OPERATOR, { id: '1', seen: 'brand', code: GOOD_CODE }, IP)).toMatchObject({ status: 403 });
    expect(await t.images.saveBanner(ACCOUNTANT, { id: '2', alt: 'x', href: '', seen: '', code: GOOD_CODE }, IP)).toMatchObject({ status: 403 });
    expect(await t.images.bannerOff(ACCOUNTANT, IP)).toMatchObject({ status: 403 });
    expect(t.uploads).toEqual([]);
    expect(t.changes).toEqual([]);
  });
});

describe('بارگذاری: نوع و اندازه از بایت‌ها، بی کد', () => {
  it('لوگو PNG یا WebP با نشان اختیاری؛ بنر JPEG هم؛ SVG، JPEG لوگو، بزرگ و خالی هر کدام با فیلد خودش', async () => {
    const t = harness();
    const up = (kind: unknown, main: Uint8Array | null, extra: Uint8Array | null = null, who = OWNER) =>
      t.images.upload(who, { kind, main: main && { name: 'C:\\fakepath\\لوگو\u202e.png', bytes: main }, extra: extra && { name: '', bytes: extra } }, IP);
    expect(await up('video', PNG)).toMatchObject({ status: 400, error: 'image_kind' });
    expect(await up('logo', null)).toMatchObject({ status: 400, error: 'image_required', field: 'main' });
    expect(await up('logo', new Uint8Array())).toMatchObject({ error: 'image_required' });
    expect(await up('logo', SVG)).toMatchObject({ status: 415, error: 'image_svg', field: 'main' });
    expect(await up('logo', JPEG)).toMatchObject({ status: 415, error: 'image_format', field: 'main' });
    expect(await up('logo', PNG, JPEG)).toMatchObject({ status: 415, error: 'image_format', field: 'extra' });
    expect(await up('logo', new Uint8Array(1024 * 1024 + 1))).toMatchObject({ status: 413, error: 'image_too_large', field: 'main' });
    expect(await up('logo', PNG, new Uint8Array(1024 * 1024 + 1))).toMatchObject({ error: 'image_too_large', field: 'extra' });
    expect(await up('logo', Uint8Array.from([1, 2, 3]))).toMatchObject({ error: 'image_format' });
    expect(t.uploads).toEqual([]);

    expect(await up('logo', PNG, WEBP)).toEqual(ok({ id: 1, kind: 'logo' }));
    expect(t.uploads[0]).toMatchObject({
      kind: 'logo',
      main: { name: 'لوگو.png' },
      extra: { name: 'mark' },
      actor: { adminUserId: 'admin-1', ipHash: ipHashOf(SECRET, IP) },
      at: NOW,
    });
    // تصویر گوشی خالی یعنی بی تصویر گوشی؛ بنر JPEG، و متصدی هم.
    expect(await up('banner', JPEG, new Uint8Array(), OPERATOR)).toEqual(ok({ id: 2, kind: 'banner' }));
    expect(t.uploads[1]).toMatchObject({ kind: 'banner', extra: null });
  });
});

describe('روی سایت گذاشتن لوگو', () => {
  it('هر سنجش پیش از کد، همان لوگو بی کد، کد خالی بی stepUp، و با کد تازه نوشتن از همان که دیده شد', async () => {
    const t = harness();
    t.rows.set(1, row({ id: 1, kind: 'logo' }));
    t.rows.set(2, row({ id: 2, kind: 'logo', builtAt: null }));
    t.rows.set(3, row({ id: 3, kind: 'logo', error: 'too_small: لوگو: کوچک' }));
    t.rows.set(4, row({ id: 4, kind: 'banner' }));
    const publish = (id: string, seen: string, code: string) => t.images.publishLogo(OWNER, { id, seen, code }, IP);
    expect(await publish('9', 'brand', GOOD_CODE)).toMatchObject({ status: 404, error: 'image_not_found' });
    expect(await publish('4', 'brand', GOOD_CODE)).toMatchObject({ status: 404, error: 'image_not_found' });
    expect(await publish('x', 'brand', GOOD_CODE)).toMatchObject({ status: 404 });
    expect(await publish('1', '7', GOOD_CODE)).toMatchObject({ status: 409, error: 'logo_changed' });
    expect(await publish('2', 'brand', GOOD_CODE)).toMatchObject({ status: 409, error: 'image_not_ready' });
    expect(await publish('3', 'brand', GOOD_CODE)).toMatchObject({ status: 409, error: 'image_not_ready' });
    expect(await publish('1', 'brand', ' ')).toMatchObject({ status: 400, error: 'logo_code_required', field: 'code' });
    expect(t.steps).toEqual([]);
    expect(await publish('1', 'brand', '000000')).toMatchObject({ error: 'wrong_code' });
    expect(t.changes).toEqual([]);

    expect(await publish('1', 'brand', GOOD_CODE)).toEqual(ok({ change: 'publish', version: 1 }));
    expect(t.values.get('content.logo')).toEqual({ imageId: 1 });
    expect(t.changes.at(-1)).toMatchObject({
      key: 'content.logo',
      action: 'content.logo',
      imageId: 1,
      decision: { kind: 'write', detail: { change: 'publish', imageId: 1, version: 1, before: null, fresh: true } },
    });
    expect(t.rows.get(1)!.publishedAt).toEqual(NOW);
    // همان لوگوی روی سایت: بی کد و بی نوشتن.
    const before = t.changes.length;
    expect(await publish('1', '1', '')).toEqual(ok({ change: 'same', version: 1 }));
    expect(t.changes.length).toBe(before);
  });

  it('زیر قفل: لوگویی که در این میان عوض شد «عوض شد» است، بی نوشتن', async () => {
    const t = harness();
    t.rows.set(1, row({ id: 1, kind: 'logo' }));
    t.rows.set(2, row({ id: 2, kind: 'logo' }));
    t.lockThen(() => t.values.set('content.logo', { imageId: 2 }));
    expect(await t.images.publishLogo(OWNER, { id: '1', seen: 'brand', code: GOOD_CODE }, IP)).toMatchObject({ status: 409, error: 'logo_changed' });
    expect(t.values.get('content.logo')).toEqual({ imageId: 2 });
  });

  it('برگشت به لوگوی جزوه‌یار: همان بی کد، و با کد تازه نوشتن null', async () => {
    const t = harness();
    t.rows.set(1, row({ id: 1, kind: 'logo' }));
    expect(await t.images.brandLogo(OWNER, { seen: 'brand', code: '' }, IP)).toEqual(ok({ change: 'same' }));
    t.values.set('content.logo', { imageId: 1 });
    expect(await t.images.brandLogo(OWNER, { seen: 'brand', code: GOOD_CODE }, IP)).toMatchObject({ error: 'logo_changed' });
    expect(await t.images.brandLogo(OWNER, { seen: '1', code: '' }, IP)).toMatchObject({ error: 'logo_code_required' });
    expect(await t.images.brandLogo(OWNER, { seen: '1', code: GOOD_CODE }, IP)).toEqual(ok({ change: 'brand' }));
    expect(t.values.get('content.logo')).toEqual({ imageId: null });
    expect(t.changes.at(-1)).toMatchObject({ imageId: null, decision: { detail: { change: 'brand', before: 1, fresh: true } } });
  });
});

describe('بنر صفحهٔ اصلی', () => {
  const OFF: SiteBanner = { mode: 'off', imageId: null, alt: '', href: '' };

  it('متن جایگزین لازم و پیوند فقط به همین سایت، یکدست؛ روشن با کد تازه، بعد «عوض شد»؛ همان بنر بی کد', async () => {
    const t = harness();
    t.rows.set(1, row({ id: 1, kind: 'banner' }));
    t.rows.set(2, row({ id: 2, kind: 'logo' }));
    t.rows.set(3, row({ id: 3, kind: 'banner', builtAt: null }));
    const save = (input: { id?: string; alt?: string; href?: string; seen?: string; code?: string }, who = OPERATOR) =>
      t.images.saveBanner(who, { id: '1', alt: 'تخفیف دانشجویی', href: '', seen: bannerSeen(OFF), code: GOOD_CODE, ...input }, IP);
    expect(await save({ id: '2' })).toMatchObject({ status: 404, error: 'image_not_found' });
    expect(await save({ seen: 'x' })).toMatchObject({ status: 409, error: 'banner_changed' });
    expect(await save({ id: '3' })).toMatchObject({ status: 409, error: 'image_not_ready' });
    const invalid = await save({ alt: ' ', href: 'https://t.me/jozveyar' });
    expect(invalid).toMatchObject({ status: 400, error: 'banner_invalid' });
    expect((invalid as unknown as { issues: { field: string; code: string }[] }).issues.map((i) => [i.field, i.code])).toEqual([
      ['alt', 'required'],
      ['href', 'banner_href'],
    ]);
    expect(await save({ code: '' })).toMatchObject({ status: 400, error: 'banner_code_required', field: 'code' });
    expect(t.steps).toEqual([]);

    expect(await save({ alt: 'تخفيف دانشجويي', href: 'https://jozveyar.com/#tariff' })).toEqual(ok({ change: 'on' }));
    const on = { mode: 'on', imageId: 1, alt: 'تخفیف دانشجویی', href: '/#tariff' };
    expect(t.values.get('content.banner')).toEqual(on);
    expect(t.changes.at(-1)).toMatchObject({
      key: 'content.banner',
      imageId: 1,
      decision: { kind: 'write', detail: { change: 'on', version: 1, fresh: true, before: OFF, after: on } },
    });
    expect(t.rows.get(1)!.publishedAt).toEqual(NOW);
    const seen = bannerSeen(on as SiteBanner);
    expect(await save({ seen, alt: 'تخفیف دانشجویی', href: '/#tariff', code: '' })).toEqual(ok({ change: 'same' }));
    expect(await save({ seen, alt: 'تخفیف تا پنجشنبه', href: '/#tariff' })).toEqual(ok({ change: 'change' }));
  });

  it('«خاموش کن» بی کد: تصویر، متن و پیوند می‌مانند؛ بنر خاموش همان، بی نوشتن', async () => {
    const t = harness();
    expect(await t.images.bannerOff(OPERATOR, IP)).toEqual(ok({ change: 'same' }));
    const on: SiteBanner = { mode: 'on', imageId: 1, alt: 'بنر', href: '/terms' };
    t.values.set('content.banner', on);
    expect(await t.images.bannerOff(OPERATOR, IP)).toEqual(ok({ change: 'off' }));
    expect(t.values.get('content.banner')).toEqual({ ...on, mode: 'off' });
    expect(t.changes.at(-1)).toMatchObject({ imageId: null, decision: { detail: { change: 'off', fresh: false } } });
    expect(t.steps).toEqual([]);
  });
});

describe('صفحه و فایل هر بارگذاری', () => {
  it('بارگذاری نوع دیگر «پیدا نشد»؛ لوگوی روی سایت و بنر روشن در نما؛ فایل با نام دانلود', async () => {
    const t = harness();
    t.rows.set(1, row({ id: 1, kind: 'logo' }));
    t.rows.set(2, row({ id: 2, kind: 'banner' }));
    expect(await t.images.image(OWNER, 'banner', '1')).toMatchObject({ status: 404, error: 'image_not_found' });
    t.values.set('content.logo', { imageId: 1 });
    expect(await t.images.image(OWNER, 'logo', '1')).toMatchObject({ ok: true, value: { liveId: 1, seen: '1', banner: null } });
    const off: SiteBanner = { mode: 'off', imageId: 2, alt: 'بنر', href: '' };
    t.values.set('content.banner', off);
    expect(await t.images.image(OPERATOR, 'banner', '2')).toMatchObject({ ok: true, value: { liveId: null, seen: bannerSeen(off), banner: off } });
    expect(await t.images.file(OWNER, '1', 'favicon')).toEqual(
      ok({ body: new Uint8Array([0, 0, 1, 0]), sizeBytes: 4, fileName: 'logo-1-favicon.ico', contentType: 'image/x-icon' }),
    );
    expect(await t.images.file(OWNER, '1', 'logo')).toMatchObject({ status: 404 });
    expect(await t.images.file(OWNER, '1', '../x')).toMatchObject({ status: 404 });
    expect(await t.images.file(OWNER, '9', 'favicon')).toMatchObject({ status: 404 });
  });
});
