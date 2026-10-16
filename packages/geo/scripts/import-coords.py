"""
ساختن `src/coords.ts` (مختصات شهرها، برش ۱۰٫۱) از دادهٔ GeoNames — یک بار، نه در هر بیلد.

مثل `import-cities.mjs` از این به بعد منبع حقیقت خود `src/coords.ts` است؛ این اسکریپت فقط می‌گوید آن فایل از کجا و با چه
قاعده‌ها و تصمیم‌هایی آمد، تا هر کس بتواند دوباره بسازد و مقایسه کند. فقط کتابخانهٔ استاندارد؛ کد هیچ بسته‌ای اجرا نمی‌شود.

    mkdir x && cd x
    pip download geonamescache==3.0.2 --no-deps        # geonamescache-3.0.2-py3-none-any.whl
    npm pack @code-plate/iran-cities@1.2.0              # code-plate-iran-cities-1.2.0.tgz
    python3 -I packages/geo/scripts/import-coords.py x/geonamescache-3.0.2-py3-none-any.whl x/code-plate-iran-cities-1.2.0.tgz

هر دو منبع دادهٔ GeoNames‌اند (CC BY 4.0؛ مجوزها در NOTICE.md):

- **الف:** `cities500` بستهٔ `geonamescache` (همهٔ آبادی‌های بالای ۵۰۰ نفر)، با نام‌های فارسی خود GeoNames.
- **ب:** مختصاتی که `@code-plate/iran-cities` از `IR.zip` کامل GeoNames برای شهرهای خودش برداشته (سایت GeoNames از محیط
  ساختن باز نبود، پس `IR.zip` مستقیم خوانده نشد).

قاعده‌ها، به ترتیب، برای هر شهر `src/data.ts`:

1. نام فارسی‌نرمال (`norm`: ی و ک، بی اعراب، آ و همزه یکی، بی فاصله و نیم‌فاصله) در همان استان (کد استان GeoNames، `ADMIN`).
2. الف و ب هر دو هست و نزدیک‌ترین نامزد الف تا ۱۰ کیلومتری ب است: همان نامزد الف («هر دو»).
3. فقط الف، و فقط یک نامزد در استان: همان («الف»).
4. فقط ب: همان («ب»).
5. بقیه (دو منبع ناهمخوان، چند نامزد بی ب، یا هیچ): تصمیم دستی در `DECIDED`، یا بی مختصات. شهری که مختصات ندارد در تخصیص
   با مختصات مرکز استانش سنجیده می‌شود (`placePoint`)، نه با این فایل.

هر مختصات با چهار رقم اعشار (حدود ۱۱ متر) نوشته می‌شود و باید درون مرز تقریبی کشور باشد.
"""

import collections
import json
import math
import re
import sys
import tarfile
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA_TS = HERE.parent / 'src' / 'data.ts'
OUT_TS = HERE.parent / 'src' / 'coords.ts'

# شناسهٔ استان ما ← کد استان (admin1) GeoNames؛ از رأی اکثریت نام‌های یکتا، و همه با مرکز همان استان.
ADMIN = {
    1: '33', 2: '01', 3: '32', 4: '28', 5: '44', 6: '10', 7: '22', 8: '26', 9: '03', 10: '41', 11: '42', 12: '43', 13: '15', 14: '36',
    15: '25', 16: '04', 17: '07', 18: '38', 19: '39', 20: '16', 21: '29', 22: '13', 23: '05', 24: '37', 25: '08', 26: '23', 27: '35',
    28: '34', 29: '11', 30: '09', 31: '40',
}
# GeoNames چند شهر البرز را هنوز زیر استان پیشین (تهران) دارد.
LEGACY = {5: {'26'}}

