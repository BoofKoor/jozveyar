/**
 * ارتفاع نوار قیمت را در `--price-dock` روی پاورقی سایت می‌گذارد. در موبایل نوار ثابت پایین صفحه
 * است و ته صفحه را می‌پوشاند؛ پاورقی (کامپوننت سرور، بی JS) همین‌قدر پایینش خالی می‌گذارد
 * (globals.css). ارتفاع با عرض و شکستن خط‌ها عوض می‌شود، پس اندازه گرفته می‌شود نه حدس زده. در
 * دسکتاپ نوار پنهان است و ارتفاعش صفر. React 19 پاک‌سازیِ ref را موقع برداشتن نوار اجرا می‌کند.
 *
 * روی خود پاورقی، نه `<html>`: متغیر ارث می‌رسد، پس عوض کردنش روی ریشه سبک کل صفحه را دوباره
 * حساب می‌کرد؛ با پردازندهٔ ۴ برابر کند، قیمت سه‌فایلی حدود ۲۵ میلی‌ثانیه دیرتر می‌آمد.
 *
 * نوار «جزوه و قیمت»، نوار قدم‌های خرید و نوار صفحهٔ سفارش همه همین را به‌عنوان `ref` می‌گیرند.
 */
export function publishDockHeight(dock: HTMLDivElement | null) {
  if (!dock || typeof ResizeObserver === 'undefined') return;
  const footer = document.querySelector<HTMLElement>('body > footer');
  if (!footer) return;
  const observer = new ResizeObserver(() => footer.style.setProperty('--price-dock', `${dock.offsetHeight}px`));
  observer.observe(dock);
  return () => {
    observer.disconnect();
    footer.style.removeProperty('--price-dock');
  };
}
