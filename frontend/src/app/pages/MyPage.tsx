import { useState } from 'react';
import { jstMonthStart, formatMonthLabel } from '../../lib/format';
import { MemberTabs } from '../../features/shared/MemberTabs';
import { useMemberOptions } from '../../features/shared/members';
import { ProfileCard } from '../../features/mypage/ProfileCard';
import { GoalCard } from '../../features/savings/GoalCard';

export function MyPage() {
  const { options, selfId } = useMemberOptions();
  const [viewMemberId, setViewMemberId] = useState<string | null>(null);

  const month = jstMonthStart();
  const activeMember = viewMemberId ?? selfId ?? '';
  // 目標を編集できるのは自分の分だけ（相手の分は閲覧のみ）
  const canWrite = activeMember !== '' && activeMember === selfId;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div>
          <h2 className="font-headline-md text-headline-md font-bold text-custom-text">
            マイページ
          </h2>
          <p className="text-body-md text-custom-text/60">
            {formatMonthLabel(month)}の目標と、あなたの設定。
          </p>
        </div>
        <MemberTabs options={options} value={activeMember} onChange={setViewMemberId} />
      </header>

      {activeMember !== '' && (
        <GoalCard memberId={activeMember} month={month} canWrite={canWrite} />
      )}

      {selfId && <ProfileCard selfId={selfId} />}
    </section>
  );
}
