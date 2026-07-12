import { describe, expect, it } from 'vitest';
import {
  optimisticId,
  isOptimisticId,
  makeOptimisticTransaction,
  prependTransaction,
} from './optimistic';
import type { Transaction, TransactionDraft } from './types';

const draft: TransactionDraft = {
  type: 'expense',
  amount: 4500,
  categoryId: 'c1',
  occurredOn: '2026-07-13',
  memo: 'スーパー',
};

describe('optimisticId / isOptimisticId', () => {
  it('接頭辞付き id を生成し判定できる', () => {
    const id = optimisticId('abc');
    expect(id).toBe('optimistic-abc');
    expect(isOptimisticId(id)).toBe(true);
  });
  it('通常の id は楽観扱いしない', () => {
    expect(isOptimisticId('11111111-1111-1111-1111-111111111111')).toBe(false);
  });
});

describe('makeOptimisticTransaction', () => {
  it('ドラフト + コンテキストから楽観行を作る', () => {
    const txn = makeOptimisticTransaction(draft, {
      id: 'optimistic-1',
      householdId: 'main',
      ownerMemberId: 'yururi',
      createdAt: '2026-07-13T05:30:00Z',
    });
    expect(txn).toEqual({
      id: 'optimistic-1',
      household_id: 'main',
      owner_member_id: 'yururi',
      type: 'expense',
      amount: 4500,
      category_id: 'c1',
      memo: 'スーパー',
      occurred_on: '2026-07-13',
      is_system_generated: false,
      created_at: '2026-07-13T05:30:00Z',
      updated_at: '2026-07-13T05:30:00Z',
    });
  });
});

describe('prependTransaction', () => {
  const existing = { id: 'a' } as Transaction;
  const fresh = { id: 'b' } as Transaction;

  it('先頭に差し込む', () => {
    expect(prependTransaction([existing], fresh).map((t) => t.id)).toEqual(['b', 'a']);
  });
  it('undefined でも動く', () => {
    expect(prependTransaction(undefined, fresh)).toEqual([fresh]);
  });
  it('元配列を変更しない（イミュータブル）', () => {
    const list = [existing];
    prependTransaction(list, fresh);
    expect(list).toEqual([existing]);
  });
});
