import { useState } from 'react';
import { useSessionContext } from '../../lib/auth/session-context';
import { jstMonthStart } from '../../lib/format';
import { MemberTabs } from '../../features/ledger/MemberTabs';
import { useMemberOptions } from '../../features/ledger/hooks';
import { BalanceHero } from '../../features/dashboard/BalanceHero';
import { MonthlyStats } from '../../features/dashboard/MonthlyStats';
import { CategoryBreakdownCard } from '../../features/dashboard/CategoryBreakdownCard';
import { RecentTransactions } from '../../features/dashboard/RecentTransactions';

export function HomePage() {
  const session = useSessionContext();
  const name = session.status === 'authenticated' ? session.session.member.displayName : null;

  const { options, selfId } = useMemberOptions();
  const [viewMemberId, setViewMemberId] = useState<string | null>(null);
  const activeMember = viewMemberId ?? selfId ?? '';
  const isSelf = activeMember !== '' && activeMember === selfId;
  const month = jstMonthStart();

  return (
    <section className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <div>
          <h2 className="font-headline-md text-headline-md font-bold text-custom-text">
            {name ? `おかえり、${name} さん` : 'ホーム'}
          </h2>
          <p className="text-body-md text-custom-text/60">今日もおつかれさま</p>
        </div>
        <MemberTabs options={options} value={activeMember} onChange={setViewMemberId} />
      </header>

      <BalanceHero memberId={activeMember} canAdd={isSelf} />
      <MonthlyStats memberId={activeMember} month={month} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <CategoryBreakdownCard memberId={activeMember} month={month} className="lg:col-span-7" />
        <RecentTransactions memberId={activeMember} className="lg:col-span-5" />
      </div>
    </section>
  );
}
