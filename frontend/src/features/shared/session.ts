import { useSessionContext } from '../../lib/auth/session-context';

/** 書込コンテキスト（自分の household_id / member_id）。未認証なら null。 */
export function useWriteContext(): { householdId: string; memberId: string } | null {
  const session = useSessionContext();
  if (session.status !== 'authenticated') return null;
  return {
    householdId: session.session.householdId,
    memberId: session.session.member.id,
  };
}
