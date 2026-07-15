import { z } from 'zod';
import { parseAmount, jstToday } from '../format';
import type { SubscriptionDraft } from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 次回更新日の下限（含む）。1 周期より前には設定できない。
 *
 * 大きく過去（例: 1900-01-01）を選ぶと、その周期ぶん台帳に取引が作られ、
 * subscription_id 付きのためユーザーが個別に消せなくなる（#65）。DB 側の
 * guard_renewal_floor トリガと同じ規則（今日から monthly=1 ヶ月 / yearly=1 年）。
 */
export function renewalFloorIso(cycle: 'monthly' | 'yearly', todayIso: string): string {
  const [y, m, d] = todayIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (cycle === 'yearly') dt.setUTCFullYear(dt.getUTCFullYear() - 1);
  else dt.setUTCMonth(dt.getUTCMonth() - 1);
  return dt.toISOString().slice(0, 10);
}

/** numeric(12,2) 列に合わせ、小数第2位までの通貨額か判定する。 */
function hasAtMostTwoDecimals(v: number): boolean {
  return Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
}

export const subscriptionDraftSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'サービス名を入力してください')
    .max(40, 'サービス名は40文字以内です'),
  currency: z.enum(['JPY', 'USD']),
  originalAmount: z
    .number()
    .positive('金額は0より大きい値を入力してください')
    .refine(hasAtMostTwoDecimals, '金額は小数第2位までで入力してください'),
  cycle: z.enum(['monthly', 'yearly']),
  nextRenewalDate: z.string().regex(ISO_DATE, '次回更新日が正しくありません'),
  status: z.enum(['active', 'trial', 'considering_cancel']),
});

export interface RawSubscriptionForm {
  name: string;
  currency: string;
  amount: string;
  cycle: string;
  nextRenewalDate: string;
  status: string;
}

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors<T> };

function collectErrors<T>(issues: z.ZodIssue[]): FieldErrors<T> {
  const errors: FieldErrors<T> = {};
  for (const issue of issues) {
    const key = issue.path[0] as keyof T;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/** サブスクフォームの生入力を検証し、正規化済みドラフトにする。 */
export function validateSubscriptionForm(
  raw: RawSubscriptionForm,
  today: string = jstToday(),
): ValidationResult<SubscriptionDraft> {
  const amount = parseAmount(raw.amount);
  if (Number.isNaN(amount)) {
    return { ok: false, errors: { originalAmount: '金額を入力してください' } };
  }
  const candidate = {
    name: raw.name,
    currency: raw.currency,
    originalAmount: amount,
    cycle: raw.cycle,
    nextRenewalDate: raw.nextRenewalDate,
    status: raw.status,
  };
  const result = subscriptionDraftSchema.safeParse(candidate);
  if (!result.success) {
    return { ok: false, errors: collectErrors<SubscriptionDraft>(result.error.issues) };
  }

  // 形式が正しくても、大きく過去の更新日は精算ループを暴走させる（#65）。
  const floor = renewalFloorIso(result.data.cycle, today);
  if (result.data.nextRenewalDate < floor) {
    return {
      ok: false,
      errors: {
        nextRenewalDate: `次回更新日は ${floor} より前にできません（1 周期ぶんまで遡れます）`,
      },
    };
  }

  return { ok: true, value: result.data };
}
