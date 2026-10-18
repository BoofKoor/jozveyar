import type { HomeStep, PlaceholderValues } from '@jozveyar/content';
import { InlineText } from '@jozveyar/content/render';

/**
 * «سه قدم تا جزوهٔ چاپ‌شده»، مقصد «چطور کار می‌کند» در سربرگ؛ از طرح ز (docs/UI.md، ۴الف). کامپوننت سرور. رقم دایره‌ها با `--jy-digit-rise`
 * دقیق وسط است (home.css، و tests/digits.spec.ts). از ۱۱٫۱ تیتر و هر قدم از «صفحهٔ اصلی» پنل (سؤال ۲۸۳)، با عدد امروز جای‌نگهدارها؛ پیوند
 * متن قدم در زبانهٔ تازه، مثل سؤال‌ها.
 */
export function HowItWorks({ title, steps, values }: { title: string; steps: readonly HomeStep[]; values: PlaceholderValues }) {
  const options = { values, newTab: true };
  return (
    <section id="how" className="home-sec" aria-labelledby="how-title">
      <h2 id="how-title" className="home-sec__title">
        <InlineText text={title} format="line" options={options} />
      </h2>
      <ol className="home-how">
        {steps.map((step, i) => (
          <li key={i}>
            <span className="home-how__n num">{i + 1}</span>
            <div>
              <h3>
                <InlineText text={step.title} format="line" options={options} />
              </h3>
              <p>
                <InlineText text={step.body} format="paragraph" options={options} />
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
