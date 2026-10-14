import { describe, expect, it } from 'vitest';

import {
  arrange,
  arrangement,
  configure,
  layoutKeys,
  moveTo,
  moveWithin,
  place,
  reconcile,
  restoredLayout,
  startLayout,
  type DeskLayout,
} from './layout';
import type { OrderConfig } from './orderConfig';

const BW: OrderConfig = { colorMode: 'bw', sidesMode: 'double', bindingTypeId: 'spiral_clear', paperTypeId: 'tahrir80', copies: 1 };
const COLOR: OrderConfig = { ...BW, colorMode: 'color', copies: 2 };

/** شکل خلاصهٔ چیدمان: کلید فایل‌های هر جزوه. */
const shape = (layout: DeskLayout) => layout.jozves.map((jozve) => jozve.sections);

describe('چیدمان جزوه‌ها (۸٫۲)', () => {
  it('اولین فایل‌ها یک جزوه‌اند؛ پرسش فقط وقتی چند فایل با هم آمده‌اند (۲۱۵)', () => {
    expect(startLayout(['s1'], null)).toEqual({ jozves: [{ key: 'j1', sections: ['s1'], config: null }], asking: false, next: 2 });
    const three = startLayout(['s1', 's2', 's3'], COLOR);
    expect(shape(three)).toEqual([['s1', 's2', 's3']]);
    expect(three.jozves[0]!.config).toBe(COLOR);
    expect(three.asking).toBe(true);
    expect(arrangement(three)).toBe('together');
  });

  it('«هر فایل جدا» هر فایل را جزوهٔ خودش می‌کند با تنظیمات جزوهٔ ۱، و «همه یک جزوه» برمی‌گرداند (۲۱۶)', () => {
    const together = startLayout(['s1', 's2', 's3'], COLOR);
    const apart = arrange(together, 'apart');
    expect(shape(apart)).toEqual([['s1'], ['s2'], ['s3']]);
    expect(apart.jozves.map((j) => j.key)).toEqual(['j1', 'j2', 'j3']);
    expect(apart.jozves.every((j) => j.config === COLOR)).toBe(true);
    expect(apart.asking).toBe(true);
    expect(arrangement(apart)).toBe('apart');

    // جزوهٔ ۲ رنگش عوض شد؛ «همه یک جزوه» تنظیمات جزوهٔ ۱ را برای همه می‌گیرد.
    const tuned = configure(configure(apart, 'j1', BW), 'j2', COLOR);
    const back = arrange(tuned, 'together');
    expect(shape(back)).toEqual([['s1', 's2', 's3']]);
    expect(back.jozves[0]).toMatchObject({ key: 'j1', config: BW });
    expect(arrange(back, 'apart').jozves.map((j) => j.key)).toEqual(['j1', 'j4', 'j5']);
    // بی پرسش، یا همان حالت: بی‌اثر
    expect(arrange(back, 'together')).toBe(back);
    expect(arrange({ ...back, asking: false }, 'apart')).toEqual({ ...back, asking: false });
  });

  it('بردن به جزوهٔ دیگر یا جزوهٔ تازه: چیدمان دلخواه، پس پرسش می‌رود و برنمی‌گردد (۲۱۶، ۲۱۸)', () => {
    const apart = arrange(startLayout(['s1', 's2', 's3'], BW), 'apart');
    const moved = moveTo(configure(apart, 'j3', COLOR), 's3', 'j1');
    expect(shape(moved)).toEqual([['s1', 's3'], ['s2']]);
    expect(moved.asking).toBe(false);
    // جزوهٔ تازه با همین فایل: ته فهرست، با تنظیمات جزوه‌ای که از آن آمد
    const fresh = moveTo(configure(moved, 'j1', COLOR), 's1', 'new');
    expect(shape(fresh)).toEqual([['s3'], ['s2'], ['s1']]);
    expect(fresh.jozves[2]).toMatchObject({ key: 'j4', config: COLOR });
    // دوباره به همان دو شکل رسید، ولی پرسش برنمی‌گردد
    expect(arrangement(fresh)).toBe('apart');
    expect(fresh.asking).toBe(false);
    // فایل ناشناس، یا همان جزوه: بی‌اثر
    expect(moveTo(fresh, 'nope', 'j1')).toBe(fresh);
    expect(moveTo(fresh, 's2', 'j2')).toBe(fresh);
  });

  it('جابه‌جایی درون همان جزوه؛ لبه بی‌اثر، و جزوهٔ دیگر دست نمی‌خورد', () => {
    const layout = moveTo(startLayout(['a', 'b', 'c', 'd'], null), 'd', 'new');
    expect(shape(moveWithin(layout, 'c', -1))).toEqual([['a', 'c', 'b'], ['d']]);
    expect(shape(moveWithin(layout, 'a', -1))).toEqual([['a', 'b', 'c'], ['d']]);
    expect(shape(moveWithin(layout, 'c', 1))).toEqual([['a', 'b', 'c'], ['d']]);
    expect(shape(moveWithin(layout, 'd', 1))).toEqual([['a', 'b', 'c'], ['d']]);
  });

  it('فایل تازه: ته همان جزوه، یا یک جزوهٔ تازه با پیش‌فرض‌ها؛ پرسش فقط تا وقتی چیدمان یکی از دو حالت است', () => {
    const together = startLayout(['s1', 's2'], COLOR);
    const added = place(together, ['s3'], 'j1');
    expect(shape(added)).toEqual([['s1', 's2', 's3']]);
    expect(added.asking).toBe(true);
    const another = place(together, ['s3', 's4'], 'new');
    expect(shape(another)).toEqual([['s1', 's2'], ['s3', 's4']]);
    expect(another.jozves[1]).toMatchObject({ key: 'j2', config: null });
    expect(another.asking).toBe(false);

    const apart = arrange(together, 'apart');
    expect(place(apart, ['s3'], 'new').asking).toBe(true);
    expect(place(apart, ['s3'], 'j2').asking).toBe(false);
    // جزوه‌ای که در همین فاصله رفت: جزوهٔ تازه
    expect(shape(place(together, ['s3'], 'j9'))).toEqual([['s1', 's2'], ['s3']]);
  });

  it('با صف همگام: فایل رفته و جزوهٔ خالی می‌روند، فایل ناشناس ته جزوهٔ آخر، و بی تغییر همان چیدمان', () => {
    const layout = moveTo(startLayout(['s1', 's2', 's3'], null), 's3', 'new');
    expect(reconcile(layout, ['s1', 's2', 's3'])).toBe(layout);
    expect(shape(reconcile(layout, ['s1', 's2']))).toEqual([['s1', 's2']]);
    expect(shape(reconcile(layout, ['s1', 's2', 's3', 's4']))).toEqual([['s1', 's2'], ['s3', 's4']]);
    // place همان فایل را از جای موقتش برمی‌دارد
    const placed = place(reconcile(layout, ['s1', 's2', 's3', 's4']), ['s4'], 'j1');
    expect(shape(placed)).toEqual([['s1', 's2', 's4'], ['s3']]);
    expect(layoutKeys(placed)).toHaveLength(4);
    // کمتر از دو فایل: پرسش می‌رود، و با فایل بعدی هم نمی‌آید
    const alone = reconcile(startLayout(['s1', 's2'], null), ['s1']);
    expect(alone.asking).toBe(false);
    expect(place(alone, ['s5'], 'j1').asking).toBe(false);
    // همه رفتند و فایل تازه آمد
    expect(shape(reconcile(startLayout(['s1'], null), ['s9']))).toEqual([['s9']]);
  });

  it('برگشت بعد از رفرش: کلیدهای صف به ترتیب، با شمار فایل هر جزوه؛ شمار ناجور یعنی از اول', () => {
    const restored = restoredLayout(['a', 'b', 'c'], [{ files: 2, config: COLOR }, { files: 1, config: null }], false);
    expect(restored).toEqual({
      jozves: [
        { key: 'j1', sections: ['a', 'b'], config: COLOR },
        { key: 'j2', sections: ['c'], config: null },
      ],
      asking: false,
      next: 3,
    });
    expect(restoredLayout(['a', 'b'], [{ files: 2, config: null }], true)?.asking).toBe(true);
    // پرسشی که با این شکل معنا ندارد نمی‌ماند
    expect(restoredLayout(['a', 'b', 'c'], [{ files: 2, config: null }, { files: 1, config: null }], true)?.asking).toBe(false);
    expect(restoredLayout(['a', 'b'], [{ files: 3, config: null }], false)).toBeNull();
    expect(restoredLayout(['a'], [{ files: 0, config: null }, { files: 1, config: null }], false)).toBeNull();
    expect(restoredLayout(['a'], [], false)).toBeNull();
  });
});
