import { describe, expect, it } from 'vitest';
import {
  getSavingsProgress,
  saveSavingsGoal,
  deleteSavingsGoal,
  updateOpeningBalance,
} from './savings';
import { makeSupabaseMock, argsOf } from '../../test/supabaseMock';
import type { SavingsProgress } from '../savings/types';

const row: SavingsProgress = {
  household_id: 'main',
  member_id: 'yururi',
  period_month: '2026-07-01',
  target_amount: 30000,
  saved: 12000,
  achieved: false,
};

describe('getSavingsProgress', () => {
  it('member×月 で取得する', async () => {
    const { client, queries } = makeSupabaseMock({
      v_savings_progress: { data: row, error: null },
    });
    expect(await getSavingsProgress(client, 'yururi', '2026-07-01')).toEqual(row);

    const eqs = queries.v_savings_progress.calls.filter((c) => c.method === 'eq');
    expect(eqs.map((c) => c.args)).toEqual([
      ['member_id', 'yururi'],
      ['period_month', '2026-07-01'],
    ]);
  });

  it('目標未設定なら null', async () => {
    const { client } = makeSupabaseMock({ v_savings_progress: { data: null, error: null } });
    expect(await getSavingsProgress(client, 'yururi', '2026-07-01')).toBeNull();
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({
      v_savings_progress: { data: null, error: { message: 'rls' } },
    });
    await expect(getSavingsProgress(client, 'yururi', '2026-07-01')).rejects.toThrow(/rls/);
  });
});

describe('saveSavingsGoal', () => {
  // 「今月の目標」は member×月 で 1 つ。設定し直しても行が増えない。
  it('member×月 の一意制約で upsert する', async () => {
    const { client, queries } = makeSupabaseMock({ savings_goals: { data: null, error: null } });
    await saveSavingsGoal(client, {
      householdId: 'main',
      memberId: 'yururi',
      month: '2026-07-01',
      targetAmount: 30000,
    });

    const args = argsOf(queries.savings_goals, 'upsert');
    expect(args?.[0]).toEqual({
      household_id: 'main',
      member_id: 'yururi',
      period_month: '2026-07-01',
      target_amount: 30000,
    });
    expect(args?.[1]).toEqual({ onConflict: 'member_id,period_month' });
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({ savings_goals: { data: null, error: { message: 'x' } } });
    await expect(
      saveSavingsGoal(client, {
        householdId: 'main',
        memberId: 'yururi',
        month: '2026-07-01',
        targetAmount: 1,
      }),
    ).rejects.toThrow(/x/);
  });
});

describe('deleteSavingsGoal', () => {
  it('member×月 の行を消す', async () => {
    const { client, queries } = makeSupabaseMock({ savings_goals: { data: null, error: null } });
    await deleteSavingsGoal(client, 'yururi', '2026-07-01');

    expect(queries.savings_goals.calls.some((c) => c.method === 'delete')).toBe(true);
    const eqs = queries.savings_goals.calls.filter((c) => c.method === 'eq');
    expect(eqs.map((c) => c.args)).toEqual([
      ['member_id', 'yururi'],
      ['period_month', '2026-07-01'],
    ]);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({ savings_goals: { data: null, error: { message: 'x' } } });
    await expect(deleteSavingsGoal(client, 'yururi', '2026-07-01')).rejects.toThrow(/x/);
  });
});

describe('updateOpeningBalance', () => {
  it('自分の profile の初期残高を更新する', async () => {
    const { client, queries } = makeSupabaseMock({ profiles: { data: null, error: null } });
    await updateOpeningBalance(client, 'yururi', 50000);

    expect(argsOf(queries.profiles, 'update')?.[0]).toEqual({ opening_balance: 50000 });
    expect(argsOf(queries.profiles, 'eq')).toEqual(['member_id', 'yururi']);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({ profiles: { data: null, error: { message: 'rls' } } });
    await expect(updateOpeningBalance(client, 'yururi', 1)).rejects.toThrow(/rls/);
  });
});
