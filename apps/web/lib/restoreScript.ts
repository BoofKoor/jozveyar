import { DRAFT_KEY, RESTORING_ATTR } from './draftKey';

/**
 * پیش از رسم (۳د، ADR-036): اگر این زبانه پیش‌نویس سفارش دارد، صفحه از همان اولین رسم حالت سفارش است و کارت بارگذاری «در حال برگرداندن
 * جزوه…»، نه لحظه‌ای صفحهٔ اول. چند بایت درون HTML، نه در باندل؛ حافظهٔ بستهٔ سایت یعنی صفحهٔ معمول. صفحهٔ اصلی و از ۱۵٫۲ هر صفحهٔ فرود
 * (که همان میز را دارد) همین را دارند؛ فقط سرور.
 */
export const RESTORE_SCRIPT = `try{sessionStorage.getItem(${JSON.stringify(DRAFT_KEY)})&&document.documentElement.setAttribute(${JSON.stringify(RESTORING_ATTR)},'')}catch(e){}`;
