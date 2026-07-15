import type { ReactNode } from 'react';
import { Card, EmptyState, Skeleton } from '../../components/ui';

interface Props {
  title: string;
  description?: string;
  isLoading: boolean;
  isError: boolean;
  /** データが 1 件も無い（0 のグラフを描かず EmptyState を出す） */
  isEmpty: boolean;
  emptyTitle: string;
  emptyDescription: string;
  children: ReactNode;
}

/**
 * グラフの枠。読み込み/失敗/空 の 3 状態を必ず出し分ける。
 * **失敗したときに「全部 0 のグラフ」を描かない**（0 円だったのか取得できなかったのか区別できなくなる）。
 */
export function ChartCard({
  title,
  description,
  isLoading,
  isError,
  isEmpty,
  emptyTitle,
  emptyDescription,
  children,
}: Props) {
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h3 className="font-headline-md text-body-lg font-medium text-custom-text">{title}</h3>
        {description && <p className="text-label-sm text-custom-text/70">{description}</p>}
      </div>

      {isError ? (
        <p role="alert" className="text-label-sm text-error">
          {title}を取得できませんでした。時間をおいて再度お試しください。
        </p>
      ) : isLoading ? (
        <Skeleton className="h-56 rounded-2xl" />
      ) : isEmpty ? (
        <EmptyState icon="bar_chart" title={emptyTitle} description={emptyDescription} />
      ) : (
        children
      )}
    </Card>
  );
}
