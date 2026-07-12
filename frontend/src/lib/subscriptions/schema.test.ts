import { describe, expect, it } from 'vitest';
import { validateSubscriptionForm } from './schema';

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
    const r = validateSubscriptionForm(base);
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
    const r = validateSubscriptionForm({ ...base, currency: 'USD', amount: '$9.99' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.currency).toBe('USD');
      expect(r.value.originalAmount).toBeCloseTo(9.99);
    }
  });

  it('名前の前後空白をトリム、空名は弾く', () => {
    expect(validateSubscriptionForm({ ...base, name: '  ' }).ok).toBe(false);
    const r = validateSubscriptionForm({ ...base, name: '  Spotify  ' });
    if (r.ok) expect(r.value.name).toBe('Spotify');
  });

  it('小数第3位以上の金額を弾く（numeric(12,2) 整合）', () => {
    const r = validateSubscriptionForm({ ...base, currency: 'USD', amount: '9.996' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.originalAmount).toContain('小数第2位');
  });

  it('小数第2位までは許可', () => {
    expect(validateSubscriptionForm({ ...base, currency: 'USD', amount: '9.99' }).ok).toBe(true);
  });

  it('金額 0 以下を弾く', () => {
    const r = validateSubscriptionForm({ ...base, amount: '0' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.originalAmount).toContain('0より大きい');
  });

  it('金額が数値でないと専用メッセージ', () => {
    const r = validateSubscriptionForm({ ...base, amount: 'abc' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.originalAmount).toBe('金額を入力してください');
  });

  it('不正な日付を弾く', () => {
    const r = validateSubscriptionForm({ ...base, nextRenewalDate: '2026/08/15' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.nextRenewalDate).toBeDefined();
  });

  it('不正な通貨/サイクル/ステータスを弾く', () => {
    expect(validateSubscriptionForm({ ...base, currency: 'EUR' }).ok).toBe(false);
    expect(validateSubscriptionForm({ ...base, cycle: 'weekly' }).ok).toBe(false);
    expect(validateSubscriptionForm({ ...base, status: 'paused' }).ok).toBe(false);
  });

  it('長すぎる名前を弾く', () => {
    const r = validateSubscriptionForm({ ...base, name: 'あ'.repeat(41) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.name).toBeDefined();
  });
});
