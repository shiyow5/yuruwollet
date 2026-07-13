import { Icon } from '../../components/ui';
import { formatSignedYen, relativeDay } from '../../lib/format';
import { resolveCategory } from '../../lib/ledger/categories';
import { isOptimisticId } from '../../lib/ledger/optimistic';
import type { Category, Transaction } from '../../lib/ledger/types';

interface Props {
  txn: Transaction;
  categories: Category[];
  onEdit?: (txn: Transaction) => void;
  onDelete?: (txn: Transaction) => void;
  now?: Date;
}

/** 取引 1 件の行表示。onEdit/onDelete が渡されたときのみ操作ボタンを出す。 */
export function TransactionItem({ txn, categories, onEdit, onDelete, now }: Props) {
  const { name, icon } = resolveCategory(categories, txn.category_id);
  const title = txn.memo.trim() !== '' ? txn.memo : name;
  const isIncome = txn.type === 'income';
  const pending = isOptimisticId(txn.id);
  // 操作ボタンを出さない行:
  //   - 残高調整 (is_system_generated): RLS で更新/削除不可
  //   - サブスクの支払い (subscription_id): cron が作った実支出。更新日は既に進んでいるので
  //     消されると二度と復活しない。DB 側でも更新はトリガ、削除は RLS が拒否する
  const actionable = !pending && !txn.is_system_generated && txn.subscription_id === null;

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-custom-accent/10 text-custom-accent">
          <Icon name={icon} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h4 className="truncate font-body-md text-body-md font-medium text-custom-text">
            {title}
          </h4>
          <span className="font-label-sm text-label-sm text-custom-text/50">
            {pending ? '保存中…' : `${name} · ${relativeDay(txn.occurred_on, now)}`}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span
          className={
            isIncome
              ? 'font-body-md text-body-md font-medium text-custom-accent'
              : 'font-body-md text-body-md font-medium text-custom-text'
          }
        >
          {formatSignedYen(txn.amount, txn.type)}
        </span>
        {onEdit && actionable && (
          <button
            type="button"
            aria-label="編集"
            onClick={() => onEdit(txn)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-custom-text/50 transition hover:bg-black/5"
          >
            <Icon name="edit" size={20} />
          </button>
        )}
        {onDelete && actionable && (
          <button
            type="button"
            aria-label="削除"
            onClick={() => onDelete(txn)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-custom-text/50 transition hover:bg-error/10 hover:text-error"
          >
            <Icon name="delete" size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
