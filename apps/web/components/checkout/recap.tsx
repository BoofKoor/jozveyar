import { Fragment, type ReactNode } from 'react';
import { formatNumber } from '@jozveyar/text';

/*
 * تکه‌های مرور مسیر خرید و صفحهٔ سفارش (طرح `docs/ui/mockups/checkout.html`، چیدمان در app/checkout.css): جزوه در
 * سر خلاصه، و ردیف‌های مرور. مثل `parts.tsx` نه hook دارند و نه API مرورگر؛ جدا از آن‌اند تا در تکهٔ «جزوه و
 * قیمت» نیایند.
 */

/** برگهٔ عمومی کارت «جزوهٔ تو»، کوچک‌تر (۳۰×۴۰)؛ فایل ایستا، نه SVG درون JSX. */
function Thumb() {
  return <img src="/img/page.svg" alt="" width={48} height={64} />;
}

export interface BriefFile {
  name: string;
  pageCount: number;
}

/** «1»، «ریاضی ۲ - جلسه ۱.pdf»، «48 صفحه»: فهرست شماره‌دار فایل‌های جزوه. */
export function FileList({ files }: { files: readonly BriefFile[] }) {
  return (
    <ol className="ck-files">
      {files.map((file, i) => (
        <li key={`${i}-${file.name}`}>
          <span className="ck-files__n num">{formatNumber(i + 1)}</span>
          <span className="ck-files__name" dir="auto" title={file.name}>
            {file.name}
          </span>
          <span className="ck-files__pages">
            <span className="num">{formatNumber(file.pageCount)}</span> صفحه
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * جزوه در سر خلاصهٔ سفارش: یک فایل با نام و «120 صفحه · A4»؛ چند فایل با «3 فایل در یک جزوه»، «120 صفحه · یک
 * صحافی» و نام فایل‌ها در `details`. کارت «جزوهٔ تو» در این قدم‌ها روی صفحه نیست، پس جزوه همین‌جا می‌ماند.
 */
export function JozveBrief({ files, pageCount, meta }: { files: readonly BriefFile[]; pageCount: number; meta?: ReactNode }) {
  const pages = (
    <>
      <span className="num">{formatNumber(pageCount)}</span> صفحه
    </>
  );
  if (files.length === 1) {
    return (
      <div className="ck-sum-jozve">
        <div className="ck-file">
          <Thumb />
          <div className="ck-file__body">
            <p className="ck-file__name" dir="auto" title={files[0]!.name}>
              {files[0]!.name}
            </p>
            <p className="ck-file__meta">{meta ?? pages}</p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="ck-sum-jozve">
      <div className="ck-file">
        <Thumb />
        <div className="ck-file__body">
          <p className="ck-file__name">
            <span className="num">{formatNumber(files.length)}</span> فایل در یک جزوه
          </p>
          <p className="ck-file__meta">{pages} · یک صحافی</p>
          <details className="ck-files-d">
            <summary>
              نام فایل‌ها
              <span className="jy-icon jy-icon-chevron" aria-hidden="true" />
            </summary>
            <FileList files={files} />
          </details>
        </div>
      </div>
    </div>
  );
}

/** تکه‌های خط اطلاعات که فقط بعد از «·» می‌شکنند (مثل `FileInfo` کارت «جزوهٔ تو»). */
export function Pieces({ parts }: { parts: readonly ReactNode[] }) {
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i === 0 ? null : ' · '}
      <span className="nw">{part}</span>
    </Fragment>
  ));
}

export interface RecapJozve {
  files: readonly BriefFile[];
  pageCount: number;
  print: string;
  bindingName: string;
  copies: number;
}

/** ردیف «جزوه» مرور: فایل یا فهرست فایل‌ها، و «120 صفحه · سیاه‌سفید، دورو · طلق و سیم · 1 نسخه». */
export function RecapJozveValue({ jozve }: { jozve: RecapJozve }) {
  const tail = [
    jozve.print,
    jozve.bindingName,
    <>
      <span className="num">{formatNumber(jozve.copies)}</span> نسخه
    </>,
  ];
  if (jozve.files.length === 1) {
    return (
      <div className="ck-file">
        <Thumb />
        <div className="ck-file__body">
          <p className="ck-file__name" dir="auto" title={jozve.files[0]!.name}>
            {jozve.files[0]!.name}
          </p>
          <p className="ck-file__meta">
            <Pieces
              parts={[
                <>
                  <span className="num">{formatNumber(jozve.pageCount)}</span> صفحه
                </>,
                ...tail,
              ]}
            />
          </p>
        </div>
      </div>
    );
  }
  return (
    <>
      <p className="ck-file__name">
        <span className="num">{formatNumber(jozve.files.length)}</span> فایل در یک جزوه
      </p>
      <FileList files={jozve.files} />
      <p className="ck-file__meta">
        <Pieces
          parts={[
            <>
              <span className="num">{formatNumber(jozve.pageCount)}</span> صفحه، پشت‌سرهم با یک صحافی
            </>,
            ...tail,
          ]}
        />
      </p>
    </>
  );
}

export interface RecapRow {
  label: string;
  value: ReactNode;
  /** «تغییر»، «ویرایش»، «عوض کن»؛ پس از ساخته شدن سفارش هیچ. */
  edit?: ReactNode;
  testId?: string;
}

/** مرور: هر ردیف برچسب، مقدار و پیوند ویرایشش. */
export function Recap({ rows }: { rows: readonly RecapRow[] }) {
  return (
    <dl className="ck-recap">
      {rows.map((row) => (
        <div key={row.label} data-testid={row.testId}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
          {row.edit ? <dd>{row.edit}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** «نشانی در مشهد»: شهر، یا استان وقتی شهر در فهرست نبود. */
export function placeName(place: { cityName: string | null; provinceName: string }) {
  return place.cityName ?? `استان ${place.provinceName}`;
}

/** مقدار ردیف «ارسال به»: نام، شهر و نشانی، و کد پستی اگر هست. */
export function RecapAddress({
  name,
  city,
  addressText,
  postalCode,
}: {
  name: string;
  city: string;
  addressText: string;
  postalCode: string | null;
}) {
  return (
    <>
      <p>{name}</p>
      <p>
        {city}، {addressText}
      </p>
      {postalCode ? (
        <p className="ck-recap__meta">
          کد پستی <span className="num">{postalCode}</span>
        </p>
      ) : null}
    </>
  );
}

/** مقدار ردیف «تحویل»: روش و تعهد تحویل به پست (ADR-013). */
export function RecapDelivery({ method, slaDays }: { method: string; slaDays: number }) {
  return (
    <>
      <p>{method}</p>
      <p className="ck-recap__meta">
        تحویل به پست تا <span className="num">{formatNumber(slaDays)}</span> روز کاری بعد از پرداخت؛ کد رهگیری به همین
        موبایل پیامک می‌شود.
      </p>
    </>
  );
}
