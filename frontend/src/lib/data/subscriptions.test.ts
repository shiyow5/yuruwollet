import { describe, expect, it } from 'vitest';
import {
  listSubscriptions,
  getLatestFxRate,
  getSubscriptionMonthlyTotal,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  getSubscriptionPayments,
} from './subscriptions';
import { makeSupabaseMock, argsOf } from '../../test/supabaseMock';
import type { Subscription, SubscriptionDraft } from '../subscriptions/types';

function sub(over: Partial<Subscription> = {}): Subscription {
  return {
    id: 's1',
    household_id: 'main',
    owner_member_id: 'yururi',
    name: 'Netflix',
    currency: 'JPY',
    original_amount: 1490,
    amount_jpy: 1490,
    fx_rate: null,
    fx_rate_date: null,
    cycle: 'monthly',
    next_renewal_date: '2026-08-15',
    renewal_anchor_day: 15,
    status: 'active',
    monthly_amount_jpy: 1490,
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
    ...over,
  };
}

const jpyDraft: SubscriptionDraft = {
  name: 'Netflix',
  currency: 'JPY',
  originalAmount: 1490,
  cycle: 'monthly',
  nextRenewalDate: '2026-08-15',
  status: 'active',
};

const usdDraft: SubscriptionDraft = {
  ...jpyDraft,
  name: 'ChatGPT',
  currency: 'USD',
  originalAmount: 20,
};

describe('listSubscriptions', () => {
  it('owner で絞り更新日順', async () => {
    const rows = [sub(), sub({ id: 's2' })];
    const { client, queries } = makeSupabaseMock({ subscriptions: { data: rows, error: null } });
    const result = await listSubscriptions(client, 'yururi');
    expect(result).toEqual(rows);
    expect(argsOf(queries.subscriptions, 'eq')).toEqual(['owner_member_id', 'yururi']);
    expect(queries.subscriptions.calls.filter((c) => c.method === 'order')).toHaveLength(2);
  });
  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({ subscriptions: { data: null, error: { message: 'x' } } });
    await expect(listSubscriptions(client, 'yururi')).rejects.toThrow(/x/);
  });
});

describe('getLatestFxRate', () => {
  it('USD/JPY の最新を取得', async () => {
    const { client, queries } = makeSupabaseMock({
      fx_rates: { data: { rate: '150.000000', rate_date: '2026-07-13' }, error: null },
    });
    const fx = await getLatestFxRate(client);
    expect(fx).toEqual({ rate: 150, rateDate: '2026-07-13' });
    const eqCalls = queries.fx_rates.calls.filter((c) => c.method === 'eq');
    expect(eqCalls.map((c) => c.args)).toEqual([
      ['base', 'USD'],
      ['quote', 'JPY'],
    ]);
  });
  it('無ければ null', async () => {
    const { client } = makeSupabaseMock({ fx_rates: { data: null, error: null } });
    expect(await getLatestFxRate(client)).toBeNull();
  });
  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({ fx_rates: { data: null, error: { message: 'fx' } } });
    await expect(getLatestFxRate(client)).rejects.toThrow(/fx/);
  });
});

describe('getSubscriptionMonthlyTotal', () => {
  it('member の合計を返す', async () => {
    const { client } = makeSupabaseMock({
      v_subscription_monthly_total: {
        data: { household_id: 'main', member_id: 'yururi', monthly_total_jpy: 12480 },
        error: null,
      },
    });
    expect(await getSubscriptionMonthlyTotal(client, 'yururi')).toBe(12480);
  });
  it('該当なしは 0', async () => {
    const { client } = makeSupabaseMock({
      v_subscription_monthly_total: { data: null, error: null },
    });
    expect(await getSubscriptionMonthlyTotal(client, 'yururi')).toBe(0);
  });
  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({
      v_subscription_monthly_total: { data: null, error: { message: 'tot' } },
    });
    await expect(getSubscriptionMonthlyTotal(client, 'yururi')).rejects.toThrow(/tot/);
  });
});

