/** نوع‌های سرور ساختگی sms.ir (`smsir.mjs`) برای تست‌های TypeScript. */

import type { Server } from 'node:http';

export interface MockParameter {
  name: string;
  value: string;
}

export interface MockMessage {
  id: number;
  mobile: string;
  templateId: number;
  parameters: MockParameter[];
  cost: number;
  at: string;
}

export interface MockFailure {
  http: number;
  status?: number;
  times: number;
}

export interface MockConfig {
  keys?: string[];
  templates?: Record<string, string[]>;
  credit?: number;
  cost?: number;
  fail?: MockFailure | null;
  delayMs?: number;
  drop?: number;
}

export interface SmsIrMock {
  state: {
    keys: Set<string>;
    templates: Map<number, string[]>;
    credit: number;
    cost: number;
    fail: MockFailure | null;
    delayMs: number;
    drop: number;
    messages: MockMessage[];
    nextId: number;
  };
  configure(config: MockConfig): void;
  server: Server;
  listen(port?: number): Promise<string>;
  close(): Promise<void>;
}

export function createSmsIrMock(initial?: MockConfig): SmsIrMock;
