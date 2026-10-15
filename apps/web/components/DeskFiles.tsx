'use client';

import { createContext, useContext } from 'react';
import { DEFAULT_FILE_RULES, type FileRules } from '@jozveyar/contracts/constants';

import { acceptOf } from '../lib/fileRules';

/**
 * قاعده‌های فایل همین صفحه در رابط پس از فایل (برش ۸٫۴): `accept` هر فایل‌گزین (افزودن، جایگزین) و سقف‌ها برای متن پیام‌ها.
 * `OrderDesk` و برگرداندن فراهمش می‌کنند؛ بی آن پیش‌فرض‌ها.
 */
export interface DeskFiles {
  rules: FileRules;
  accept: string;
}

export const DeskFilesContext = createContext<DeskFiles>({ rules: DEFAULT_FILE_RULES, accept: acceptOf(DEFAULT_FILE_RULES.formats) });

export function useDeskFiles(): DeskFiles {
  return useContext(DeskFilesContext);
}