describe('createSubscription', () => {
  it('JPY: amount_jpy 丸め・fx null で insert', async () => {
    const { client, queries } = makeSupabaseMock({ subscriptions: { data: sub(), error: null } });
    await createSubscription(client, jpyDraft, null, {
      householdId: 'main',
      ownerMemberId: 'yururi',
    });
    expect(argsOf(queries.subscriptions, 'insert')?.[0]).toMatchObject({
      household_id: 'main',
      owner_member_id: 'yururi',
      currency: 'JPY',
      amount_jpy: 1490,
      fx_rate: null,
      fx_rate_date: null,
    });
  });

  it('USD: レートで換算し fx を保存', async () => {
    const created = sub({ currency: 'USD', original_amount: 20, amount_jpy: 3000, fx_rate: 150 });
    const { client, queries } = makeSupabaseMock({ subscriptions: { data: created, error: null } });
    await createSubscription(
      client,
      usdDraft,
      { rate: 150, rateDate: '2026-07-13' },
      {
        householdId: 'main',
        ownerMemberId: 'yururi',
      },
    );
    expect(argsOf(queries.subscriptions, 'insert')?.[0]).toMatchObject({
      currency: 'USD',
      original_amount: 20,
      amount_jpy: 3000,
      fx_rate: 150,
      fx_rate_date: '2026-07-13',
    });
  });

  it('USD でレート未取得なら投げる（DB へ行かない）', async () => {
    const { client, queries } = makeSupabaseMock({ subscriptions: { data: null, error: null } });
    await expect(
      createSubscription(client, usdDraft, null, { householdId: 'main', ownerMemberId: 'yururi' }),
    ).rejects.toThrow(/USD/);
    expect(queries.subscriptions).toBeUndefined();
  });

  it('DB error は投げる', async () => {
    const { client } = makeSupabaseMock({
      subscriptions: { data: null, error: { message: 'rls' } },
    });
    await expect(
      createSubscription(client, jpyDraft, null, { householdId: 'main', ownerMemberId: 'yururi' }),
    ).rejects.toThrow(/rls/);
  });
});

describe('updateSubscription', () => {
  it('id で更新し再スナップ', async () => {
    const updated = sub({ amount_jpy: 1600 });
    const { client, queries } = makeSupabaseMock({ subscriptions: { data: updated, error: null } });
    await updateSubscription(client, 's1', { ...jpyDraft, originalAmount: 1600 }, null);
    expect(argsOf(queries.subscriptions, 'eq')).toEqual(['id', 's1']);
    expect(argsOf(queries.subscriptions, 'update')?.[0]).toMatchObject({ amount_jpy: 1600 });
  });
});

// 削除は RPC 経由（#71）。クライアントから 2 回に分けて消すことはできない
// （削除ポリシーが subscription_id is null を要求するため。migration のコメント参照）。
describe('deleteSubscription', () => {
  it('既定では支払いを残す（p_delete_payments = false）', async () => {
    const { client, rpcs } = makeSupabaseMock(
      {},
      { delete_subscription: { data: 0, error: null } },
    );
    const deleted = await deleteSubscription(client, 's1');
    expect(deleted).toBe(0);
    expect(rpcs.delete_subscription.calls[0].args).toEqual([
      'delete_subscription',
      { p_subscription_id: 's1', p_delete_payments: false },
    ]);
  });

  it('支払いも消す指定を渡し、消した件数を返す', async () => {
    const { client, rpcs } = makeSupabaseMock(
      {},
      { delete_subscription: { data: 3, error: null } },
    );
    const deleted = await deleteSubscription(client, 's1', true);
    expect(deleted).toBe(3);
    expect(rpcs.delete_subscription.calls[0].args).toEqual([
      'delete_subscription',
      { p_subscription_id: 's1', p_delete_payments: true },
    ]);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock(
      {},
      { delete_subscription: { data: null, error: { message: 'fail' } } },
    );
    await expect(deleteSubscription(client, 's1')).rejects.toThrow(/fail/);
  });
});

describe('getSubscriptionPayments', () => {
  it('そのサブスクの支払いの件数と合計を返す', async () => {
    const { client, queries } = makeSupabaseMock({
      transactions: { data: [{ amount: 1000 }, { amount: 234 }], error: null },
    });
    const got = await getSubscriptionPayments(client, 's1');
    expect(got).toEqual({ count: 2, total: 1234 });
    expect(argsOf(queries.transactions, 'eq')).toEqual(['subscription_id', 's1']);
  });

  it('支払いが無ければ 0 件・0 円', async () => {
    const { client } = makeSupabaseMock({ transactions: { data: [], error: null } });
    expect(await getSubscriptionPayments(client, 's1')).toEqual({ count: 0, total: 0 });
  });

  it('error は投げる（0 件と区別する）', async () => {
    const { client } = makeSupabaseMock({
      transactions: { data: null, error: { message: 'nope' } },
    });
    await expect(getSubscriptionPayments(client, 's1')).rejects.toThrow(/nope/);
  });
});
