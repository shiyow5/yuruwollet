import { useState } from 'react';
import { Button, Input, Select, SegmentedControl } from '../../components/ui';
import { formatYen, jstToday, parseAmount } from '../../lib/format';
import { validateSubscriptionForm, type FieldErrors } from '../../lib/subscriptions/schema';
import {
  computeSubscriptionAmounts,
  monthlyEquivalent,
  type FxSnapshot,
} from '../../lib/subscriptions/fx';
import { STATUS_LABELS, CYCLE_LABELS } from '../../lib/subscriptions/labels';
import type {
  SubscriptionDraft,
  SubCurrency,
  SubCycle,
  SubStatus,
} from '../../lib/subscriptions/types';

export interface SubscriptionFormValues {
  name: string;
  currency: SubCurrency;
  amount: string;
  cycle: SubCycle;
  nextRenewalDate: string;
  status: SubStatus;
}

interface Props {
  /** USD 換算用の最新為替。null なら USD 登録不可。 */
  fxRate: FxSnapshot | null;
  initial?: Partial<SubscriptionFormValues>;
  submitting?: boolean;
  submitLabel?: string;
  submitError?: string | null;
  onSubmit: (draft: SubscriptionDraft) => void;
  onCancel?: () => void;
}

const CURRENCY_OPTIONS = [
  { value: 'JPY' as const, label: '円' },
  { value: 'USD' as const, label: 'ドル' },
];
const CYCLE_OPTIONS: { value: SubCycle; label: string }[] = [
  { value: 'monthly', label: CYCLE_LABELS.monthly },
  { value: 'yearly', label: CYCLE_LABELS.yearly },
];
const STATUS_OPTIONS: SubStatus[] = ['active', 'trial', 'considering_cancel'];

function initialValues(initial?: Partial<SubscriptionFormValues>): SubscriptionFormValues {
  return {
    name: initial?.name ?? '',
    currency: initial?.currency ?? 'JPY',
    amount: initial?.amount ?? '',
    cycle: initial?.cycle ?? 'monthly',
    nextRenewalDate: initial?.nextRenewalDate ?? jstToday(),
    status: initial?.status ?? 'active',
  };
}

/** サブスク追加/編集フォーム（プレゼンテーショナル）。USD は概算換算をプレビュー表示。 */
export function SubscriptionForm({
  fxRate,
  initial,
  submitting = false,
  submitLabel = '保存',
  submitError,
  onSubmit,
  onCancel,
}: Props) {
  const [values, setValues] = useState<SubscriptionFormValues>(() => initialValues(initial));
  const [errors, setErrors] = useState<FieldErrors<SubscriptionDraft>>({});

  const usdDisabled = values.currency === 'USD' && !fxRate;
  const amountNum = parseAmount(values.amount);
  const preview =
    !Number.isNaN(amountNum) && amountNum > 0
      ? computeSubscriptionAmounts(values.currency, amountNum, fxRate)
      : null;
  const monthlyPreview = preview ? monthlyEquivalent(preview.amountJpy, values.cycle) : null;

  function update<K extends keyof SubscriptionFormValues>(
    key: K,
    value: SubscriptionFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (usdDisabled) {
      setErrors({ currency: '為替レートが未取得のため USD は登録できません' });
      return;
    }
    const result = validateSubscriptionForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit(result.value);
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit} aria-label="サブスクフォーム">
      <div>
        <Input
          label="サービス名"
          id="sub-name"
          placeholder="Netflix など"
          value={values.name}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'sub-name-error' : undefined}
          onChange={(e) => update('name', e.target.value)}
        />
        {errors.name && <FieldError id="sub-name-error">{errors.name}</FieldError>}
      </div>

      <div className="flex flex-col gap-2">
        <span id="sub-currency-label" className="font-label-sm text-label-sm text-custom-text/60">
          通貨
        </span>
        <SegmentedControl
          ariaLabelledby="sub-currency-label"
          options={CURRENCY_OPTIONS}
          value={values.currency}
          onChange={(c) => update('currency', c)}
        />
      </div>

      <div>
        <Input
          label={values.currency === 'USD' ? '金額（USD）' : '金額（円）'}
          id="sub-amount"
          inputMode="decimal"
          placeholder={values.currency === 'USD' ? '9.99' : '1490'}
          value={values.amount}
          aria-invalid={errors.originalAmount ? true : undefined}
          aria-describedby={errors.originalAmount ? 'sub-amount-error' : undefined}
          onChange={(e) => update('amount', e.target.value)}
        />
        {errors.originalAmount && (
          <FieldError id="sub-amount-error">{errors.originalAmount}</FieldError>
        )}
        {usdDisabled && (
          <FieldError>
            為替レートが未取得のため USD は登録できません（JPY で入力してください）
          </FieldError>
        )}
        {monthlyPreview != null && (
          <p className="mt-1 font-label-sm text-label-sm text-custom-text/60">
            月換算 {formatYen(monthlyPreview)}
            {values.currency === 'USD' ? '（概算）' : ''}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span id="sub-cycle-label" className="font-label-sm text-label-sm text-custom-text/60">
          支払いサイクル
        </span>
        <SegmentedControl
          ariaLabelledby="sub-cycle-label"
          options={CYCLE_OPTIONS}
          value={values.cycle}
          onChange={(c) => update('cycle', c)}
        />
      </div>

      <div>
        <Input
          label="次回更新日"
          id="sub-renewal"
          type="date"
          value={values.nextRenewalDate}
          aria-invalid={errors.nextRenewalDate ? true : undefined}
          aria-describedby={errors.nextRenewalDate ? 'sub-renewal-error' : undefined}
          onChange={(e) => update('nextRenewalDate', e.target.value)}
        />
        {errors.nextRenewalDate && (
          <FieldError id="sub-renewal-error">{errors.nextRenewalDate}</FieldError>
        )}
      </div>

      <Select
        label="ステータス"
        value={values.status}
        onChange={(e) => update('status', e.target.value as SubStatus)}
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </Select>

      {submitError && (
        <p role="alert" className="font-label-sm text-label-sm text-error">
          {submitError}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        {onCancel && (
          <Button type="button" variant="secondary" fullWidth onClick={onCancel}>
            キャンセル
          </Button>
        )}
        <Button type="submit" fullWidth disabled={submitting}>
          {submitting ? '保存中…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-1 font-label-sm text-label-sm text-error">
      {children}
    </p>
  );
}
