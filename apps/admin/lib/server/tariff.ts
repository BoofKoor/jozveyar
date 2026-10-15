/**
 * تعرفه در پنل (برش ۴٫۵، ADR-040؛ طرح پنل `m-tariff*`): نسخه‌ها و نسخهٔ فعال، پیش‌نویس از روی نسخهٔ فعال، ذخیره و پاک
 * کردنش، و فعال کردن یک نسخه با کد تازهٔ برنامهٔ تأیید؛ برگشت همان فعال کردن نسخهٔ قبل است.
 *
 * - **مجوز در سرور** (ADR-038): دیدن با `tariff.read` (هر دو نقش)؛ پیش‌نویس، ذخیره، پاک کردن و فعال کردن با `tariff.edit`
 *   (فقط مالک). فعال کردن کار حساس است: کد تازه (`stepUp`)، پس از هر سنجشی که بی کد جواب دارد، تا کد هدر نرود.
 * - **سرور منبع حقیقت است:** فرم با همان `readDraft` ویرایشگر مرورگری دوباره سنجیده می‌شود؛ پیش‌نویس با خطا ذخیره نمی‌شود،
 *   و پیش‌نویسی که ایراد دارد (`checkPriceList`) فعال نمی‌شود.
 * - **همان که دیده شد:** ویرایشگر و صفحهٔ فعال‌سازی اثر انگشت محتوای نسخه را می‌فرستند (`fingerprint`)، و ذخیره‌گاه زیر قفل
 *   با محتوای امروز می‌سنجدش. پیش‌نویسی که در زبانه یا دست دیگری عوض شده رونویسی نمی‌شود، و فعال‌سازی درست همان نسخه‌ای
 *   را روشن می‌کند که ادمین تغییرهایش را دید، نسبت به همان نسخهٔ فعالی که دید.
 * - **رویداد** هر کار در همان تراکنش خودش است (ذخیره‌گاه، `@jozveyar/db` → `tariff.ts`).
 * - **خاموش موقت (۸٫۴، سؤال ۱۸۸):** مالک و متصدی (`tariff.pause`) گزینه‌ای از تعرفهٔ فعال را بی نسخهٔ تازه موقتاً خاموش یا دوباره
 *   روشن می‌کنند: تنظیم `catalog.paused` زیر قفل تنظیم‌ها، «همان که دیده شد»، با رویداد `tariff.availability` در همان تراکنش. کد تازه
 *   نمی‌خواهد: قیمت را دست نمی‌زند و برگشت‌پذیر است.
 *
 * بی نکست؛ هر وابستگی از درگاه می‌آید (`TariffStore`، `stepUp`)، پس با ذخیره‌گاه و ساعت ساختگی تست می‌شود. قفل، تراکنش و
 * تغییرناپذیری نسخهٔ فعال‌شده روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { createHash } from 'node:crypto';

import { SETTING_SCHEMAS, type CatalogPaused, type PriceList } from '@jozveyar/contracts';
import { CATALOG_PAUSED_SETTING, DEFAULT_SETTINGS, readSetting, type SettingsStore, type TariffStore, type TariffVersion } from '@jozveyar/db';

import type { Seg } from '../orders';
import {
  activePeriods,
  availabilityItems,
  canonicalJson,
  checkPriceList,
  draftFormOf,
  draftLabel,
  readDraft,
  tariffChanges,
  togglePaused,
  type ActivePeriod,
  type AvailabilityItem,
  type DraftForm,
  type DraftIssue,
  type TariffChanges,
} from '../tariff';
import { can, ipHashOf, type AdminSession } from './auth';
import { fail, ok, type Result } from './result';

export interface PanelTariffDeps {
  store: TariffStore;
  /** تنظیم‌ها: خاموش موقت گزینه‌ها (`catalog.paused`، ۸٫۴) زیر همان قفل و با رویداد در همان تراکنش. */
  settings: SettingsStore;
  /** کد تازهٔ برنامهٔ تأیید برای کار حساس؛ همان `AdminAuth.stepUp`، با سقف اشتباه و قفلش. */
  stepUp: (session: AdminSession, code: unknown, ip: string) => Promise<Result<true>>;
  /** `SESSION_SECRET`: کلید HMAC IP، مثل ورود. */
  secret: string;
  now?: () => Date;
}

