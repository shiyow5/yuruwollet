import { useState } from 'react';
import { Button, Input, Select, SegmentedControl } from '../../components/ui';
import { jstToday } from '../../lib/format';
import { validateTransactionForm, type FieldErrors } from '../../lib/ledger/schema';
import { selectableCategories } from '../../lib/ledger/categories';
import type { Category, TransactionDraft, TxnType } from '../../lib/ledger/types';

export interface TransactionFormValues {
  type: TxnType;
  amount: string;
  categoryId: string;
  occurredOn: string;
  memo: string;
}

interface Props {
  categories: Category[];
  initial?: Partial<TransactionFormValues>;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (draft: TransactionDraft) => void;
  onCancel?: () => void;
}

const TYPE_OPTIONS = [
  { value: 'expense' as const, label: '支出' },
  { value: 'income' as const, label: '収入' },
];

function initialValues(initial?: Partial<TransactionFormValues>): TransactionFormValues {
  return {
    type: initial?.type ?? 'expense',
    amount: initial?.amount ?? '',
    categoryId: initial?.categoryId ?? '',
    occurredOn: initial?.occurredOn ?? jstToday(),
    memo: initial?.memo ?? '',
  };
}

/**
 * 収支の追加/編集フォーム（プレゼンテーショナル）。
 * 検証は validateTransactionForm（zod）に委譲し、成功時のみ onSubmit(draft) を呼ぶ。
 */
export function TransactionForm({
  categories,
  initial,
  submitting = false,
  submitLabel = '保存',
  onSubmit,
  onCancel,
}: Props) {
  const [values, setValues] = useState<TransactionFormValues>(() => initialValues(initial));
  const [errors, setErrors] = useState<FieldErrors<TransactionDraft>>({});

  const options = selectableCategories(categories, values.type);

  function update<K extends keyof TransactionFormValues>(key: K, value: TransactionFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleTypeChange(type: TxnType) {
    setValues((prev) => {
      const stillValid = selectableCategories(categories, type).some(
        (c) => c.id === prev.categoryId,
      );
      return { ...prev, type, categoryId: stillValid ? prev.categoryId : '' };
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateTransactionForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit(result.value);
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit} aria-label="収支フォーム">
      <SegmentedControl options={TYPE_OPTIONS} value={values.type} onChange={handleTypeChange} />

      <div>
        <Input
          label="金額"
          inputMode="numeric"
          placeholder="0"
          value={values.amount}
          onChange={(e) => update('amount', e.target.value)}
        />
        {errors.amount && <FieldError>{errors.amount}</FieldError>}
      </div>

      <div>
        <Select
          label="カテゴリ"
          value={values.categoryId}
          onChange={(e) => update('categoryId', e.target.value)}
        >
          <option value="">未選択</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {errors.categoryId && <FieldError>{errors.categoryId}</FieldError>}
      </div>

      <div>
        <Input
          label="日付"
          type="date"
          value={values.occurredOn}
          onChange={(e) => update('occurredOn', e.target.value)}
        />
        {errors.occurredOn && <FieldError>{errors.occurredOn}</FieldError>}
      </div>

      <div>
        <Input
          label="メモ"
          placeholder="スーパーでの買い物 など"
          value={values.memo}
          onChange={(e) => update('memo', e.target.value)}
        />
        {errors.memo && <FieldError>{errors.memo}</FieldError>}
      </div>

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

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-1 font-label-sm text-label-sm text-error">
      {children}
    </p>
  );
}
