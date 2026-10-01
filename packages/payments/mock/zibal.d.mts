/** نوع‌های سرور ساختگی زیبال (`zibal.mjs`) برای تست‌های TypeScript. */

import type { Server } from 'node:http';

export interface MockTransaction {
  trackId: number;
  merchant: string;
  amount: number;
  orderId: string | null;
  description: string | null;
  callbackUrl: string;
  status: number;
  createdAt: string;
  paidAt: string | null;
  verifiedAt: string | null;
  refNumber: number | null;
  cardNumber: string | null;
}

export interface MockFailure {
  http?: number;
  result?: number;
  times: number;
  /** فقط همین مسیر (`/v1/verify`…)؛ بی آن هر درخواست API. */
  path?: string;
}

export interface MockConfig {
  merchants?: string[];
  maxAmount?: number;
  /** میزبانی که Referer صفحهٔ پرداخت باید داشته باشد؛ null یعنی هر Referer، ولی بی Referer نه. */
  referer?: string | null;
  ipRejected?: boolean;
  /** فیلدهایی که پاسخ استعلام نمی‌آورد. */
  omit?: string[];
  fail?: MockFailure | null;
  delayMs?: number;
  drop?: number;
  reverseAfterMs?: number | null;
}

export interface ZibalMock {
  state: {
    merchants: Set<string>;
    maxAmount: number;
    referer: string | null;
    ipRejected: boolean;
    omit: string[];
    fail: MockFailure | null;
    delayMs: number;
    drop: number;
    reverseAfterMs: number | null;
    transactions: Map<number, MockTransaction>;
    nextTrackId: number;
    nextRef: number;
  };
  configure(config: MockConfig): void;
  server: Server;
  listen(port?: number): Promise<string>;
  close(): Promise<void>;
}

export function createZibalMock(initial?: MockConfig): ZibalMock;
