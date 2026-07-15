import { describe, expect, it } from 'vitest';
import { validateSubscriptionForm } from './schema';

// テストは実時計に依存させない。検証には固定の「今日」を渡す。
const TODAY = '2026-07-15';

const base = {
  name: 'Netflix',
  currency: 'JPY',
  amount: '1,490',
  cycle: 'monthly',
  nextRenewalDate: '2026-08-15',
  status: 'active',
};

describe('validateSubscriptionForm', () => {
  it('正常系を正規化（カンマ除去）', () => {
    const r = validateSubscriptionForm(base, TODAY);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        name: 'Netflix',
        currency: 'JPY',
        originalAmount: 1490,
        cycle: 'monthly',
        nextRenewalDate: '2026-08-15',
        status: 'active',
      });
    }
  });

  it('USD + 小数金額', () => {
    const r = validateSubscriptionForm({ ...base, currency: 'USD', amount: '$9.99' }, TODAY);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.currency).toBe('USD');
      expect(r.value.originalAmount).toBeCloseTo(9.99);
    }
  });

  it('名前の前後空白をトリム、空名は弾く', () => {
    expect(validateSubscriptionForm({ ...base, name: '  ' }, TODAY).ok).toBe(false);
    const r = validateSubscriptionForm({ ...base, name: '  Spotify  ' }, TODAY);
    if (r.ok) expect(r.value.name).toBe('Spotify');
  });

  it('小数第3位以上の金額を弾く（numeric(12,2) 整合）', () => {
    const r = validateSubscriptionForm({ ...base, currency: 'USD', amount: '9.996' }, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.originalAmount).toContain('小数第2位');
  });

  it('小数第2位までは許可', () => {
    expect(validateSubscriptionForm({ ...base, currency: 'USD', amount: '9.99' }, TODAY).ok).toBe(
      true,
    );
  });

  it('金額 0 以下を弾く', () => {
    const r = validateSubscriptionForm({ ...base, amount: '0' }, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.originalAmount).toContain('0より大きい');
  });

  it('金額が数値でないと専用メッセージ', () => {
    const r = validateSubscriptionForm({ ...base, amount: 'abc' }, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.originalAmount).toBe('金額を入力してください');
  });

  it('不正な日付を弾く', () => {
    const r = validateSubscriptionForm({ ...base, nextRenewalDate: '2026/08/15' }, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.nextRenewalDate).toBeDefined();
  });

  it('不正な通貨/サイクル/ステータスを弾く', () => {
    expect(validateSubscriptionForm({ ...base, currency: 'EUR' }, TODAY).ok).toBe(false);
    expect(validateSubscriptionForm({ ...base, cycle: 'weekly' }, TODAY).ok).toBe(false);
    expect(validateSubscriptionForm({ ...base, status: 'paused' }, TODAY).ok).toBe(false);
  });

  it('長すぎる名前を弾く', () => {
    const r = validateSubscriptionForm({ ...base, name: 'あ'.repeat(41) }, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.name).toBeDefined();
  });

  // ---- 次回更新日の下限（#65: 大きく過去だと精算ループが暴走する）----
  describe('次回更新日の下限', () => {
    it('今日は許可', () => {
      expect(validateSubscriptionForm({ ...base, nextRenewalDate: TODAY }, TODAY).ok).toBe(true);
    });

    it('未来日は許可', () => {
      expect(validateSubscriptionForm({ ...base, nextRenewalDate: '2027-01-01' }, TODAY).ok).toBe(
        true,
      );
    });

    it('monthly: 1 周期（1 ヶ月）前ちょうどは許可', () => {
      // 2026-07-15 の 1 ヶ月前 = 2026-06-15（境界は含む）
      expect(
        validateSubscriptionForm(
          { ...base, cycle: 'monthly', nextRenewalDate: '2026-06-15' },
          TODAY,
        ).ok,
      ).toBe(true);
    });

    it('monthly: 1 周期より前（2 ヶ月前）は弾く', () => {
      const r = validateSubscriptionForm(
        { ...base, cycle: 'monthly', nextRenewalDate: '2026-05-15' },
        TODAY,
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.nextRenewalDate).toContain('前');
    });

    it('yearly: 数ヶ月前は許可（1 年以内）', () => {
      expect(
        validateSubscriptionForm({ ...base, cycle: 'yearly', nextRenewalDate: '2026-01-15' }, TODAY)
          .ok,
      ).toBe(true);
    });

    it('yearly: 1 周期（1 年）より前は弾く', () => {
      const r = validateSubscriptionForm(
        { ...base, cycle: 'yearly', nextRenewalDate: '2025-06-15' },
        TODAY,
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.nextRenewalDate).toContain('前');
    });

    it('明らかに過去（1900 年）は弾く', () => {
      const r = validateSubscriptionForm({ ...base, nextRenewalDate: '1900-01-01' }, TODAY);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.nextRenewalDate).toBeDefined();
    });
  });
});
