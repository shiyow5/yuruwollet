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
