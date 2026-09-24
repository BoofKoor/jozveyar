/**
 * فایل SVG وارد‌شده. در Next شیء تصویر ایستا با `src` است و در vitest خود نشانی؛ brand.tsx
 * هر دو را می‌فهمد. در اپ، تعریف خود Next (`next/image-types/global`) جای این را می‌گیرد.
 */
declare module '*.svg' {
  const asset: string | { src: string };
  export default asset;
}
