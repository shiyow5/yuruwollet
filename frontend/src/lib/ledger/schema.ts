import { z } from 'zod';
import { parseAmount } from '../format';
import type { TransactionDraft, CategoryDraft } from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 検証後の取引ドラフトのスキーマ（型付き値に対する制約）。 */
export const transactionDraftSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount: z
    .number()
    .int('金額は整数で入力してください')
    .positive('金額は1円以上で入力してください'),
  categoryId: z.string().uuid('カテゴリが正しくありません').nullable(),
  occurredOn: z.string().regex(ISO_DATE, '日付が正しくありません'),
  memo: z.string().max(200, 'メモは200文字以内で入力してください'),
});

/** 検証後のカテゴリドラフトのスキーマ。 */
export const categoryDraftSchema = z.object({
  kind: z.enum(['income', 'expense']),
  name: z.string().trim().min(1, 'カテゴリ名を入力してください').max(20, 'カテゴリ名は20文字以内です'),
  icon: z.string().trim().max(40).default('label'),
});

/** フォームの生入力（すべて文字列。UI から渡る） */
export interface RawTransactionForm {
  type: string;
  amount: string;
  /** '' は未選択（カテゴリなし） */
  categoryId: string;
  occurredOn: string;
  memo: string;
}

export interface RawCategoryForm {
  kind: string;
  name: string;
  icon?: string;
}

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldErrors<T> };

function collectErrors<T>(issues: z.ZodIssue[]): FieldErrors<T> {
  const errors: FieldErrors<T> = {};
  for (const issue of issues) {
    const key = issue.path[0] as keyof T;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/**
 * 取引フォームの生入力を検証し、正規化済みドラフトにする。
 * 金額は parseAmount で数値化（無効なら専用メッセージ）。categoryId '' は null に。
 */
export function validateTransactionForm(
  raw: RawTransactionForm,
): ValidationResult<TransactionDraft> {
  const amount = parseAmount(raw.amount);
  if (Number.isNaN(amount)) {
    return { ok: false, errors: { amount: '金額を入力してください' } };
  }
  const candidate = {
    type: raw.type,
    amount,
    categoryId: raw.categoryId === '' ? null : raw.categoryId,
    occurredOn: raw.occurredOn,
    memo: raw.memo ?? '',
  };
  const result = transactionDraftSchema.safeParse(candidate);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, errors: collectErrors<TransactionDraft>(result.error.issues) };
}

/** カテゴリフォームの生入力を検証し、正規化済みドラフトにする。 */
export function validateCategoryForm(raw: RawCategoryForm): ValidationResult<CategoryDraft> {
  const candidate = {
    kind: raw.kind,
    name: raw.name,
    icon: raw.icon && raw.icon.trim() !== '' ? raw.icon : undefined,
  };
  const result = categoryDraftSchema.safeParse(candidate);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, errors: collectErrors<CategoryDraft>(result.error.issues) };
}
