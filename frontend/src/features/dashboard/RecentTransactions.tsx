import { useState } from 'react';
import { Link } from 'react-router';
import { Card } from '../../components/ui';
import { cn } from '../../lib/cn';
import type { Transaction } from '../../lib/ledger/types';
import { TransactionList } from '../../features/ledger/TransactionList';
import { TransactionDetail } from '../../features/ledger/TransactionDetail';
import { useAccounts, useCategories, useRecentTransactions } from '../../features/ledger/hooks';

interface Props {
  memberId: string;
  className?: string;
  limit?: number;
}

/** 直近の履歴（編集は家計簿ページで。行タップで詳細だけ見られる, #105）。 */
export function RecentTransactions({ memberId, className, limit = 5 }: Props) {
  const { data: transactions = [], isLoading, isError } = useRecentTransactions(memberId, limit);
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const [detail, setDetail] = useState<Transaction | null>(null);

  return (
    <Card className={cn('flex flex-col gap-8', className)}>
      <div className="flex items-center justify-between">
        <h2 className="font-headline-md text-headline-md text-custom-text">直近の履歴</h2>
        <Link
          to={memberId ? `/ledger?member=${encodeURIComponent(memberId)}` : '/ledger'}
          className="font-label-sm text-label-sm text-custom-accent transition hover:underline"
        >
          すべて見る
        </Link>
      </div>
      <TransactionList
        transactions={transactions}
        categories={categories}
        onSelect={setDetail}
        loading={isLoading}
        error={isError}
        emptyMessage="まだ記録がありません"
      />
      <TransactionDetail
        txn={detail}
        categories={categories}
        accounts={accounts}
        onClose={() => setDetail(null)}
      />
    </Card>
  );
}
