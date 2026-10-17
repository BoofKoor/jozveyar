/**
 * نام روی سایت (برش ۱۲٫۳، `reviewAttribution`) و نظرهای صفحهٔ اصلی (`siteReviews`): build و بی پایگاه داده هیچ، و همان نام و شهری که روی
 * نظر منجمد است؛ خطای پایگاه داده بالا می‌رود تا ISR صفحهٔ قبلی را نگه دارد. نوشتن مشتری در `checkout.test.ts`، کنار صفحهٔ سفارش.
 */

import { describe, expect, it, vi } from 'vitest';

import { PUBLISHED_REVIEWS_LIMIT, type PublishedReview } from '@jozveyar/db';
import { CITIES, PROVINCES } from '@jozveyar/geo';

import { reviewAttribution } from './checkout';
import { siteReviews } from './reviews';
import { BUILD_PHASE } from './tariff';

const MASHHAD = CITIES.find((city) => city.name === 'مشهد')!;
const ENV = { DATABASE_URL: 'postgresql://x' };

const row = (over: Partial<PublishedReview> = {}): PublishedReview => ({
  rating: 5,
  body: 'سر وقت رسید.',
  publicName: 'سارا',
  publicPlace: 'مشهد',
  createdAt: new Date('2026-10-16T08:00:00Z'),
  ...over,
});

describe('نام روی سایت (۱۲٫۳، سؤال ۲۱۳)', () => {
  it('نام کوچک و شهر گیرنده؛ با پیشوند دو کلمه؛ شهر ناشناس استانش', () => {
    const province = PROVINCES.find((p) => p.id === MASHHAD.provinceId)!;
    expect(reviewAttribution({ recipientName: 'سارا احمدی', cityId: MASHHAD.id, provinceId: MASHHAD.provinceId })).toEqual({
      publicName: 'سارا',
      publicPlace: 'مشهد',
    });
    expect(reviewAttribution({ recipientName: 'سید علی رضایی', cityId: null, provinceId: MASHHAD.provinceId })).toEqual({
      publicName: 'سید علی',
      publicPlace: `استان ${province.name}`,
    });
    expect(reviewAttribution({ recipientName: 'سارا احمدی', cityId: 999_999, provinceId: MASHHAD.provinceId }).publicPlace).toBe(`استان ${province.name}`);
  });
});

describe('نظرهای صفحهٔ اصلی (۱۲٫۳)', () => {
  it('build و بی پایگاه داده هیچ، بی خواندن', async () => {
    const published = vi.fn(async () => [row()]);
    expect(await siteReviews({ ...ENV, NEXT_PHASE: BUILD_PHASE }, () => ({ published }))).toEqual([]);
    expect(await siteReviews({}, () => ({ published }))).toEqual([]);
    expect(published).not.toHaveBeenCalled();
  });

  it('نمره و متن همان، با نام و شهری که روی نظر منجمد است', async () => {
    const published = vi.fn(async () => [row(), row({ publicName: 'سید علی', publicPlace: 'استان خراسان رضوی', rating: 4, body: 'خوب' })]);
    const reviews = await siteReviews(ENV, () => ({ published }));
    expect(published).toHaveBeenCalledWith(PUBLISHED_REVIEWS_LIMIT);
    expect(reviews).toEqual([
      { rating: 5, body: 'سر وقت رسید.', name: 'سارا', place: 'مشهد' },
      { rating: 4, body: 'خوب', name: 'سید علی', place: 'استان خراسان رضوی' },
    ]);
  });

  it('خطای پایگاه داده بالا می‌رود: ISR صفحهٔ قبلی را نگه می‌دارد', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(siteReviews(ENV, () => ({ published: async () => Promise.reject(new Error('down')) }))).rejects.toThrow('down');
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
