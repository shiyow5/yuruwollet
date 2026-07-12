import { StatTile, Skeleton } from '../../components/ui';
import { formatYen } from '../../lib/format';
import { useMonthlySummary } from '../../features/ledger/hooks';

interface Props {
  memberId: string;
  month: string;
}

/** 今月の収入 / 支出（v_monthly_summary）。 */
export function MonthlyStats({ memberId, month }: Props) {
  const { data: summary, isLoading, isError } = useMonthlySummary(memberId, month);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <p
        role="alert"
        className="rounded-3xl border border-black/5 bg-surface-container-high p-8 text-center text-body-md text-error"
      >
        今月の収支を取得できませんでした
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <StatTile label="今月の収入" value={formatYen(summary?.income ?? 0)} />
      <StatTile label="今月の支出" value={formatYen(summary?.expense ?? 0)} />
    </div>
  );
}
