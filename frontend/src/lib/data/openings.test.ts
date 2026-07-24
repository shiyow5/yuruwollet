import { describe, expect, it } from 'vitest';
import { getAccountBalances, listAccountOpenings, upsertAccountOpening } from './openings';
import { makeSupabaseMock, argsOf } from '../../test/supabaseMock';
import type { AccountBalance, AccountOpening } from '../ledger/types';

function bal(over: Partial<AccountBalance> = {}): AccountBalance {
  return {
    household_id: 'main',
    member_id: 'yururi',
    account_id: 'a1',
    account_name: '現金',
    account_icon: 'payments',
    is_archived: false,
    balance: 35000,
    ...over,
  };
}

function opening(over: Partial<AccountOpening> = {}): AccountOpening {
  return {
    household_id: 'main',
    member_id: 'yururi',
    account_id: 'a1',
    opening_balance: 30000,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('getAccountBalances', () => {
  it('v_account_balances を household スコープで取得する', async () => {
    const rows = [bal(), bal({ member_id: 'shiyowo', balance: 0 })];
    const { client } = makeSupabaseMock({ v_account_balances: { data: rows, error: null } });
    expect(await getAccountBalances(client)).toEqual(rows);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({
      v_account_balances: { data: null, error: { message: 'x' } },
    });
    await expect(getAccountBalances(client)).rejects.toThrow(/x/);
  });
});

describe('listAccountOpenings', () => {
  it('account_openings を取得する', async () => {
    const rows = [opening()];
    const { client } = makeSupabaseMock({ account_openings: { data: rows, error: null } });
    expect(await listAccountOpenings(client)).toEqual(rows);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({
      account_openings: { data: null, error: { message: 'x' } },
    });
    await expect(listAccountOpenings(client)).rejects.toThrow(/x/);
  });
});

describe('upsertAccountOpening', () => {
  it('(member_id, account_id) の衝突で upsert する', async () => {
    const { client, queries } = makeSupabaseMock({ account_openings: { data: null, error: null } });
    await upsertAccountOpening(client, {
      householdId: 'main',
      memberId: 'yururi',
      accountId: 'a1',
      openingBalance: 45000,
    });
    expect(argsOf(queries.account_openings, 'upsert')?.[0]).toEqual({
      household_id: 'main',
      member_id: 'yururi',
      account_id: 'a1',
      opening_balance: 45000,
    });
    expect(argsOf(queries.account_openings, 'upsert')?.[1]).toEqual({
      onConflict: 'member_id,account_id',
    });
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({
      account_openings: { data: null, error: { message: 'rls' } },
    });
    await expect(
      upsertAccountOpening(client, {
        householdId: 'main',
        memberId: 'yururi',
        accountId: 'a1',
        openingBalance: 1,
      }),
    ).rejects.toThrow(/rls/);
  });
});
