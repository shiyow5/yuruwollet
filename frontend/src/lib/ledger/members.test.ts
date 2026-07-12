import { describe, expect, it } from 'vitest';
import { selectBalance, partnerOf, displayNameOf, buildMemberOptions } from './members';
import type { MemberBalance, Profile } from './types';

const balances: MemberBalance[] = [
  { household_id: 'main', member_id: 'yururi', display_name: 'ゆるり', balance: 342500 },
  { household_id: 'main', member_id: 'shiyowo', display_name: 'しよを', balance: 120000 },
];

function profile(over: Partial<Profile>): Profile {
  return {
    household_id: 'main',
    member_id: 'yururi',
    display_name: 'ゆるり',
    email: null,
    opening_balance: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const profiles: Profile[] = [
  profile({ member_id: 'yururi', display_name: 'ゆるり' }),
  profile({ member_id: 'shiyowo', display_name: 'しよを' }),
];

describe('selectBalance', () => {
  it('指定メンバーの残高を返す', () => {
    expect(selectBalance(balances, 'yururi')).toBe(342500);
    expect(selectBalance(balances, 'shiyowo')).toBe(120000);
  });
  it('存在しないメンバーは null', () => {
    expect(selectBalance(balances, 'nobody')).toBeNull();
  });
  it('balance が null なら 0', () => {
    expect(
      selectBalance([{ household_id: 'main', member_id: 'x', display_name: 'X', balance: null }], 'x'),
    ).toBe(0);
  });
});

describe('partnerOf', () => {
  it('自分ではない方を返す', () => {
    expect(partnerOf(profiles, 'yururi')?.member_id).toBe('shiyowo');
    expect(partnerOf(profiles, 'shiyowo')?.member_id).toBe('yururi');
  });
  it('相手がいなければ null', () => {
    expect(partnerOf([profiles[0]], 'yururi')).toBeNull();
  });
});

describe('displayNameOf', () => {
  it('member_id から表示名', () => {
    expect(displayNameOf(profiles, 'shiyowo')).toBe('しよを');
  });
  it('無ければ null', () => {
    expect(displayNameOf(profiles, 'nobody')).toBeNull();
  });
});

describe('buildMemberOptions', () => {
  it('自分→相手 の順で並べ isSelf を付ける', () => {
    const opts = buildMemberOptions(profiles, 'shiyowo');
    expect(opts).toEqual([
      { memberId: 'shiyowo', label: 'しよを', isSelf: true },
      { memberId: 'yururi', label: 'ゆるり', isSelf: false },
    ]);
  });
  it('自分の profile が無ければ空', () => {
    expect(buildMemberOptions(profiles, 'nobody')).toEqual([]);
  });
  it('相手が居なければ自分のみ', () => {
    expect(buildMemberOptions([profiles[0]], 'yururi')).toEqual([
      { memberId: 'yururi', label: 'ゆるり', isSelf: true },
    ]);
  });
});
