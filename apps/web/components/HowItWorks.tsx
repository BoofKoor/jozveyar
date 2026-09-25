/**
 * «سه قدم تا جزوهٔ چاپ‌شده»، مقصد «چطور کار می‌کند» در سربرگ؛ از طرح ز (docs/UI.md، ۴الف).
 * کامپوننت سرور. رقم دایره‌ها با `--jy-digit-rise` دقیق وسط است (home.css، و tests/digits.spec.ts).
 */
export function HowItWorks() {
  return (
    <section id="how" className="home-sec" aria-labelledby="how-title">
      <h2 id="how-title" className="home-sec__title">
        سه قدم تا جزوهٔ چاپ‌شده
      </h2>
      <ol className="home-how">
        <li>
          <span className="home-how__n num">1</span>
          <div>
            <h3>فایل را بینداز</h3>
            <p>
              <bdi>PDF</bdi>، <bdi>Word</bdi>، پاورپوینت یا عکس؛ چند فایل هم در یک جزوه، به همان ترتیبی که می‌خواهی.
            </p>
          </div>
        </li>
        <li>
          <span className="home-how__n num">2</span>
          <div>
            <h3>قیمت را همان لحظه ببین</h3>
            <p>صفحه‌ها و صفحه‌های رنگی را خودمان می‌شماریم. رنگ، دورو و تعداد را خودت انتخاب می‌کنی.</p>
          </div>
        </li>
        <li>
          <span className="home-how__n num">3</span>
          <div>
            <h3>آدرس بده و پرداخت کن</h3>
            <p>
              شمارهٔ موبایل فقط همین‌جا لازم است. تا <span className="num">2</span> روز کاری بعد، جزوه تحویل پست
              می‌شود.
            </p>
          </div>
        </li>
      </ol>
    </section>
  );
}
