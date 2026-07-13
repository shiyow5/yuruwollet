import { describe, expect, it } from 'vitest';
import {
  listTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from './transactions';
import { makeSupabaseMock, argsOf } from '../../test/supabaseMock';
import type { Transaction, TransactionDraft } from '../ledger/types';

function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    household_id: 'main',
    owner_member_id: 'yururi',
    type: 'expense',
    amount: 4500,
    category_id: 'c1',
    memo: 'スーパー',
    occurred_on: '2026-07-13',
    is_system_generated: false,
    subscription_id: null,
    created_at: '2026-07-13T05:30:00Z',
    updated_at: '2026-07-13T05:30:00Z',
    ...over,
  };
}

const draft: TransactionDraft = {
  type: 'expense',
  amount: 4500,
  categoryId: 'c1',
  occurredOn: '2026-07-13',
  memo: 'スーパー',
};

describe('listTransactions', () => {
  it('member と月で絞り込み、limit を付ける', async () => {
    const rows = [txn(), txn({ id: 't2' })];
    const { client, queries } = makeSupabaseMock({ transactions: { data: rows, error: null } });
    const result = await listTransactions(client, {
      memberId: 'yururi',
      month: '2026-07-01',
      limit: 5,
    });

    expect(result).toEqual(rows);
    const q = queries.transactions;
    expect(argsOf(q, 'eq')).toEqual(['owner_member_id', 'yururi']);
    // 月境界: 当月初 <= occurred_on < 翌月初
    expect(q.calls.find((c) => c.method === 'gte')?.args).toEqual(['occurred_on', '2026-07-01']);
    expect(q.calls.find((c) => c.method === 'lt')?.args).toEqual(['occurred_on', '2026-08-01']);
    expect(argsOf(q, 'limit')).toEqual([5]);
    expect(q.calls.filter((c) => c.method === 'order')).toHaveLength(2);
  });

  it('月未指定なら期間フィルタを付けない', async () => {
    const { client, queries } = makeSupabaseMock({ transactions: { data: [], error: null } });
    await listTransactions(client, { memberId: 'yururi' });
    const q = queries.transactions;
    expect(q.calls.some((c) => c.method === 'gte')).toBe(false);
    expect(q.calls.some((c) => c.method === 'lt')).toBe(false);
    expect(q.calls.some((c) => c.method === 'limit')).toBe(false);
  });

  it('data が null なら空配列', async () => {
    const { client } = makeSupabaseMock({ transactions: { data: null, error: null } });
    expect(await listTransactions(client, { memberId: 'yururi' })).toEqual([]);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({
      transactions: { data: null, error: { message: 'boom' } },
    });
    await expect(listTransactions(client, { memberId: 'yururi' })).rejects.toThrow(/boom/);
  });
});

describe('createTransaction', () => {
  it('household/owner を固定して insert し行を返す', async () => {
    const created = txn();
    const { client, queries } = makeSupabaseMock({
      transactions: { data: created, error: null },
    });
    const result = await createTransaction(client, draft, {
      householdId: 'main',
      ownerMemberId: 'yururi',
    });
    expect(result).toEqual(created);
    const payload = argsOf(queries.transactions, 'insert')?.[0];
    expect(payload).toMatchObject({
      household_id: 'main',
      owner_member_id: 'yururi',
      type: 'expense',
      amount: 4500,
      category_id: 'c1',
      memo: 'スーパー',
      occurred_on: '2026-07-13',
    });
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({
      transactions: { data: null, error: { message: 'rls denied' } },
    });
    await expect(
      createTransaction(client, draft, { householdId: 'main', ownerMemberId: 'yururi' }),
    ).rejects.toThrow(/rls denied/);
  });
});

describe('updateTransaction', () => {
  it('id で更新し行を返す', async () => {
    const updated = txn({ amount: 9999 });
    const { client, queries } = makeSupabaseMock({
      transactions: { data: updated, error: null },
    });
    const result = await updateTransaction(client, 't1', { ...draft, amount: 9999 });
    expect(result).toEqual(updated);
    expect(argsOf(queries.transactions, 'eq')).toEqual(['id', 't1']);
    expect(argsOf(queries.transactions, 'update')?.[0]).toMatchObject({ amount: 9999 });
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({
      transactions: { data: null, error: { message: 'nope' } },
    });
    await expect(updateTransaction(client, 't1', draft)).rejects.toThrow(/nope/);
  });
});

describe('deleteTransaction', () => {
  it('id で削除', async () => {
    const { client, queries } = makeSupabaseMock({ transactions: { data: null, error: null } });
    await deleteTransaction(client, 't1');
    expect(argsOf(queries.transactions, 'eq')).toEqual(['id', 't1']);
    expect(queries.transactions.calls.some((c) => c.method === 'delete')).toBe(true);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({
      transactions: { data: null, error: { message: 'fail' } },
    });
    await expect(deleteTransaction(client, 't1')).rejects.toThrow(/fail/);
  });
});
