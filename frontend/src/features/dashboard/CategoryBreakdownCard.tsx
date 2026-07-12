import { Card, Chip, EmptyState, Icon, ProgressBar, Skeleton } from '../../components/ui';
import { cn } from '../../lib/cn';
import { formatYen } from '../../lib/format';
import { toCategoryBars } from '../../lib/ledger/breakdown';
import { useCategoryBreakdown } from '../../features/ledger/hooks';

interface Props {
  memberId: string;
  month: string;
  className?: string;
}

/** カテゴリ別支出（v_category_breakdown → 最大値基準のバー）。 */
export function CategoryBreakdownCard({ memberId, month, className }: Props) {
  const { data: rows = [], isLoading } = useCategoryBreakdown(memberId, month);
  const bars = toCategoryBars(rows, 'expense');

  return (
    <Card className={cn('flex flex-col gap-8', className)}>
      <div className="flex items-center justify-between">
        <h2 className="font-headline-md text-headline-md text-custom-text">カテゴリ別支出</h2>
        <Chip tone="neutral">今月</Chip>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-6">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : bars.length === 0 ? (
        <EmptyState icon="donut_small" title="今月の支出はまだありません" />
      ) : (
        <div className="flex flex-col gap-6">
          {bars.map((bar) => (
            <div key={bar.categoryId ?? 'uncategorized'}>
              <div className="mb-3 flex items-end justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-custom-accent/10 text-custom-accent">
                    <Icon name={bar.icon} />
                  </div>
                  <span className="font-body-lg text-body-lg font-medium text-custom-text">
                    {bar.name}
                  </span>
                </div>
                <span className="font-body-lg text-body-lg font-medium text-custom-accent">
                  {formatYen(bar.total)}
                </span>
              </div>
              <ProgressBar value={bar.widthPct} max={100} className="h-1" />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
