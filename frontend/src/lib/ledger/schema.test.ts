import { describe, expect, it } from 'vitest';
import { validateTransactionForm, validateCategoryForm, validateAccountForm } from './schema';

const validUuid = '11111111-1111-1111-1111-111111111111';
const validAccountUuid = '22222222-2222-4222-8222-222222222222';

describe('validateTransactionForm', () => {
  const base = {
    type: 'expense',
    amount: '4,500',
    categoryId: validUuid,
    accountId: validAccountUuid,
    occurredOn: '2026-07-13',
    memo: 'スーパー',
  };

  it('正常系を検証・正規化する（¥表記/カンマを数値化）', () => {
    const r = validateTransactionForm(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        type: 'expense',
        amount: 4500,
        categoryId: validUuid,
        accountId: validAccountUuid,
        occurredOn: '2026-07-13',
        memo: 'スーパー',
      });
    }
  });

  it('categoryId 空文字は null に正規化', () => {
    const r = validateTransactionForm({ ...base, categoryId: '' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.categoryId).toBeNull();
  });

  it('accountId 空文字は null に正規化（#98）', () => {
    const r = validateTransactionForm({ ...base, accountId: '' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.accountId).toBeNull();
  });

  it('不正な accountId を弾く（#98）', () => {
    const r = validateTransactionForm({ ...base, accountId: 'not-a-uuid' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.accountId).toBeDefined();
  });

  it('金額が無効なら専用メッセージ', () => {
    const r = validateTransactionForm({ ...base, amount: 'abc' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.amount).toBe('金額を入力してください');
  });

  it('金額 0 以下は弾く', () => {
    const r = validateTransactionForm({ ...base, amount: '0' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.amount).toContain('1円以上');
  });

  it('小数金額は整数エラー', () => {
    const r = validateTransactionForm({ ...base, amount: '12.5' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.amount).toContain('整数');
  });

  it('不正な日付を弾く', () => {
    const r = validateTransactionForm({ ...base, occurredOn: '2026/07/13' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.occurredOn).toBeDefined();
  });

  it('不正な type を弾く', () => {
    const r = validateTransactionForm({ ...base, type: 'transfer' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.type).toBeDefined();
  });

  it('メモ超過を弾く', () => {
    const r = validateTransactionForm({ ...base, memo: 'あ'.repeat(201) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.memo).toBeDefined();
  });

  it('不正な categoryId (uuidでない) を弾く', () => {
    const r = validateTransactionForm({ ...base, categoryId: 'not-a-uuid' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.categoryId).toBeDefined();
  });
});

describe('validateCategoryForm', () => {
  it('正常系（icon 既定は label）', () => {
    const r = validateCategoryForm({ kind: 'expense', name: '食費' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ kind: 'expense', name: '食費', icon: 'label' });
  });

  it('名前前後の空白をトリム', () => {
    const r = validateCategoryForm({ kind: 'income', name: '  給与  ', icon: 'payments' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ kind: 'income', name: '給与', icon: 'payments' });
  });

  it('空名を弾く', () => {
    const r = validateCategoryForm({ kind: 'expense', name: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.name).toBeDefined();
  });

  it('長すぎる名を弾く', () => {
    const r = validateCategoryForm({ kind: 'expense', name: 'あ'.repeat(21) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.name).toBeDefined();
  });

  it('不正な kind を弾く', () => {
    const r = validateCategoryForm({ kind: 'system', name: '残高調整' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.kind).toBeDefined();
  });

  it('パレット内のアイコンは許可', () => {
    const r = validateCategoryForm({ kind: 'expense', name: '交通費', icon: 'directions_bus' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.icon).toBe('directions_bus');
  });

  it('パレット外のアイコンを弾く（#9: フォントに無い名前は文字化けする）', () => {
    const r = validateCategoryForm({ kind: 'expense', name: '謎', icon: 'not_a_real_icon' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.icon).toBeDefined();
  });
});

describe('validateAccountForm（#98）', () => {
  it('正常系（icon 既定は account_balance_wallet）', () => {
    const r = validateAccountForm({ name: '現金' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ name: '現金', icon: 'account_balance_wallet' });
  });

  it('名前前後の空白をトリム', () => {
    const r = validateAccountForm({ name: '  ○○銀行  ', icon: 'account_balance' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ name: '○○銀行', icon: 'account_balance' });
  });

  it('空名を弾く', () => {
    const r = validateAccountForm({ name: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.name).toBeDefined();
  });

  it('長すぎる名を弾く', () => {
    const r = validateAccountForm({ name: 'あ'.repeat(21) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.name).toBeDefined();
  });

  it('アカウントパレット内のアイコンは許可', () => {
    const r = validateAccountForm({ name: 'クレカ', icon: 'credit_card' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.icon).toBe('credit_card');
  });

  it('アカウントパレット外のアイコンを弾く（カテゴリ専用アイコンも不可）', () => {
    const r = validateAccountForm({ name: '謎', icon: 'restaurant' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.icon).toBeDefined();
  });
});
