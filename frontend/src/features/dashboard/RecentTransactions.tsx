import { Link } from 'react-router';
import { Card } from '../../components/ui';
import { cn } from '../../lib/cn';
import { TransactionList } from '../../features/ledger/TransactionList';
import { useCategories, useRecentTransactions } from '../../features/ledger/hooks';

interface Props {
  memberId: string;
  className?: string;
  limit?: number;
}

/** 直近の履歴（読み取り専用。編集は家計簿ページで）。 */
export function RecentTransactions({ memberId, className, limit = 5 }: Props) {
  const { data: transactions = [], isLoading } = useRecentTransactions(memberId, limit);
  const { data: categories = [] } = useCategories();

  return (
    <Card className={cn('flex flex-col gap-8', className)}>
      <div className="flex items-center justify-between">
        <h2 className="font-headline-md text-headline-md text-custom-text">直近の履歴</h2>
        <Link
          to={`/ledger?member=${encodeURIComponent(memberId)}`}
          className="font-label-sm text-label-sm text-custom-accent transition hover:underline"
        >
          すべて見る
        </Link>
      </div>
      <TransactionList
        transactions={transactions}
        categories={categories}
        loading={isLoading}
        emptyMessage="まだ記録がありません"
      />
    </Card>
  );
}
