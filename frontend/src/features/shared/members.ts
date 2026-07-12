import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { queryKeys } from '../../lib/queryKeys';
import { useSessionContext } from '../../lib/auth/session-context';
import { listProfiles } from '../../lib/data/aggregates';
import { buildMemberOptions, type MemberOption } from '../../lib/ledger/members';

/** 2 メンバーの profile（household スコープで両者取得）。 */
export function useProfiles() {
  return useQuery({ queryKey: queryKeys.profiles(), queryFn: () => listProfiles(supabase) });
}

/** 自分/相手タブの選択肢と自分の member_id を返す（profiles + session を合成）。 */
export function useMemberOptions(): { options: MemberOption[]; selfId: string | null } {
  const session = useSessionContext();
  const { data: profiles = [] } = useProfiles();
  const selfId = session.status === 'authenticated' ? session.session.member.id : null;
  const options = selfId ? buildMemberOptions(profiles, selfId) : [];
  return { options, selfId };
}
