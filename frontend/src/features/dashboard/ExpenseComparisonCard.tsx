import { Card, EmptyState, ProgressBar, Skeleton } from '../../components/ui';
import { addMonths, formatYen } from '../../lib/format';
import { buildExpenseComparison, type ExpenseBar } from '../../lib/ledger/comparison';
import { useMonthlySummary } from '../../features/ledger/hooks';

interface Props {
  memberId: string;
  month: string;
  className?: string;
}

/**
 * 今月と先月の支出を 2 本のバーで比べるカード（#37）。
 *
 * 単月 API（useMonthlySummary）を 2 回呼ぶ。複数月 API を使わないのは、
 * キャッシュキーが既存のまま（['monthlySummary', memberId, month]）で済み、
 * invalidateLedger への追記が要らない＝無効化の漏れが起こりえないため。
 * 今月分のキーは MonthlyStats と同一なので TanStack が dedupe する。
 */
export function ExpenseComparisonCard({ memberId, month, className }: Props) {
  const current = useMonthlySummary(memberId, month);
  const previous = useMonthlySummary(memberId, addMonths(month, -1));

  // **disabled なクエリは isLoading にならない。** memberId が空の間を自分で pending 扱いする。
  const pending = memberId === '' || current.isLoading || previous.isLoading;
  const failed = current.isError || previous.isError;

  return (
    // 名前は見出しから取る（aria-label に同じ文字列を書くと二重に読み上げられ、
    // 片方だけ文言を変えたときに不一致になる）
    <Card role="region" aria-labelledby="expense-comparison-heading" className={className}>
      <h3
        id="expense-comparison-heading"
        className="mb-6 font-headline-md text-headline-md text-custom-text"
      >
        支出の比較
      </h3>
      {pending ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : failed ? (
        // 取得できていないときに ¥0 を描くと「使っていない」と読めてしまう
        <p role="alert" className="text-body-md text-error">
          支出の比較を取得できませんでした。時間をおいて再度お試しください。
        </p>
      ) : (
        <Comparison
          comparison={buildExpenseComparison(current.data ?? null, previous.data ?? null)}
        />
      )}
    </Card>
  );
}

function Comparison({ comparison }: { comparison: ReturnType<typeof buildExpenseComparison> }) {
  // 先月の行が無い＝比較不能。理由は lib/ledger/comparison.ts を参照。
  if (comparison === null) {
    return <EmptyState icon="bar_chart" title="先月の記録がないため比較できません" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Bar label="今月の支出" caption="今月" bar={comparison.thisMonth} />
      <Bar
        label="先月の支出"
        caption="先月"
        bar={comparison.lastMonth}
        barClassName="bg-black/10"
      />
    </div>
  );
}

function Bar({
  label,
  caption,
  bar,
  barClassName,
}: {
  label: string;
  caption: string;
  bar: ExpenseBar;
  barClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="font-label-sm text-label-sm text-custom-text/60">{caption}</span>
        <span className="font-headline-md text-body-md font-bold text-custom-text">
          {formatYen(bar.expense)}
        </span>
      </div>
      <ProgressBar
        value={bar.widthPct}
        max={100}
        label={label}
        className="h-3"
        barClassName={barClassName}
      />
    </div>
  );
}
