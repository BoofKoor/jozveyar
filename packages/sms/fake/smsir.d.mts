/** نوع‌های سرور ساختگی sms.ir (`smsir.mjs`). */

export type FakeMode = 'ok' | 'down' | 'limit' | 'hang';

export interface FakeMessage {
  id: number;
  mobile: string;
  templateId: number;
  parameters: { name: string; value: string }[];
  at: string;
}

export interface FakeSmsIrOptions {
  /** کلیدهای API پذیرفته. */
  keys?: readonly string[];
  /** شناسهٔ قالب به نام پارامترهایش. */
  templates?: Readonly<Record<string, readonly string[]>>;
  credit?: number;
  /** هزینهٔ هر پیامک. */
  cost?: number;
}

export interface FakeSmsIr {
  readonly state: { mode: FakeMode; credit: number; requests: number; messages: FakeMessage[] };
  readonly url: string;
  readonly messages: FakeMessage[];
  /** شمار درخواست‌های API (بی فرمان‌های تست). */
  readonly requests: number;
  configure(options: FakeSmsIrOptions): void;
  setMode(mode: FakeMode): void;
  reset(): void;
  listen(port?: number, host?: string): Promise<string>;
  close(): Promise<void>;
}

export function createFakeSmsIr(options?: FakeSmsIrOptions): FakeSmsIr;
