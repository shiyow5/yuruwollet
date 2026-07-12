import { EmptyState, Skeleton } from '../../components/ui';
import { TransactionItem } from './TransactionItem';
import type { Category, Transaction } from '../../lib/ledger/types';

interface Props {
  transactions: Transaction[];
  categories: Category[];
  loading?: boolean;
  error?: boolean;
  emptyMessage?: string;
  onEdit?: (txn: Transaction) => void;
  onDelete?: (txn: Transaction) => void;
  now?: Date;
}

/** 取引一覧。読み込み中はスケルトン、失敗はエラー表示、0 件は EmptyState。 */
export function TransactionList({
  transactions,
  categories,
  loading = false,
  error = false,
  emptyMessage = 'まだ記録がありません',
  onEdit,
  onDelete,
  now,
}: Props) {
  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon="cloud_off"
        title="記録を読み込めませんでした"
        description="通信環境を確認して、少し時間をおいて再度お試しください"
      />
    );
  }

  if (transactions.length === 0) {
    return <EmptyState icon="receipt_long" title={emptyMessage} />;
  }

  return (
    <ul className="flex flex-col gap-6">
      {transactions.map((txn) => (
        <li key={txn.id}>
          <TransactionItem
            txn={txn}
            categories={categories}
            onEdit={onEdit}
            onDelete={onDelete}
            now={now}
          />
        </li>
      ))}
    </ul>
  );
}
