import { describe, expect, it } from 'vitest';
import { resolveAccount, selectableAccounts } from './accounts';
import type { Account } from './types';

function acc(over: Partial<Account>): Account {
  return {
    id: 'a1',
    household_id: 'main',
    name: '現金',
    icon: 'payments',
    sort_order: 10,
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const accounts: Account[] = [
  acc({ id: 'a1', name: '現金', icon: 'payments' }),
  acc({ id: 'a2', name: '銀行', icon: null }),
  acc({ id: 'a3', name: '旧カード', is_archived: true }),
];

describe('resolveAccount', () => {
  it('id から name/icon を解決', () => {
    expect(resolveAccount(accounts, 'a1')).toEqual({ name: '現金', icon: 'payments' });
  });
  it('icon が null なら account_balance_wallet フォールバック', () => {
    expect(resolveAccount(accounts, 'a2')).toEqual({
      name: '銀行',
      icon: 'account_balance_wallet',
    });
  });
  it('null は未設定', () => {
    expect(resolveAccount(accounts, null)).toEqual({ name: '未設定', icon: 'help' });
  });
  it('存在しない id も未設定', () => {
    expect(resolveAccount(accounts, 'zzz')).toEqual({ name: '未設定', icon: 'help' });
  });
});

describe('selectableAccounts', () => {
  it('archived を除く（収入/支出で分けない）', () => {
    const result = selectableAccounts(accounts).map((a) => a.id);
    expect(result).toEqual(['a1', 'a2']);
  });
});
