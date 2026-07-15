import { useState } from 'react';
import { useSessionContext } from '../../lib/auth/session-context';
import { jstMonthStart } from '../../lib/format';
import { defaultOccurredOn } from '../../lib/ledger/defaults';
import type { TxnType } from '../../lib/ledger/types';
import { MemberTabs } from '../../features/shared/MemberTabs';
import { useMemberOptions } from '../../features/shared/members';
import { BalanceHero } from '../../features/dashboard/BalanceHero';
import { MonthlyStats } from '../../features/dashboard/MonthlyStats';
import { ExpenseComparisonCard } from '../../features/dashboard/ExpenseComparisonCard';
import { CategoryBreakdownCard } from '../../features/dashboard/CategoryBreakdownCard';
import { RecentTransactions } from '../../features/dashboard/RecentTransactions';
import { AddTransactionModal } from '../../features/ledger/AddTransactionModal';

export function HomePage() {
  const session = useSessionContext();
  const name = session.status === 'authenticated' ? session.session.member.displayName : null;

  const { options, selfId } = useMemberOptions();
  const [viewMemberId, setViewMemberId] = useState<string | null>(null);
  const [addType, setAddType] = useState<TxnType | null>(null);
  const activeMember = viewMemberId ?? selfId ?? '';
  const isSelf = activeMember !== '' && activeMember === selfId;
  const month = jstMonthStart();

  // 相手タブへ切り替えたら追加の意図を捨てる（残すと自分タブに戻った瞬間に開き直す）
  function handleMemberChange(id: string) {
    setViewMemberId(id);
    setAddType(null);
  }

  return (
    <section className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <div>
          <h2 className="font-headline-md text-headline-md font-bold text-custom-text">
            {name ? `おかえり、${name} さん` : 'ホーム'}
          </h2>
          <p className="text-body-md text-custom-text/70">今日もおつかれさま</p>
        </div>
        <MemberTabs options={options} value={activeMember} onChange={handleMemberChange} />
      </header>

      <BalanceHero memberId={activeMember} canAdd={isSelf} onAdd={setAddType} />
      <ExpenseComparisonCard memberId={activeMember} month={month} />
      <MonthlyStats memberId={activeMember} month={month} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <CategoryBreakdownCard memberId={activeMember} month={month} className="lg:col-span-7" />
        <RecentTransactions memberId={activeMember} className="lg:col-span-5" />
      </div>

      {/* ホームは常に当月を見ているので既定日付は今日になる（家計簿と同じ式を使う） */}
      <AddTransactionModal
        open={addType !== null && isSelf}
        initialType={addType ?? 'expense'}
        defaultDate={defaultOccurredOn(month)}
        onClose={() => setAddType(null)}
      />
    </section>
  );
}