# تصمیم‌های دستی: شناسهٔ شهر ← شناسهٔ GeoNames در الف، یا 'B' یعنی مختصات ب. هر کدام با دلیل.
DECIDED = {
    # دو منبع ناهمخوان
    1285: 'B',  # محمدآباد، اصفهان: جرقویه در شرق اصفهان؛ الف آبادی هم‌نامی نزدیک کاشان است
    1407: 'B',  # نصرآباد، اصفهان: جرقویه؛ الف «سفیدشهر» کاشان است
    1250: 125599,  # لطف‌آباد، خراسان رضوی: شهر مرزی درگز (گذرگاه لطف‌آباد)؛ ب آبادی هم‌نامی نزدیک نیشابور است
    1406: 'B',  # نصرآباد، خراسان رضوی: بخش نصرآباد تربت جام؛ الف آبادی هم‌نامی نزدیک کاشمر است
    1492: 'B',  # همت‌آباد، خراسان رضوی: ب با منبع مستقل تأیید شده؛ الف آبادی کنار مشهد است
    1322: 'B',  # مشکان، فارس: ب با منبع مستقل تأیید شده؛ الف آبادی هم‌نامی در مرودشت است
    # چند نامزد در استان، بی ب
    632: 137063,  # دهق، اصفهان: شهر ۸ هزارنفری، نه «دهق فریدن»
    1286: 1160239,  # محمدآباد، سیستان و بلوچستان: سیستان؛ «محمدان» ایرانشهر شهر جدای فهرست است
    221: 141833,  # بالاده، فارس: کوهمرهٔ کازرون، نه آبادی هم‌نام لامرد
    290: 13631698,  # بوانات، فارس: همان «بوانات»، نه سوریان
    966: 144038,  # علی‌آباد، گلستان: علی‌آباد کتول، مرکز شهرستان
    1016: 120695,  # قائم‌شهر، مازندران: خود شهر، نه ردیف تکراری بی جمعیت
    1177: 126962,  # کیاکلا، مازندران: سیمرغ کنار قائم‌شهر، نه آبادی هم‌نام غرب مازندران
    # بی تطبیق نام، پیدا شده با املای دیگر (فارسی یا لاتین)
    852: 418484,  # شاپورآباد ← شاهپورآباد، برخوار
    838: 113596,  # سیراف ← بندر سیرف
    202: 1112446,  # باخرز ← شهرک باخرز
    1205: 7082152,  # گلبهار ← شهرک گلبهار
    1153: 126082,  # کوت عبداله ← کوت عبدالله
    983: 418850,  # فرادبنه ← فرادنبه، بروجن
    490: 139719,  # چهاربرج ← Chahār Borj، میاندوآب
    1295: 26652,  # محمودآباد، آذربایجان غربی ← Maḩmūdābād، شاهین‌دژ
    478: 6648117,  # چمران، خوزستان ← Chamrān
    891: 140982,  # شهباز، مرکزی ← Shahbāz
}

AR = re.compile(r'[؀-ۿ]')


def norm(s: str) -> str:
    s = s.replace('ي', 'ی').replace('ك', 'ک').replace('ى', 'ی')
    s = re.sub(r'[ً-ْٰـ]', '', s)
    for a, b in (('ة', 'ه'), ('ۀ', 'ه'), ('أ', 'ا'), ('إ', 'ا'), ('آ', 'ا'), ('ؤ', 'و'), ('ئ', 'ی'), ('ء', '')):
        s = s.replace(a, b)
    return re.sub(r'[\s‌‍‎‏()\-]', '', s)


def km(a, b) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def our_cities():
    src = DATA_TS.read_text(encoding='utf-8')
    provinces = {int(m[1]): m[2] for m in re.finditer(r"\[(\d+), '([^']+)', '(?:tehran|other)', \d+\]", src)}
    cities = [(int(m[1]), int(m[2]), m[3]) for m in re.finditer(r"\[(\d+), (\d+), '([^']+)'\]", src)]
    return provinces, cities


def source_a(wheel: str):
    data = json.loads(zipfile.ZipFile(wheel).read('geonamescache/data/cities500.json'))
    geo = [c for c in data.values() if c['countrycode'] == 'IR']
    by_name, by_id = collections.defaultdict(list), {}
    for g in geo:
        by_id[g['geonameid']] = g
        for n in {norm(n) for n in g['alternatenames'] if AR.search(n)}:
            by_name[n].append(g)
    return by_name, by_id


