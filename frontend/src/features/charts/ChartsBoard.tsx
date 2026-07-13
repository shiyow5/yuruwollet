import { useMemo, useState } from 'react';
import { jstMonthStart, formatMonthLabel } from '../../lib/format';
import { MemberTabs } from '../shared/MemberTabs';
import { useMemberOptions } from '../shared/members';
import {
  buildTrend,
  buildSavingsSeries,
  buildCategorySlices,
  buildSubscriptionSlices,
  recentMonths,
} from '../../lib/charts/series';
import { ChartCard } from './ChartCard';
import { DonutChart } from './DonutChart';
import { TrendChart, SavingsHistoryChart } from './TrendChart';
import {
  useMonthlyTrend,
  useSavingsHistory,
  useSubscriptionSlices,
  useCategoryBreakdown,
} from './hooks';

const TREND_MONTHS = 12;

export function ChartsBoard() {
  const { options, selfId } = useMemberOptions();
  const [viewMemberId, setViewMemberId] = useState<string | null>(null);
  const activeMember = viewMemberId ?? selfId ?? '';

  const month = jstMonthStart();
  const fromMonth = recentMonths(TREND_MONTHS)[0];

  const trend = useMonthlyTrend(activeMember, fromMonth);
  const categories = useCategoryBreakdown(activeMember, month);
  const subs = useSubscriptionSlices(activeMember);
  const savings = useSavingsHistory(activeMember, fromMonth);

  const trendData = useMemo(() => buildTrend(trend.data ?? [], TREND_MONTHS), [trend.data]);
  const categorySlices = useMemo(
    () => buildCategorySlices(categories.data ?? []),
    [categories.data],
  );
  const subSlices = useMemo(() => buildSubscriptionSlices(subs.data ?? []), [subs.data]);
  const savingsData = useMemo(() => buildSavingsSeries(savings.data ?? []), [savings.data]);

  // 全部 0 の月しか無いなら「データが無い」。0 のグラフを描いても何も伝わらない。
  const trendEmpty = trendData.every((p) => p.income === 0 && p.expense === 0);

  return (
    <div className="flex flex-col gap-6">
      <MemberTabs options={options} value={activeMember} onChange={setViewMemberId} />

      <ChartCard
        title="収支の推移"
        description={`直近${TREND_MONTHS}ヶ月（残高調整は除く）`}
        isLoading={trend.isLoading}
        isError={trend.isError}
        isEmpty={trendEmpty}
        emptyTitle="まだ記録がありません"
        emptyDescription="収支を記録すると、月ごとの推移が見えます"
      >
        <TrendChart data={trendData} />
      </ChartCard>

      <ChartCard
        title="カテゴリ別の支出"
        description={`${formatMonthLabel(month)}（残高調整は除く）`}
        isLoading={categories.isLoading}
        isError={categories.isError}
        isEmpty={categorySlices.length === 0}
        emptyTitle="今月の支出はまだありません"
        emptyDescription="支出を記録すると、内訳が見えます"
      >
        <DonutChart data={categorySlices} />
      </ChartCard>

      <ChartCard
        title="サブスクの内訳"
        description="月換算（解約検討中は除く）"
        isLoading={subs.isLoading}
        isError={subs.isError}
        isEmpty={subSlices.length === 0}
        emptyTitle="サブスクはまだありません"
        emptyDescription="サブスクを登録すると、月々の内訳が見えます"
      >
        <DonutChart data={subSlices} />
      </ChartCard>

      <ChartCard
        title="貯金の履歴"
        description="目標と実績"
        isLoading={savings.isLoading}
        isError={savings.isError}
        isEmpty={savingsData.length === 0}
        emptyTitle="目標を立てた月がありません"
        emptyDescription="マイページで目標を決めると、履歴が残ります"
      >
        <SavingsHistoryChart data={savingsData} />
      </ChartCard>
    </div>
  );
}
