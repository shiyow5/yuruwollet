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
  /** 保存 mutation が失敗したときに表示するメッセージ */
  submitError?: string | null;
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
  submitError,
  onSubmit,
  onCancel,
}: Props) {
  const [values, setValues] = useState<TransactionFormValues>(() => initialValues(initial));
  const [errors, setErrors] = useState<FieldErrors<TransactionDraft>>({});

  const selectable = selectableCategories(categories, values.type);
  // 編集時、現在のカテゴリが後からアーカイブされていても選択肢に残す
  // （表示値と送信値を一致させ、金額/メモのみ編集で意図せずカテゴリが変わらないように）
  const current =
    values.categoryId !== ''
      ? categories.find((c) => c.id === values.categoryId && c.kind === values.type)
      : undefined;
  const options =
    current && !selectable.some((c) => c.id === current.id) ? [...selectable, current] : selectable;

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
      <SegmentedControl
        fullWidth
        options={TYPE_OPTIONS}
        value={values.type}
        onChange={handleTypeChange}
        ariaLabel="収支の種別"
      />

      <div>
        <Input
          label="金額"
          id="txn-amount"
          inputMode="numeric"
          placeholder="0"
          value={values.amount}
          aria-invalid={errors.amount ? true : undefined}
          aria-describedby={errors.amount ? 'txn-amount-error' : undefined}
          onChange={(e) => update('amount', e.target.value)}
        />
        {errors.amount && <FieldError id="txn-amount-error">{errors.amount}</FieldError>}
      </div>

      <div>
        <Select
          label="カテゴリ"
          id="txn-category"
          value={values.categoryId}
          aria-invalid={errors.categoryId ? true : undefined}
          aria-describedby={errors.categoryId ? 'txn-category-error' : undefined}
          onChange={(e) => update('categoryId', e.target.value)}
        >
          <option value="">未選択</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.is_archived ? '（アーカイブ済）' : ''}
            </option>
          ))}
        </Select>
        {errors.categoryId && <FieldError id="txn-category-error">{errors.categoryId}</FieldError>}
      </div>

      <div>
        <Input
          label="日付"
          id="txn-occurred"
          type="date"
          value={values.occurredOn}
          aria-invalid={errors.occurredOn ? true : undefined}
          aria-describedby={errors.occurredOn ? 'txn-occurred-error' : undefined}
          onChange={(e) => update('occurredOn', e.target.value)}
        />
        {errors.occurredOn && <FieldError id="txn-occurred-error">{errors.occurredOn}</FieldError>}
      </div>

      <div>
        <Input
          label="メモ"
          id="txn-memo"
          placeholder="スーパーでの買い物 など"
          value={values.memo}
          aria-invalid={errors.memo ? true : undefined}
          aria-describedby={errors.memo ? 'txn-memo-error' : undefined}
          onChange={(e) => update('memo', e.target.value)}
        />
        {errors.memo && <FieldError id="txn-memo-error">{errors.memo}</FieldError>}
      </div>

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