def source_b(tgz: str):
    """آرایهٔ لفظی `data_default` در `dist/index.mjs`، خوانده بی اجرای JS: کلیدهای بی‌نقل‌قول نقل‌قول می‌گیرند و بقیه JSON است."""
    with tarfile.open(tgz) as tar:
        s = tar.extractfile('package/dist/index.mjs').read().decode('utf-8')
    start = s.index('var data_default = ') + len('var data_default = ')
    depth, i = 0, start
    while True:
        ch = s[i]
        if ch == '[':
            depth += 1
        elif ch == ']':
            depth -= 1
            if depth == 0:
                break
        elif ch == '"':
            i += 1
            while s[i] != '"':
                i += 2 if s[i] == '\\' else 1
        i += 1
    lit = re.sub(r'(?m)^(\s*)([A-Za-z_][A-Za-z0-9_]*):', r'\1"\2":', s[start:i + 1])
    rows = collections.defaultdict(list)
    for province in json.loads(lit):
        for c in province['cities']:
            rows[(norm(province['province-fa']), norm(c['city-fa']))].append(c)
    return rows


def main(wheel: str, tgz: str) -> None:
    provinces, cities = our_cities()
    by_name, by_id = source_a(wheel)
    b_rows = source_b(tgz)
    picked, kinds = {}, collections.Counter()
    for cid, pid, name in cities:
        admins = {ADMIN[pid]} | LEGACY.get(pid, set())
        a = [g for g in by_name.get(norm(name), []) if g['admin1code'] in admins]
        bs = [c for c in b_rows.get((norm(provinces[pid]), norm(name)), []) if 'lat' in c]
        b = bs[0] if len(bs) == 1 else None
        decided = DECIDED.get(cid)
        if decided == 'B':
            assert b, name
            picked[cid], kind = (b['lat'], b['lng']), 'دستی ب'
        elif decided is not None:
            g = by_id[decided]
            picked[cid], kind = (g['latitude'], g['longitude']), 'دستی الف'
        elif a and b:
            best = min(a, key=lambda g: km((g['latitude'], g['longitude']), (b['lat'], b['lng'])))
            if km((best['latitude'], best['longitude']), (b['lat'], b['lng'])) < 10:
                picked[cid], kind = (best['latitude'], best['longitude']), 'هر دو'
            else:
                kind = 'ناهمخوان'
        elif len(a) == 1:
            picked[cid], kind = (a[0]['latitude'], a[0]['longitude']), 'الف'
        elif a:
            kind = 'چند نامزد'
        elif b:
            picked[cid], kind = (b['lat'], b['lng']), 'ب'
        else:
            kind = 'هیچ'
        kinds[kind] += 1
    for cid, (lat, lon) in picked.items():
        assert 25 <= lat <= 40 and 44 <= lon <= 63.5, cid
    for cid, pid, name in cities:
        if cid not in picked and (DECIDED.get(cid) is not None):
            raise SystemExit(f'تصمیم دستی بی نتیجه: {name}')
    rows = '\n'.join(f'  [{cid}, {lat:.4f}, {lon:.4f}],' for cid, (lat, lon) in sorted(picked.items()))
    OUT_TS.write_text(
        f"""/**
 * مختصات شهرها (برش ۱۰٫۱، ADR-060) — داده، نه کد: [شناسهٔ شهر، عرض، طول]، درجه، چهار رقم اعشار. فقط برای تخصیص چاپخانه با
 * فاصله در سرور؛ مرورگر نمی‌خواندش (زیرمسیر جدای `@jozveyar/geo/coords`، تا تکهٔ مسیر خرید سنگین نشود).
 *
 * از GeoNames (https://www.geonames.org، CC BY 4.0)، ساخته‌شده با `scripts/import-coords.py`؛ قاعده‌ها و تصمیم‌های دستی همان‌جا و
 * مجوز در NOTICE.md. {len(picked)} شهر از {len(cities)}؛ شهری که اینجا نیست (یا سفارشی که شهر ندارد) با مرکز استانش سنجیده می‌شود
 * (`placePoint`). شهر تازه‌ای که به `data.ts` می‌آید مختصاتش را همین‌جا می‌گیرد، با منبعش در NOTICE.md.
 */

export const CITY_COORDS: readonly (readonly [number, number, number])[] = [
{rows}
];
""",
        encoding='utf-8',
    )
    print(dict(kinds), f'— {len(picked)} از {len(cities)}', file=sys.stderr)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('wheel بستهٔ geonamescache 3.0.2 و tgz بستهٔ @code-plate/iran-cities 1.2.0 را بدهید.')
    main(sys.argv[1], sys.argv[2])
