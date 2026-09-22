/**
 * خواندن XML پاسخ‌های S3 — فقط به اندازه‌ای که لازم داریم.
 *
 * پاسخ‌هایی که می‌خوانیم کوچک، تخت و شناخته‌شده‌اند (`UploadId`، فهرست `Part`،
 * `Error`). یک پارسر کامل XML برای اینها وابستگی بیشتری است از ارزشی که دارد.
 * تنها جای حساس، entityهاست: AWS مقدار ETag را `&quot;…&quot;` می‌نویسد.
 */

const ENTITIES: Record<string, string> = {
  '&quot;': '"',
  '&apos;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
};

export function decodeXml(value: string): string {
  return value.replace(/&(?:quot|apos|lt|gt|amp);|&#(\d+);|&#x([0-9a-fA-F]+);/g, (m, dec, hex) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return ENTITIES[m]!;
  });
}

/** متن همهٔ عنصرهای `<tag>` در سطح هر عمقی. */
export function allTags(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  return [...xml.matchAll(pattern)].map((m) => m[1]!);
}

export function firstTag(xml: string, tag: string): string | undefined {
  const value = allTags(xml, tag)[0];
  return value === undefined ? undefined : decodeXml(value.trim());
}

/** اگر بدنه خطای S3 باشد، کد و پیامش. */
export function parseS3Error(xml: string): { code: string; message: string } | null {
  const error = allTags(xml, 'Error')[0];
  if (error === undefined) return null;
  return {
    code: firstTag(error, 'Code') ?? 'Unknown',
    message: firstTag(error, 'Message') ?? '',
  };
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
