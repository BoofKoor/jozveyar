import { ratingLabel } from '../lib/review';
import type { SiteReview } from '../lib/server/reviews';

/**
 * «نظر مشتری‌ها» صفحهٔ اصلی (برش ۱۲٫۳، ADR-064، سؤال ۲۱۳): فقط آنچه مالک روی سایت گذاشت، تازه‌ترین اول، با نمره، متن همان‌طور که مشتری
 * نوشت، و «سارا، مشهد»؛ نام خانوادگی، موبایل و شمارهٔ سفارش هرگز. بی نظر هیچ. کامپوننت سرور، بی JS؛ با ISR همین صفحه، و در حالت سفارش
 * کنار می‌رود، مثل سه قدم و تعرفه (home.css).
 */
export function Reviews({ reviews }: { reviews: SiteReview[] }) {
  if (reviews.length === 0) return null;
  return (
    <section id="reviews" className="home-sec" aria-labelledby="reviews-title">
      <h2 id="reviews-title" className="home-sec__title">
        نظر مشتری‌ها
      </h2>
      <ul className="home-reviews">
        {reviews.map((review, i) => (
          <li key={i}>
            <figure className="jy-card home-review">
              <p className="home-review__rating">
                <span className="num">{review.rating}</span> از <span className="num">5</span> · {ratingLabel(review.rating)}
              </p>
              <blockquote className="home-review__body">{review.body}</blockquote>
              <figcaption className="home-review__who">
                {review.name}، {review.place}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
