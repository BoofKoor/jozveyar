/**
 * ابزارهای مشترک تست‌های سرتاسری پنل (`admin.spec.ts`، `orders.spec.ts`): دستور سرور، کد برنامهٔ تأیید مثل گوشی،
 * مرورگر با IP خودش، پاییدن CSP و درخواست بیرونی، ثبت با پیوند، و ورود. طرز اجرا بالای `admin.spec.ts`.
 */

import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { join } from 'node:path';

import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { base32Decode, hotp, totpStep } from '../lib/server/totp';

export const BASE = process.env.E2E_ADMIN_BASE_URL;
export const GATE = process.env.ADMIN_BASE_PATH?.trim();

export const at = (path = '') => `${GATE}${path}`;
export const PASSWORD = 'یک جملهٔ کوتاه و امن';

/** دستور سرور، همان که `infra/admin-invite.sh` درون کانتینر می‌زند. */
export function serverInvite(username: string, ...args: string[]): string {
  const out = execFileSync(process.execPath, [join(process.cwd(), 'dist', 'cli.mjs'), 'invite', username, ...args], {
    env: process.env,
    encoding: 'utf8',
  });
  const link = /https?:\/\/\S+\/invite\/[A-Za-z0-9_-]{43}/.exec(out)?.[0];
  if (!link) throw new Error(`پیوندی در خروجی دستور نیست:\n${out}`);
  return link;
}

/**
 * کد تازهٔ برنامهٔ تأیید، مثل گوشی. هر کد یک بار (سرور گام را مصرف می‌کند)، پس گام جاری یا بعدی که هنوز
 * به کار نرفته؛ اگر هر دو رفته‌اند، تا گام بعد صبر.
 */
const usedSteps = new Map<string, number>();
export async function codeFor(secret: string): Promise<string> {
  const key = base32Decode(secret);
  for (;;) {
    const now = totpStep(new Date());
    const last = usedSteps.get(secret) ?? -1;
    const step = [now, now + 1].find((s) => s > last);
    if (step !== undefined) {
      usedSteps.set(secret, step);
      return hotp(key, step);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/** هر مرورگر IP خودش را دارد، تا سقف ۳۰ تلاش ورود در ساعت هر IP بین تست‌ها و اجراها پر نشود. */
export async function newContext(browser: Browser, viewport = { width: 1280, height: 800 }): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: BASE,
    viewport,
    extraHTTPHeaders: { 'x-real-ip': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` },
  });
}

/** نقض CSP، خطای صفحه و هر درخواست بیرون از خود پنل. */
export function watch(page: Page) {
  const problems: string[] = [];
  const origin = new URL(BASE!).origin;
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to (load|execute|apply)/i.test(message.text())) problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol !== 'data:' && url.origin !== origin) problems.push(`بیرونی: ${request.url()}`);
  });
  return problems;
}

/** ثبت با پیوند: کلید از صفحه، رمز، و کد؛ برمی‌گرداند کلید برنامهٔ تأیید را. */
export async function enroll(page: Page, link: string): Promise<string> {
  await page.goto(link);
  await expect(page.getByRole('img', { name: 'کد QR برنامهٔ تأیید' })).toBeVisible();
  const secret = (await page.locator('.ad-qr__key').innerText()).replace(/\s/g, '');
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await page.getByLabel('رمز', { exact: true }).fill(PASSWORD);
  await page.getByLabel('تکرار رمز').fill(PASSWORD);
  await page.getByLabel('کدی که برنامه نشان می‌دهد').fill(await codeFor(secret));
  await page.getByRole('button', { name: 'فعال کن و وارد شو' }).click();
  await expect(page.getByRole('heading', { name: 'پیشخوان' })).toBeVisible();
  return secret;
}

/** پیام خطا یا هشدار صفحه؛ اعلان‌گر مسیر نکست هم `role=alert` دارد ولی بیرون `main` است. */
export const alertOf = (page: Page) => page.locator('main').getByRole('alert');

/**
 * ورود. تلاشی که رمزش نادرست است یا حسابش بسته، کد را نمی‌سنجد و گامی مصرف نمی‌کند؛ پس کد ساختگی
 * می‌گیرد (`WRONG`) تا کدهای درست برای تلاش‌های بعدی بمانند.
 */
export const WRONG = { password: 'رمز نادرست است اینجا', code: '000000' };
export async function login(page: Page, username: string, secret: string, over: { password?: string; code?: string } = {}) {
  await page.goto(at('/login'));
  await page.getByLabel('نام کاربری').fill(username);
  await page.getByLabel('رمز').fill(over.password ?? PASSWORD);
  await page.getByLabel('کد برنامهٔ تأیید').fill(over.code ?? (await codeFor(secret)));
  await page.getByRole('button', { name: 'ورود' }).click();
}

/** بی سرریز افقی، هدف لمسی دست‌کم ۴۴ پیکسل، و آیکونی که شکل دارد (Tailwind فقط نام کامل را می‌سازد). */
export async function layoutProblems(page: Page): Promise<{ overflow: number; small: string[]; blank: string[] }> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('main a, main button, main input:not([type=hidden]), nav a, nav summary, header button')]
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ el, box }) => box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden')
      // پیوند درون جمله (`.jy-link`، مثل شمارهٔ سفارش در هشدار) از سقف معاف است، مثل WCAG 2.5.8.
      .filter(({ el, box }) => box.height < 44 && !el.closest('.jy-tile') && el.getAttribute('type') !== 'radio' && !el.classList.contains('jy-link'))
      .map(({ el, box }) => `${el.tagName} «${(el.textContent ?? '').trim().slice(0, 20)}» ${Math.round(box.height)}`),
  );
  const blank = await page.evaluate(() =>
    [...document.querySelectorAll('.jy-icon')]
      .filter((el) => !getComputedStyle(el).getPropertyValue('mask-image').startsWith('url('))
      .map((el) => el.className),
  );
  return { overflow, small, blank };
}
