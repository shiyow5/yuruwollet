import { StatTile, Skeleton } from '../../components/ui';
import { formatYen } from '../../lib/format';
import { useMonthlySummary } from '../../features/ledger/hooks';

interface Props {
  memberId: string;
  month: string;
}

/** 今月の収入 / 支出（v_monthly_summary）。 */
export function MonthlyStats({ memberId, month }: Props) {
  const { data: summary, isLoading } = useMonthlySummary(memberId, month);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <StatTile label="今月の収入" value={formatYen(summary?.income ?? 0)} />
      <StatTile label="今月の支出" value={formatYen(summary?.expense ?? 0)} />
    </div>
  );
}
