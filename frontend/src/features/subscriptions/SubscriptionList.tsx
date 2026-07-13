import { EmptyState, Skeleton } from '../../components/ui';
import { SubscriptionItem } from './SubscriptionItem';
import type { Subscription } from '../../lib/subscriptions/types';

interface Props {
  subscriptions: Subscription[];
  loading?: boolean;
  error?: boolean;
  emptyMessage?: string;
  onEdit?: (sub: Subscription) => void;
  onDelete?: (sub: Subscription) => void;
}

/** サブスク一覧。読み込み中はスケルトン、失敗はエラー、0 件は EmptyState。 */
export function SubscriptionList({
  subscriptions,
  loading = false,
  error = false,
  emptyMessage = 'まだサブスクがありません',
  onEdit,
  onDelete,
}: Props) {
  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon="cloud_off"
        title="サブスクを読み込めませんでした"
        description="通信環境を確認して、少し時間をおいて再度お試しください"
      />
    );
  }

  if (subscriptions.length === 0) {
    return <EmptyState icon="subscriptions" title={emptyMessage} />;
  }

  return (
    <ul className="flex flex-col gap-4">
      {subscriptions.map((sub) => (
        <li key={sub.id}>
          <SubscriptionItem sub={sub} onEdit={onEdit} onDelete={onDelete} />
        </li>
      ))}
    </ul>
  );
}
