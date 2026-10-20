'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import type { SupportMessageRequest } from '@jozveyar/contracts/checkout';
import { formatNumber } from '@jozveyar/text';

import { MESSAGE_MAX, type MessageChoice, type ThreadStatus } from '../../lib/account';
import { accountApi } from '../../lib/account/api';

/** شناسهٔ تازهٔ هر فرم (هر فرم یک پیام، سؤال ۳۱۰): دو کلیک یا فرستادن دوباره پس از پاسخی که نرسید همان پیام است. */
const newRequestId = () => crypto.randomUUID();

type Problem = 'choice' | 'empty' | 'long' | 'rate' | 'open_threads' | 'stale' | 'no_orders' | 'not_found' | 'signed_out' | 'network' | 'failed';

function problemText(problem: Problem): ReactNode {
  switch (problem) {
    case 'choice':
      return 'یکی را انتخاب کن.';
    case 'empty':
      return 'پیامت خالی است.';
    case 'long':
      return (
        <>
          پیام حداکثر <span className="num">{formatNumber(MESSAGE_MAX)}</span> نویسه است.
        </>
      );
    case 'rate':
      return 'در یک ساعت گذشته پیام زیادی فرستادی؛ کمی بعد دوباره بفرست.';
    case 'open_threads':
      return 'سه گفت‌وگوی بی‌پاسخ داری. پیامت را در یکی از همان‌ها بنویس، یا صبر کن تا پاسخ بدهیم.';
    case 'stale':
      return 'این فرم پیش‌تر با متن دیگری فرستاده شد. صفحه را تازه کن و دوباره بنویس.';
    case 'no_orders':
      return (
        <>
          پیام فقط دربارهٔ سفارش‌هایی است که با این شماره ثبت شده؛ پرسش پیش از سفارش را از{' '}
          <a className="jy-link" href="/contact">
            «تماس»
          </a>{' '}
          بپرس.
        </>
      );
    case 'not_found':
      return (
        <>
          این سفارش یا گفت‌وگو پیدا نشد؛ از{' '}
          <a className="jy-link" href="/orders">
            «سفارش‌های من»
          </a>{' '}
          دوباره شروع کن.
        </>
      );
    case 'signed_out':
      return (
        <>
          ورودت در این مرورگر تمام شده.{' '}
          <a className="jy-link" href="/orders">
            دوباره وارد شو
          </a>
          ؛ متن را پیش از آن جایی نگه دار.
        </>
      );
    case 'network':
      return 'ارتباط برقرار نشد. اینترنت را ببین و دوباره «فرستادن» را بزن.';
    case 'failed':
      return 'پیامت نرسید؛ چند لحظهٔ دیگر دوباره «فرستادن» را بزن.';
  }
}

const PROBLEMS: Record<string, Problem> = {
  message_empty: 'empty',
  message_too_long: 'long',
  message_rate: 'rate',
  open_threads: 'open_threads',
  stale_form: 'stale',
  no_orders: 'no_orders',
  not_found: 'not_found',
  auth_required: 'signed_out',
  network: 'network',
};

type Props =
  | {
      /** «پیام تازه»: «دربارهٔ کدام سفارش؟» با سه سفارش آخر و «سؤال کلی» (سؤال ۳۰۹). */
      mode: 'new';
      choices: MessageChoice[];
      selected: string;
    }
  | {
      /** پیام در گفت‌وگویی که هست؛ برچسب فیلد از حال گفت‌وگو (طرح «پیام رفت»، «پاسخ آمد» و «گفت‌وگوی بسته»). */
      mode: 'thread';
      threadId: number;
      status: ThreadStatus;
    };

const THREAD_LABELS: Record<ThreadStatus, string> = { open: 'چیزی جا ماند؟', answered: 'پاسخ تو', closed: 'پیامت' };

/**
 * فرم پیام به پشتیبانی (برش ۱۲٫۱، ADR-068؛ طرح `account.html`، «پیام تازه» و «پیام رفت»): متن تا ۱٬۰۰۰ نویسه (سؤال ۳۱۰)، بی پیوست. جزیرهٔ
 * کلاینت کوچکی در صفحهٔ سرور: پیام تازه به گفت‌وگویش می‌رود (`?sent=1`، «پیامت رسید»)، و پیام درون گفت‌وگو صفحه را از نو می‌آورد. متن تا
 * رسیدن در فیلد می‌ماند.
 */
