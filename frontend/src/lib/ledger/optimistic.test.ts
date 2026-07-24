import { describe, expect, it } from 'vitest';
import {
  optimisticId,
  isOptimisticId,
  makeOptimisticTransaction,
  prependTransaction,
  keyAcceptsTransaction,
} from './optimistic';
import type { Transaction, TransactionDraft } from './types';

const draft: TransactionDraft = {
  type: 'expense',
  amount: 4500,
  categoryId: 'c1',
  accountId: 'a1',
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
      // ユーザーの手入力はサブスク由来ではない（サブスクの支払いは cron だけが作る）
      subscription_id: null,
      type: 'expense',
      amount: 4500,
      category_id: 'c1',
      account_id: 'a1',
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

describe('keyAcceptsTransaction', () => {
  it('all / recent は常に対象', () => {
    expect(keyAcceptsTransaction(['transactions', 'yururi', 'all'], '2026-07-13')).toBe(true);
    expect(keyAcceptsTransaction(['transactions', 'yururi', 'recent', 5], '2026-01-02')).toBe(true);
  });
  it('月別は occurred_on が属す月のみ対象', () => {
    expect(keyAcceptsTransaction(['transactions', 'yururi', '2026-07-01'], '2026-07-13')).toBe(
      true,
    );
    expect(keyAcceptsTransaction(['transactions', 'yururi', '2026-06-01'], '2026-07-13')).toBe(
      false,
    );
  });
  it('想定外の scope は対象外', () => {
    expect(keyAcceptsTransaction(['transactions', 'yururi'], '2026-07-13')).toBe(false);
    expect(keyAcceptsTransaction(['transactions', 'yururi', 42], '2026-07-13')).toBe(false);
  });
});
