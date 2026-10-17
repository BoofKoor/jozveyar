'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { checkoutApi } from '../../lib/checkout/api';
import { RATINGS, REVIEW_BODY_MAX, ratingLabel } from '../../lib/review';

type Problem = 'rating' | 'long' | 'network' | 'failed';

const PROBLEM_TEXT: Record<Exclude<Problem, 'rating' | 'long'>, string> = {
  network: 'ارتباط برقرار نشد. اینترنت را ببین و دوباره «بفرست» را بزن.',
  failed: 'نظرت نرسید؛ چند لحظهٔ دیگر دوباره «بفرست» را بزن.',
};

/**
 * «از جزوه راضی بودی؟» صفحهٔ سفارش (برش ۱۲٫۳، ADR-064، سؤال ۲۱۳): نمرهٔ ۱ تا ۵ و چند کلمهٔ اختیاری، فقط برای صاحب سفارشی که «تحویل پست
 * شد». جزیرهٔ کلاینت کوچکی در صفحهٔ سرور؛ پس از «بفرست» صفحه با حالت سرور از نو می‌آید و همین کارت جایش را به «نظرت رسید» می‌دهد. همان را
 * که از زبانهٔ دیگری رسیده بود، یا سفارشی که دیگر نظر نمی‌گیرد، هم از نو.
 */
export function ReviewForm({ token, publicName, place }: { token: string; publicName: string; place: string }) {
  const router = useRouter();
  const [rating, setRating] = useState<number | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (rating === null) {
      setProblem('rating');
      return;
    }
    setBusy(true);
    setProblem(null);
    const result = await checkoutApi(window.fetch.bind(window)).review(token, { rating, body });
    if (result.ok || result.error === 'review_exists' || result.error === 'review_not_open') {
      router.refresh();
      return;
    }
    setBusy(false);
    setProblem(
      result.error === 'invalid_rating' ? 'rating' : result.error === 'review_too_long' ? 'long' : result.error === 'network' ? 'network' : 'failed',
    );
  }

  return (
    <section className="jy-card" aria-labelledby="review-title" data-testid="review-form">
      <h2 id="review-title" className="jy-card__title">
        از جزوه راضی بودی؟
      </h2>
      <p className="ck-sub">نظرت کمکمان می‌کند بهتر چاپ کنیم.</p>
      <form className="ck-form" onSubmit={(event) => void submit(event)} noValidate>
        <fieldset className="min-w-0" aria-describedby={problem === 'rating' ? 'review-rating-error' : undefined}>
          <legend className="jy-label">نمره</legend>
          <div className="ck-rate">
            {RATINGS.map((option) => (
              <label key={option.value} className="ck-rate__opt">
                <input
                  type="radio"
                  name="rating"
                  value={option.value}
                  checked={rating === option.value}
                  onChange={() => {
                    setRating(option.value);
                    setProblem(null);
                  }}
                  className="ck-rate__radio"
                  aria-label={`${option.value}، ${option.label}`}
                />
                <span className="num" aria-hidden="true">
                  {option.value}
                </span>
              </label>
            ))}
          </div>
          <p className="ck-rate__scale" aria-hidden="true">
            <span>{RATINGS[0].label}</span>
            <span>{RATINGS[4].label}</span>
          </p>
          {rating !== null ? (
            <p className="ck-rate__picked" data-testid="review-picked">
              {ratingLabel(rating)}
            </p>
          ) : null}
          {problem === 'rating' ? (
            <p id="review-rating-error" className="jy-error">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              یک نمره انتخاب کن.
            </p>
          ) : null}
        </fieldset>
        <div className="jy-field">
          <label className="jy-label" htmlFor="review-body">
            چند کلمه، اگر خواستی
          </label>
          <textarea
            id="review-body"
            name="body"
            className="jy-input"
            rows={3}
            maxLength={REVIEW_BODY_MAX}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            aria-invalid={problem === 'long' ? true : undefined}
            aria-describedby={problem === 'long' ? 'review-body-error review-body-hint' : 'review-body-hint'}
          />
          {problem === 'long' ? (
            <p id="review-body-error" className="jy-error">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              حداکثر <span className="num">{REVIEW_BODY_MAX}</span> نویسه.
            </p>
          ) : null}
          <p id="review-body-hint" className="jy-hint">
            اگر چیزی بنویسی و تأییدش کنیم، با نام «{publicName}» از {place} روی صفحهٔ اصلی می‌آید؛ نام خانوادگی و موبایلت هرگز.
          </p>
        </div>
        {problem === 'network' || problem === 'failed' ? (
          <div className="jy-note jy-note--error" role="alert" data-testid="review-failed">
            <span className="jy-icon jy-icon-error" aria-hidden="true" />
            <span>{PROBLEM_TEXT[problem]}</span>
          </div>
        ) : null}
        <div>
          <button type="submit" className={`jy-btn jy-btn--primary${busy ? ' is-loading' : ''}`} disabled={busy} aria-busy={busy || undefined}>
            بفرست
          </button>
        </div>
      </form>
    </section>
  );
}
