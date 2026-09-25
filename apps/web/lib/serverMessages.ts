/**
 * پیام شکست سرور و رد آپلود، برای کارت «جزوهٔ تو». جدا از `analysis-protocol.ts` است چون فقط رابط
 * پس از فایل آن را می‌خواهد، که با اولین فایل بار می‌شود (docs/UI.md، ۴ب)؛ صف و کارگر فقط پیام‌های
 * خطای خود فایل (`ERROR_MESSAGES`) را لازم دارند.
 */

import { ERROR_MESSAGES, type FileKind } from './analysis-protocol';

/**
 * پیام شکست تحلیل یا تبدیل **سرور** (کدهای کارگر، ADR-028). سه کد اول همان
 * خطاهای فایل‌اند و همان پیام را می‌گیرند؛ بقیه یعنی سرور هم نتوانست — و
 * «آپلود کنید» دیگر راه جلو نیست. راه جلو تقریباً همیشه PDF است، که در مرورگر
 * خوانده می‌شود و به تبدیل سرور نیاز ندارد.
 */
export function serverFailureMessage(
  code: string | undefined,
  kind: FileKind | null = 'pdf',
): { title: string; hint: string } {
  if (code === 'password_protected' || code === 'corrupt_file' || code === 'no_pages') {
    return ERROR_MESSAGES[code];
  }
  const program = kind === 'slides' ? 'پاورپوینت' : 'Word';
  switch (code) {
    case 'convert_failed':
      return {
        title: `این فایل ${program} باز نشد`,
        hint: `فایل را یک بار در ${program} باز کن، با «Save As» خروجی PDF بگیر و همان PDF را بینداز.`,
      };
    case 'convert_timeout':
    case 'too_heavy':
      return {
        title: 'این فایل برای تبدیل روی سرور خیلی سنگین است',
        hint: `از خود ${program} خروجی PDF بگیر و همان را بینداز؛ PDF همین‌جا در مرورگر فوری خوانده می‌شود.`,
      };
    case 'unsupported_format':
      return {
        title: 'محتوای این فایل با پسوندش جور نیست',
        hint: 'فایل اصلی را بینداز، نه نسخه‌ای که پسوندش دستی عوض شده؛ یا از برنامه‌اش خروجی PDF بگیر.',
      };
    case 'image_unreadable':
      return {
        title: 'این عکس باز نشد',
        hint: 'عکس ممکن است ناقص رسیده باشد. یک بار دیگر از گالری انتخابش کن و بینداز.',
      };
    case 'image_too_large':
      return {
        title: 'این عکس خیلی بزرگ است',
        hint: 'عکس را با وضوح کمتر (مثلاً 12 مگاپیکسل) ذخیره کن و دوباره بینداز.',
      };
    default:
      return {
        title: 'این فایل خوانده نشد',
        hint: 'از برنامه‌ای که جزوه را با آن ساختی یک بار دیگر خروجی PDF بگیر و همان را بینداز. اگر فایل اسکن است، با کیفیت کمتری اسکن کن.',
      };
  }
}

/**
 * سرور آپلود را نپذیرفت (`reason` همان کد خطای API است). فقط دو دلیل به فایل
 * برمی‌گردد؛ بقیه (استوریج نیست، دیسک پر، شبکه) گذرا است.
 */
export function uploadRefusalMessage(reason: string | undefined): string {
  if (reason === 'unsupported_type') return ERROR_MESSAGES.unsupported_type.hint;
  if (reason === 'too_large') {
    return 'این فایل از سقف حجمی که می‌گیریم بزرگ‌تر است. از برنامه‌اش خروجی PDF با کیفیت کمتر بگیر و همان را بینداز.';
  }
  return 'الان نمی‌توانیم این فایل را بگیریم. چند دقیقهٔ دیگر دوباره بینداز؛ یا اگر فایل کوچک‌تری از همین جزوه داری، همان را امتحان کن.';
}

/**
 * همان رد آپلود، برای یک فایل از جزوهٔ چندفایلی: عنوان کوتاه و راه جلو. «دوباره
 * بینداز» اینجا یعنی «جایگزین کن» — همان فایل همان‌جای جزوه دوباره می‌رود.
 */
export function uploadRefusal(reason: string | undefined): { title: string; hint: string } {
  if (reason === 'unsupported_type') return ERROR_MESSAGES.unsupported_type;
  if (reason === 'too_large') {
    return {
      title: 'این فایل از سقف حجم بزرگ‌تر است',
      hint: 'از برنامه‌اش خروجی PDF با کیفیت کمتر بگیر و با «جایگزین کن» جای همین بگذار.',
    };
  }
  return {
    title: 'الان نمی‌توانیم این فایل را بگیریم',
    hint: 'چند دقیقهٔ دیگر با «جایگزین کن» همین فایل را دوباره بگذار؛ یا اگر PDF همین را داری، همان را.',
  };
}
