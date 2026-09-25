/**
 * سیستم طراحی جزوه‌یار (ADR-031). بیشترش CSS است: `@jozveyar/ui/styles.css` توکن‌ها، پایه،
 * اجزا و آیکون‌ها را می‌دهد و اپ بعد از `@import 'tailwindcss'` واردش می‌کند. اینجا فقط
 * کامپوننت‌های سرورند؛ هیچ کامپوننت کلاینتی در این بسته نیست.
 */
export { Logo, Mark } from './brand.js';
export { BAND_COLOR, LOGO_BOX, LOGO_MIN_HEIGHT, MARK_BOX, MARK_MIN_HEIGHT } from './tokens.js';
