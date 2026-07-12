import { describe, expect, it } from 'vitest';
import { queryKeys } from './queryKeys';

describe('queryKeys', () => {
  it('静的キー', () => {
    expect(queryKeys.profiles()).toEqual(['profiles']);
    expect(queryKeys.memberBalances()).toEqual(['memberBalances']);
    expect(queryKeys.categories()).toEqual(['categories']);
  });

  it('transactions は memberId と月（既定 all）を含む', () => {
    expect(queryKeys.transactions('yururi', '2026-07-01')).toEqual([
      'transactions',
      'yururi',
      '2026-07-01',
    ]);
    expect(queryKeys.transactions('yururi')).toEqual(['transactions', 'yururi', 'all']);
  });

  it('recentTransactions は transactions 接頭辞を共有する', () => {
    const key = queryKeys.recentTransactions('yururi', 5);
    expect(key).toEqual(['transactions', 'yururi', 'recent', 5]);
    // 一括 invalidate 用に接頭辞が transactions で揃っている
    expect(key[0]).toBe('transactions');
  });

  it('monthlySummary / categoryBreakdown は memberId×月', () => {
    expect(queryKeys.monthlySummary('shiyowo', '2026-07-01')).toEqual([
      'monthlySummary',
      'shiyowo',
      '2026-07-01',
    ]);
    expect(queryKeys.categoryBreakdown('shiyowo', '2026-07-01')).toEqual([
      'categoryBreakdown',
      'shiyowo',
      '2026-07-01',
    ]);
  });
});
