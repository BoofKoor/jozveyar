# منبع دادهٔ شهرها و مختصاتشان

`src/data.ts` از دو بستهٔ باز npm ساخته شده (`scripts/import-cities.mjs`). املای چند نام اصلاح شده
و ردیف‌های غیرشهر حذف شده‌اند؛ فهرست اصلاح‌ها در خود اسکریپت است. مجوز هر دو MIT است و متنش
اینجا می‌آید، چون MIT می‌خواهد در هر نسخه‌ای از بخش قابل‌توجه داده بماند.

## iran-cities-json 2.0.0

https://github.com/jd1378/iran-cities-json — منبع اصلی: ۳۱ استان و ۱۳۲۴ شهر.

```
MIT License

Copyright (c) 2020 jd1378

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## iran 1.0.2

https://github.com/arastu/iran — فهرست وزارت کشور (۱۳۹۴). چهار شهری که در منبع اصلی نیستند (سگزی،
کوخرد، گردکشانه، تازه‌کند) از این‌جاست، و بقیه‌اش برای سنجیدن منبع اصلی خوانده شد. `package.json`
بسته مجوز را MIT اعلام کرده و فایل مجوز جدا ندارد.

## مختصات شهرها: GeoNames (CC BY 4.0)

`src/coords.ts` (برش ۱۰٫۱، ADR-060) از **GeoNames** است — https://www.geonames.org — با مجوز Creative Commons Attribution 4.0
(https://creativecommons.org/licenses/by/4.0/). تغییرها: مختصات هر شهر فهرست ما با نام فارسی و استانش به یک آبادی GeoNames وصل
و به چهار رقم اعشار گرد شده؛ ۲۳ تطبیق دستی است و ۱۸۱ شهر کوچک بی مختصات مانده‌اند. قاعده‌ها و تصمیم‌ها در
`scripts/import-coords.py`.

سایت GeoNames از محیط ساختن باز نبود، پس دادهٔ آن از دو بستهٔ عمومی آمد که خود دادهٔ GeoNames را دارند؛ از هیچ‌کدام کدی برداشته
نشده، فقط مقدار مختصاتی که مال GeoNames است:

- **geonamescache 3.0.2** (PyPI، https://github.com/yaph/geonamescache): پروندهٔ `cities500.json`، همهٔ آبادی‌های بالای ۵۰۰ نفر با
  نام‌های فارسی خود GeoNames. خود بسته MIT است (Copyright (C) 2021 by Ramiro Gómez).
- **@code-plate/iran-cities 1.2.0** (npm، https://github.com/MJavadSF/Iran-Cities): مختصاتی که از `IR.zip` کامل GeoNames برای
  شهرهای خودش برداشته (به گفتهٔ NOTICE همان بسته، مقدارها همان GeoNames‌اند). `package.json` بسته مجوز را MIT اعلام کرده و فایل
  مجوز جدا ندارد.

۷۶۷ شهر در هر دو منبع تا ۱۰ کیلومتر یکی‌اند؛ هر جا با هم نخواندند، تصمیم با دلیلش در همان اسکریپت است.