export interface TariffOverview {
  now: Date;
  active: { version: TariffVersion; list: PriceList };
  /** همهٔ نسخه‌ها، تازه‌ترین اول. */
  versions: TariffVersion[];
  /** دوره‌های فعال بودن هر نسخه. */
  periods: Map<number, ActivePeriod[]>;
  /** پیش‌نویسی که هست؛ هر بار یکی. */
  draft: TariffVersion | null;
  canEdit: boolean;
  /** کارت «در دسترس بودن» (۸٫۴): گزینه‌های خاموش‌شدنی نسخهٔ فعال با حال امروز، و اینکه این ادمین خاموش و روشن می‌کند. */
  availability: { items: AvailabilityItem[]; canPause: boolean };
}

export interface DraftView {
  now: Date;
  version: TariffVersion;
  /** پیش‌نویس ذخیره‌شده؛ فرم از روی همین. */
  list: PriceList;
  form: DraftForm;
  active: { version: number; list: PriceList };
  fingerprint: string;
}

export interface VersionView {
  now: Date;
  version: TariffVersion;
  list: PriceList;
  periods: ActivePeriod[];
  canEdit: boolean;
}

export interface ActivationView {
  version: TariffVersion;
  list: PriceList;
  active: { version: number; list: PriceList };
  changes: TariffChanges;
  fingerprint: string;
  /** ایرادهای پیش‌نویس (`checkPriceList`)؛ نسخه‌ای که پیش‌تر فعال بوده هیچ. */
  problems: Seg[][];
  /** نسخه‌ای که پیش‌تر فعال بوده (برگشت)؛ نه پیش‌نویس. */
  again: boolean;
}

/** اثر انگشت محتوای یک نسخه: همان محتوا، هر ترتیبی که ردیف‌ها آمده باشند، همان متن. */
export const fingerprint = (list: PriceList) => createHash('sha256').update(canonicalJson(list)).digest('hex');

