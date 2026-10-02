/**
 * نوار پیش‌نمایش مالک (برش ۷٫۵، سؤال ۱۶۸): اسکریپت درون HTML، روی یک DOM ساختگی کوچک. بی کوکی نشانه هیچ درخواستی نمی‌رود؛ پیش‌نمایش
 * زنده نوار را اول بدنه می‌گذارد، با متن سرور فقط به‌صورت متن؛ «خروج» ردیف را می‌بندد و صفحه را از نو بار می‌کند.
 */

import { describe, expect, it, vi } from 'vitest';

import { PREVIEW_BAR_SCRIPT } from './previewBar';

class FakeNode {
  className = '';
  text = '';
  type = '';
  disabled = false;
  readonly attrs: Record<string, string> = {};
  readonly children: FakeNode[] = [];
  readonly listeners: Record<string, () => void> = {};
  constructor(readonly tag: string) {}
  set textContent(value: string) {
    this.text = value;
  }
  setAttribute(name: string, value: string) {
    this.attrs[name] = value;
  }
  appendChild(node: FakeNode) {
    this.children.push(node);
    return node;
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners[type] = listener;
  }
  get firstChild() {
    return this.children[0] ?? null;
  }
  insertBefore(node: FakeNode, ref: FakeNode | null) {
    this.children.splice(ref ? this.children.indexOf(ref) : this.children.length, 0, node);
    return node;
  }
  /** متن خواندنی، مثل `textContent` مرورگر. */
  get allText(): string {
    return this.text + this.children.map((child) => child.allText).join('');
  }
  find(predicate: (node: FakeNode) => boolean): FakeNode | null {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const found = child.find(predicate);
      if (found) return found;
    }
    return null;
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function run(cookie: string, answer: unknown | Error) {
  const body = new FakeNode('body');
  const header = body.appendChild(new FakeNode('header'));
  const document = {
    cookie,
    body,
    createElement: (tag: string) => new FakeNode(tag),
    createTextNode: (text: string) => Object.assign(new FakeNode('#text'), { text }),
  };
  const fetch = vi.fn(async (_url: string, init?: { method?: string }) => {
    if (init?.method === 'DELETE') return { ok: true, json: async () => ({ active: false }) };
    if (answer instanceof Error) throw answer;
    return { ok: true, json: async () => answer };
  });
  const location = { reload: vi.fn() };
  new Function('document', 'fetch', 'location', PREVIEW_BAR_SCRIPT)(document, fetch, location);
  return { body, header, fetch, location };
}

const ACTIVE = { active: true, until: '2026-10-06T07:50:00.000Z', untilDay: 'سه‌شنبه', untilTime: '11:20' };

describe('نوار پیش‌نمایش مالک', () => {
  it('بی کوکی نشانهٔ jy_pv هیچ درخواستی نمی‌رود و نواری نیست', async () => {
    for (const cookie of ['', 'jy_sid=abc', 'xjy_pv=1', 'jy_pvx=1']) {
      const { body, fetch } = run(cookie, ACTIVE);
      await flush();
      expect(fetch, cookie).not.toHaveBeenCalled();
      expect(body.children).toHaveLength(1);
    }
  });

  it('پیش‌نمایش زنده: نوار اول بدنه، با متن طرح و ساعت در `num`', async () => {
    const { body, header, fetch } = run('jy_sid=abc; jy_pv=1', ACTIVE);
    await flush();
    expect(fetch).toHaveBeenCalledWith('/api/checkout/preview', { credentials: 'same-origin', cache: 'no-store' });
    const bar = body.children[0]!;
    expect(body.children[1]).toBe(header);
    expect(bar.className).toBe('ck-preview');
    expect(bar.attrs).toMatchObject({ role: 'note', 'aria-label': 'پیش‌نمایش مالک', 'data-testid': 'preview-bar' });
    expect(bar.allText).toBe(
      'پیش‌نمایش مالک: مسیر خرید فقط برای همین مرورگر باز است، تا سه‌شنبه 11:20. پرداخت و پیامک واقعی‌اند.خروج از پیش‌نمایش',
    );
    expect(bar.find((node) => node.className === 'num')?.text).toBe('11:20');
  });

  it('متن سرور فقط متن است، هرگز HTML', async () => {
    const { body } = run('jy_pv=1', { ...ACTIVE, untilDay: '<img src=x onerror=alert(1)>' });
    await flush();
    const bar = body.children[0]!;
    expect(bar.find((node) => node.tag === 'img')).toBeNull();
    expect(bar.allText).toContain('<img src=x onerror=alert(1)>');
  });

  it('پیش‌نمایش نه زنده، پاسخ نادرست یا شبکهٔ قطع: بی نوار و بی خطا', async () => {
    for (const answer of [{ active: false }, null, new Error('network')]) {
      const { body } = run('jy_pv=1', answer);
      await flush();
      expect(body.children).toHaveLength(1);
    }
  });

  it('«خروج از پیش‌نمایش»: DELETE، و صفحه از نو', async () => {
    const { body, fetch, location } = run('jy_pv=1', ACTIVE);
    await flush();
    const exit = body.find((node) => node.tag === 'button')!;
    expect(exit.type).toBe('button');
    expect(exit.className).toBe('jy-btn jy-btn--text');
    exit.listeners.click!();
    expect(exit.disabled).toBe(true);
    await flush();
    expect(fetch).toHaveBeenLastCalledWith('/api/checkout/preview', { method: 'DELETE', credentials: 'same-origin' });
    expect(location.reload).toHaveBeenCalledTimes(1);
  });
});
