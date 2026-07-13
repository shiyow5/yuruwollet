import { describe, expect, it } from 'vitest';
import { computeSubscriptionAmounts, monthlyEquivalent, isApproximate } from './fx';

describe('computeSubscriptionAmounts', () => {
  it('JPY はそのまま丸め、fx は null', () => {
    expect(computeSubscriptionAmounts('JPY', 1490, null)).toEqual({
      amountJpy: 1490,
      fxRate: null,
      fxRateDate: null,
    });
  });

  it('JPY の小数は四捨五入', () => {
    expect(computeSubscriptionAmounts('JPY', 1490.6, null)?.amountJpy).toBe(1491);
  });

  it('USD はレートで換算し fx を保存', () => {
    expect(computeSubscriptionAmounts('USD', 9.99, { rate: 150, rateDate: '2026-07-13' })).toEqual({
      amountJpy: 1499, // round(9.99 * 150) = round(1498.5) = 1499
      fxRate: 150,
      fxRateDate: '2026-07-13',
    });
  });

  it('USD でレート未取得なら null（登録不可）', () => {
    expect(computeSubscriptionAmounts('USD', 9.99, null)).toBeNull();
  });
});

describe('monthlyEquivalent', () => {
  it('毎月はそのまま', () => {
    expect(monthlyEquivalent(1490, 'monthly')).toBe(1490);
  });
  it('毎年は /12 四捨五入', () => {
    expect(monthlyEquivalent(12000, 'yearly')).toBe(1000);
    expect(monthlyEquivalent(1490, 'yearly')).toBe(124); // round(124.16)
  });
});

describe('isApproximate', () => {
  it('USD は概算', () => {
    expect(isApproximate('USD')).toBe(true);
    expect(isApproximate('JPY')).toBe(false);
  });
});
