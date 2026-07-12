import type { MemberBalance, Profile } from './types';

/** member 別残高ビューから指定メンバーの残高を取り出す。行が無ければ null。 */
export function selectBalance(balances: MemberBalance[], memberId: string): number | null {
  const row = balances.find((b) => b.member_id === memberId);
  if (!row) return null;
  return row.balance ?? 0;
}

/** 二人組の profile から「自分ではない方」（相手）を返す。 */
export function partnerOf(profiles: Profile[], selfId: string): Profile | null {
  return profiles.find((p) => p.member_id !== selfId) ?? null;
}

/** member_id から表示名を引く。無ければ null。 */
export function displayNameOf(profiles: Profile[], memberId: string): string | null {
  return profiles.find((p) => p.member_id === memberId)?.display_name ?? null;
}