export function MessageForm(props: Props) {
  const router = useRouter();
  const [requestId, setRequestId] = useState(newRequestId);
  const [choice, setChoice] = useState(props.mode === 'new' ? props.selected : '');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const fieldId = props.mode === 'new' ? 'ac-text' : 'ac-more';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (props.mode === 'new' && choice === '') {
      setProblem('choice');
      return;
    }
    if (body.trim() === '') {
      setProblem('empty');
      return;
    }
    const to: SupportMessageRequest['to'] =
      props.mode === 'thread'
        ? { kind: 'thread', id: props.threadId }
        : choice === 'general'
          ? { kind: 'general' }
          : { kind: 'order', number: Number(choice) };
    setBusy(true);
    setProblem(null);
    const result = await accountApi(window.fetch.bind(window)).message({ requestId, body, to });
    if (result.ok) {
      if (props.mode === 'new') {
        router.push(`/orders/messages/${result.value.threadId}?sent=1`);
        return;
      }
      setBody('');
      setRequestId(newRequestId());
      setBusy(false);
      router.refresh();
      return;
    }
    setBusy(false);
    setProblem(PROBLEMS[result.error] ?? 'failed');
  }

  const fieldProblem = problem === 'empty' || problem === 'long';
  const note = problem && problem !== 'choice' && !fieldProblem;

  return (
    <form className={props.mode === 'new' ? 'ck-form' : 'ac-compose'} noValidate onSubmit={(event) => void submit(event)} data-testid="message-form">
      {props.mode === 'thread' && props.status === 'closed' ? (
        <p className="jy-note jy-note--info" data-testid="account-closed-note">
          <span className="jy-icon jy-icon-info" aria-hidden="true" />
          <span>این گفت‌وگو بسته شده. هنوز سؤالی داری؟ بنویس؛ دوباره باز می‌شود.</span>
        </p>
      ) : null}
      {props.mode === 'new' ? (
        <fieldset className="ac-fs" aria-describedby={problem === 'choice' ? 'ac-about-error' : undefined}>
          <legend className="jy-label">دربارهٔ کدام سفارش؟</legend>
          <div className="jy-tiles">
            {props.choices.map((option) => (
              <label key={option.value} className="jy-tile">
                <input
                  className="jy-radio"
                  type="radio"
                  name="ac-about"
                  value={option.value}
                  checked={choice === option.value}
                  onChange={() => {
                    setChoice(option.value);
                    if (problem === 'choice') setProblem(null);
                  }}
                />
                <span className="jy-tile__title">
                  {option.orderNumber === null ? (
                    'سؤال کلی'
                  ) : (
                    <>
                      سفارش <span className="num">{option.orderNumber}</span>
                    </>
                  )}
                </span>
                <span className="jy-tile__note">{option.note}</span>
              </label>
            ))}
          </div>
          {problem === 'choice' ? (
            <p id="ac-about-error" className="jy-error">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              <span>{problemText('choice')}</span>
            </p>
          ) : null}
        </fieldset>
      ) : null}
      <div className="jy-field">
        <label className="jy-label" htmlFor={fieldId}>
          {props.mode === 'new' ? 'پیامت' : THREAD_LABELS[props.status]}
        </label>
        <textarea
          id={fieldId}
          className="jy-input ac-text"
          rows={props.mode === 'new' ? 5 : 3}
          maxLength={MESSAGE_MAX}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            if (fieldProblem) setProblem(null);
          }}
          aria-invalid={fieldProblem ? true : undefined}
          aria-describedby={fieldProblem ? `${fieldId}-error ${fieldId}-hint` : `${fieldId}-hint`}
        />
        {fieldProblem ? (
          <p id={`${fieldId}-error`} className="jy-error">
            <span className="jy-icon jy-icon-error" aria-hidden="true" />
            <span>{problemText(problem)}</span>
          </p>
        ) : null}
        <p id={`${fieldId}-hint`} className="jy-hint">
          تا <span className="num">{formatNumber(MESSAGE_MAX)}</span> نویسه
          {props.mode === 'new'
            ? '. عکس و فایل فعلاً فرستاده نمی‌شود؛ اگر لازم شد، در پاسخ می‌گوییم چطور.'
            : props.status === 'closed'
              ? '.'
              : '؛ به همین گفت‌وگو می‌رود.'}
        </p>
      </div>
      {note ? (
        <div className="jy-note jy-note--error" role="alert" data-testid="message-failed">
          <span className="jy-icon jy-icon-error" aria-hidden="true" />
          <span>{problemText(problem)}</span>
        </div>
      ) : null}
      <button
        type="submit"
        className={`jy-btn ${props.mode === 'new' ? 'jy-btn--primary jy-btn--lg' : 'jy-btn--secondary'}${busy ? ' is-loading' : ''}`}
        disabled={busy}
        aria-busy={busy || undefined}
      >
        فرستادن
      </button>
    </form>
  );
}