/** شمارهٔ نسخه از نشانی یا فرم. */
export function versionOf(value: unknown): number | null {
  return typeof value === 'string' && /^[1-9]\d{0,8}$/.test(value) ? Number(value) : null;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** مقدار خام `catalog.paused` به شکل قرارداد، یا پیش‌فرض؛ همان `readSetting`، زیر قفل و بی لاگ. */
function storedPaused(raw: unknown): CatalogPaused {
  const parsed = raw === undefined || raw === null ? null : SETTING_SCHEMAS['catalog.paused'].safeParse(raw);
  return parsed?.success ? parsed.data : (DEFAULT_SETTINGS['catalog.paused'] as CatalogPaused);
}

export function createPanelTariff(deps: PanelTariffDeps) {
  const now = deps.now ?? (() => new Date());
  const { store } = deps;
  const actor = (session: AdminSession, ip: string) => ({ adminUserId: session.userId, ipHash: ipHashOf(deps.secret, ip) });

  /** نسخه‌ها و نسخهٔ فعال با محتوایش؛ null اگر هیچ نسخه‌ای فعال نیست (پایگاه داده خراب). */
  async function current() {
    const versions = await store.versions();
    const activeRow = versions.find((v) => v.isActive);
    const activeList = activeRow ? await store.load(activeRow.version) : null;
    if (!activeRow || !activeList) return null;
    return { versions, active: { version: activeRow, list: activeList } };
  }

  return {
    async overview(session: AdminSession): Promise<Result<TariffOverview>> {
      if (!can(session, 'tariff.read')) return fail(403, 'forbidden');
      const [state, activations, paused] = await Promise.all([
        current(),
        store.activations(),
        readSetting((key) => deps.settings.read(key), 'catalog.paused'),
      ]);
      if (!state) return fail(503, 'unavailable');
      return ok({
        now: now(),
        active: state.active,
        versions: state.versions,
        periods: activePeriods(activations),
        draft: state.versions.find((v) => v.activatedAt === null) ?? null,
        canEdit: can(session, 'tariff.edit'),
        availability: { items: availabilityItems(state.active.list, paused), canPause: can(session, 'tariff.pause') },
      });
    },

    /**
     * خاموش موقت یا روشن دوبارهٔ یک گزینهٔ تعرفهٔ فعال (۸٫۴، سؤال ۱۸۸): فقط گزینه‌ای که کارت نشان می‌دهد (`availabilityItems`)، از
     * حالی که صفحه نشان داد (`seen`، «1» یعنی خاموش)؛ مقصد یکسان موفق است، بی رویداد. سایت با درخواست بعدی می‌بیند (صفحهٔ اصلی تا یک
     * دقیقه)، و سرور مسیر خرید گزینهٔ خاموش را همان لحظه رد می‌کند.
     */
    async setAvailability(
      session: AdminSession,
      input: { kind: unknown; id: unknown; paused: unknown; seen: unknown },
      ip: string,
    ): Promise<Result<{ item: AvailabilityItem; written: boolean }>> {
      if (!can(session, 'tariff.pause')) return fail(403, 'forbidden');
      const state = await current();
      if (!state) return fail(503, 'unavailable');
      const { list } = state.active;
      const found = availabilityItems(list, null).find((item) => item.kind === input.kind && item.id === input.id);
      if (!found) return fail(404, 'option_not_found');
      const paused = text(input.paused) === '1';
      const seen = text(input.seen);
      const result = await deps.settings.change({
        key: CATALOG_PAUSED_SETTING,
        action: 'tariff.availability',
        at: now(),
        actor: actor(session, ip),
        decide: (raw) => {
          const stored = storedPaused(raw);
          const was = availabilityItems(list, stored).find((item) => item.kind === found.kind && item.id === found.id)!.paused;
          if (was === paused) return { kind: 'same' };
          if ((was ? '1' : '0') !== seen) return { kind: 'reject', reason: 'changed' };
          return {
            kind: 'write',
            value: togglePaused(stored, found, paused),
            detail: { kind: found.kind, id: found.id, name: found.name, paused, version: state.active.version.version },
          };
        },
      });
      if (!result.ok) return fail(409, 'availability_changed');
      return ok({ item: { ...found, paused }, written: result.written });
    },

    /** یک نسخه: پیش‌نویس برای ویرایش (فقط مالک)، یا هر نسخهٔ دیگر فقط‌خواندنی. */
    async version(
      session: AdminSession,
      param: string,
    ): Promise<Result<{ kind: 'draft'; view: DraftView } | { kind: 'version'; view: VersionView }>> {
      if (!can(session, 'tariff.read')) return fail(403, 'forbidden');
      const wanted = versionOf(param);
      const state = wanted === null ? null : await current();
      const row = state?.versions.find((v) => v.version === wanted);
      const list = row ? await store.load(row.version) : null;
      if (!state || !row || !list) return fail(404, 'tariff_not_found');
      if (row.activatedAt === null) {
        if (!can(session, 'tariff.edit')) return fail(403, 'forbidden');
        return ok({
          kind: 'draft',
          view: {
            now: now(),
            version: row,
            list,
            form: draftFormOf(list),
            active: { version: state.active.version.version, list: state.active.list },
            fingerprint: fingerprint(list),
          },
        });
      }
      const periods = activePeriods(await store.activations()).get(row.version) ?? [];
      return ok({ kind: 'version', view: { now: now(), version: row, list, periods, canEdit: can(session, 'tariff.edit') } });
    },

    /** صفحهٔ فعال‌سازی: تغییرها نسبت به نسخهٔ فعال، و ایراد پیش‌نویس اگر هست. نسخهٔ فعال خودش نه. */
    async activation(session: AdminSession, param: string): Promise<Result<ActivationView>> {
      if (!can(session, 'tariff.edit')) return fail(403, 'forbidden');
      const wanted = versionOf(param);
      const state = wanted === null ? null : await current();
      const row = state?.versions.find((v) => v.version === wanted);
      const list = row ? await store.load(row.version) : null;
      if (!state || !row || !list) return fail(404, 'tariff_not_found');
      if (row.isActive) return fail(409, 'already_active');
      const again = row.activatedAt !== null;
      return ok({
        version: row,
        list,
        active: { version: state.active.version.version, list: state.active.list },
        changes: tariffChanges(state.active.list, list),
        fingerprint: fingerprint(list),
        problems: again ? [] : checkPriceList(list),
        again,
      });
    },

    /** «نسخهٔ تازه»: پیش‌نویسی که هست، یا تازه از روی نسخهٔ فعال با نام ماه و سال. */
    async createDraft(session: AdminSession, ip: string): Promise<Result<{ version: number; created: boolean }>> {
      if (!can(session, 'tariff.edit')) return fail(403, 'forbidden');
      const at = now();
      return ok(await store.createDraft({ at, label: draftLabel(at), actor: actor(session, ip) }));
    },

    /**
     * ذخیرهٔ پیش‌نویس از فرم: همان سنجش ویرایشگر، و فقط اگر پیش‌نویس از وقتی ویرایشگر باز شد عوض نشده (`fingerprint`).
     * پیش‌نویس با خطا ذخیره نمی‌شود: خطاها با جایشان برمی‌گردند.
     */
    async saveDraft(
      session: AdminSession,
      param: string,
      input: { form: DraftForm; fingerprint: unknown },
      ip: string,
    ): Promise<Result<{ version: number }>> {
      if (!can(session, 'tariff.edit')) return fail(403, 'forbidden');
      const wanted = versionOf(param);
      const row = wanted === null ? undefined : (await store.versions()).find((v) => v.version === wanted);
      const base = row ? await store.load(row.version) : null;
      if (!row || !base) return fail(404, 'tariff_not_found');
      if (row.activatedAt !== null) return fail(409, 'not_draft');
      const check = readDraft(input.form, base, null);
      if (!check.list) return fail(400, 'invalid_draft', { issues: check.errors satisfies DraftIssue[] });
      const seen = text(input.fingerprint);
      if (fingerprint(base) !== seen) return fail(409, 'draft_changed');
      const saved = await store.saveDraft({
        list: check.list,
        verify: (stored) => fingerprint(stored) === seen,
        at: now(),
        actor: actor(session, ip),
      });
      if (saved === 'not_draft') return fail(409, 'not_draft');
      if (saved === 'changed') return fail(409, 'draft_changed');
      return ok({ version: row.version });
    },

    async deleteDraft(session: AdminSession, param: string, ip: string): Promise<Result<true>> {
      if (!can(session, 'tariff.edit')) return fail(403, 'forbidden');
      const wanted = versionOf(param);
      if (wanted === null) return fail(404, 'tariff_not_found');
      const done = await store.deleteDraft({ version: wanted, at: now(), actor: actor(session, ip) });
      return done === 'ok' ? ok(true) : fail(409, 'not_draft');
    },

    /**
     * فعال کردن یک نسخه (پیش‌نویس، یا نسخهٔ قبل برای برگشت) با کد تازه. پیش از کد: نسخه هست، نسخهٔ فعال همان است که
     * صفحهٔ فعال‌سازی نشان داد (`active`)، محتوا همان است که دید (`fingerprint`)، و پیش‌نویس ایرادی ندارد؛ پس کد برای
     * کاری که انجام‌شدنی نیست هدر نمی‌رود. همین‌ها را ذخیره‌گاه زیر قفل دوباره می‌سنجد. نسخه‌ای که همین حالا فعال است
     * موفق است، بی کد و بی کار دوباره (دو کلیک).
     */
    async activate(
      session: AdminSession,
      param: string,
      input: { active: unknown; fingerprint: unknown; code: unknown },
      ip: string,
    ): Promise<Result<{ version: number; previous: number | null }>> {
      if (!can(session, 'tariff.edit')) return fail(403, 'forbidden');
      const wanted = versionOf(param);
      const state = wanted === null ? null : await current();
      const row = state?.versions.find((v) => v.version === wanted);
      const list = row ? await store.load(row.version) : null;
      if (!state || !row || !list) return fail(404, 'tariff_not_found');
      if (row.isActive) return ok({ version: row.version, previous: null });
      const expectedActive = versionOf(input.active);
      const seen = text(input.fingerprint);
      if (expectedActive !== state.active.version.version || fingerprint(list) !== seen) return fail(409, 'tariff_changed');
      const again = row.activatedAt !== null;
      if (!again && checkPriceList(list).length > 0) return fail(400, 'invalid_draft');

      const stepped = await deps.stepUp(session, input.code, ip);
      if (!stepped.ok) return stepped;
      const done = await store.activate({
        version: row.version,
        expectedActive,
        verify: (stored) => fingerprint(stored) === seen && (again || checkPriceList(stored).length === 0),
        at: now(),
        actor: actor(session, ip),
      });
      if (done.ok) return ok({ version: row.version, previous: done.previous });
      return done.reason === 'not_found' ? fail(404, 'tariff_not_found') : fail(409, 'tariff_changed');
    },
  };
}

export type PanelTariff = ReturnType<typeof createPanelTariff>;
