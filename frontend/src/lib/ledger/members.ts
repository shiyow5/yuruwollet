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

export interface MemberOption {
  memberId: string;
  label: string;
  isSelf: boolean;
}

/**
 * 自分/相手タブ用の選択肢を「自分→相手」の順で組み立てる純関数。
 * 自分の profile が無ければ空。相手が居なければ自分のみ。
 */
export function buildMemberOptions(profiles: Profile[], selfId: string): MemberOption[] {
  const self = profiles.find((p) => p.member_id === selfId);
  if (!self) return [];
  const options: MemberOption[] = [
    { memberId: self.member_id, label: self.display_name, isSelf: true },
  ];
  const partner = partnerOf(profiles, selfId);
  if (partner) {
    options.push({ memberId: partner.member_id, label: partner.display_name, isSelf: false });
  }
  return options;
}
