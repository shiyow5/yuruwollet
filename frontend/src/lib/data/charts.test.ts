import { describe, expect, it } from 'vitest';
import { listMonthlySummaries, listSavingsHistory, listSubscriptionSlices } from './charts';
import { makeSupabaseMock, argsOf } from '../../test/supabaseMock';

describe('listMonthlySummaries', () => {
  it('member と開始月で絞り、古い順に取る', async () => {
    const rows = [{ month: '2026-07-01', income: 1, expense: 2, net: -1 }];
    const { client, queries } = makeSupabaseMock({
      v_monthly_summary: { data: rows, error: null },
    });
    expect(await listMonthlySummaries(client, 'yururi', '2025-08-01')).toEqual(rows);

    expect(argsOf(queries.v_monthly_summary, 'eq')).toEqual(['member_id', 'yururi']);
    expect(argsOf(queries.v_monthly_summary, 'gte')).toEqual(['month', '2025-08-01']);
    expect(argsOf(queries.v_monthly_summary, 'order')).toEqual(['month', { ascending: true }]);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({
      v_monthly_summary: { data: null, error: { message: 'x' } },
    });
    await expect(listMonthlySummaries(client, 'yururi', '2025-08-01')).rejects.toThrow(/x/);
  });
});

describe('listSavingsHistory', () => {
  it('member と開始月で絞り、古い順に取る', async () => {
    const { client, queries } = makeSupabaseMock({ v_savings_progress: { data: [], error: null } });
    await listSavingsHistory(client, 'yururi', '2025-08-01');

    expect(argsOf(queries.v_savings_progress, 'gte')).toEqual(['period_month', '2025-08-01']);
    expect(argsOf(queries.v_savings_progress, 'order')).toEqual([
      'period_month',
      { ascending: true },
    ]);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({
      v_savings_progress: { data: null, error: { message: 'x' } },
    });
    await expect(listSavingsHistory(client, 'yururi', '2025-08-01')).rejects.toThrow(/x/);
  });
});

describe('listSubscriptionSlices', () => {
  // 解約検討中は月換算合計から除外しているので、内訳からも外す（合計とグラフが食い違わない）
  it('解約検討中を除外し、月換算額の大きい順に取る', async () => {
    const rows = [{ name: 'Netflix', monthly_amount_jpy: 1490 }];
    const { client, queries } = makeSupabaseMock({ subscriptions: { data: rows, error: null } });
    expect(await listSubscriptionSlices(client, 'yururi')).toEqual([
      { name: 'Netflix', monthly: 1490 },
    ]);

    expect(argsOf(queries.subscriptions, 'eq')).toEqual(['owner_member_id', 'yururi']);
    expect(argsOf(queries.subscriptions, 'neq')).toEqual(['status', 'considering_cancel']);
  });

  it('月換算が null なら 0 として扱う', async () => {
    const { client } = makeSupabaseMock({
      subscriptions: { data: [{ name: 'X', monthly_amount_jpy: null }], error: null },
    });
    expect(await listSubscriptionSlices(client, 'yururi')).toEqual([{ name: 'X', monthly: 0 }]);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({ subscriptions: { data: null, error: { message: 'x' } } });
    await expect(listSubscriptionSlices(client, 'yururi')).rejects.toThrow(/x/);
  });
});
