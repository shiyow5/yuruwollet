import { describe, expect, it } from 'vitest';
import {
  listAccounts,
  createAccount,
  archiveAccount,
  unarchiveAccount,
  deleteAccount,
  getAccountUsage,
} from './accounts';
import { makeSupabaseMock, argsOf } from '../../test/supabaseMock';
import type { Account, AccountDraft } from '../ledger/types';

function acc(over: Partial<Account> = {}): Account {
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

describe('listAccounts', () => {
  it('archived も含め sort_order→name 順で取得（履歴解決のため）', async () => {
    const rows = [
      acc(),
      acc({ id: 'a2', name: '銀行' }),
      acc({ id: 'a3', name: '旧', is_archived: true }),
    ];
    const { client, queries } = makeSupabaseMock({ accounts: { data: rows, error: null } });
    const result = await listAccounts(client);
    expect(result).toEqual(rows);
    // is_archived フィルタは付けない（archived も返す）
    expect(queries.accounts.calls.some((c) => c.method === 'eq')).toBe(false);
    expect(queries.accounts.calls.filter((c) => c.method === 'order')).toHaveLength(2);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({ accounts: { data: null, error: { message: 'x' } } });
    await expect(listAccounts(client)).rejects.toThrow(/x/);
  });
});

describe('createAccount', () => {
  const draft: AccountDraft = { name: '楽天カード', icon: 'credit_card' };

  it('household 固定で insert', async () => {
    const created = acc({ name: '楽天カード', icon: 'credit_card' });
    const { client, queries } = makeSupabaseMock({ accounts: { data: created, error: null } });
    const result = await createAccount(client, draft, { householdId: 'main' });
    expect(result).toEqual(created);
    expect(argsOf(queries.accounts, 'insert')?.[0]).toEqual({
      household_id: 'main',
      name: '楽天カード',
      icon: 'credit_card',
    });
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({ accounts: { data: null, error: { message: 'dup' } } });
    await expect(createAccount(client, draft, { householdId: 'main' })).rejects.toThrow(/dup/);
  });
});

describe('archiveAccount', () => {
  it('is_archived=true に更新', async () => {
    const { client, queries } = makeSupabaseMock({ accounts: { data: null, error: null } });
    await archiveAccount(client, 'a1');
    expect(argsOf(queries.accounts, 'update')?.[0]).toEqual({ is_archived: true });
    expect(argsOf(queries.accounts, 'eq')).toEqual(['id', 'a1']);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({ accounts: { data: null, error: { message: 'no' } } });
    await expect(archiveAccount(client, 'a1')).rejects.toThrow(/no/);
  });
});

describe('unarchiveAccount', () => {
  it('is_archived=false に更新', async () => {
    const { client, queries } = makeSupabaseMock({ accounts: { data: null, error: null } });
    await unarchiveAccount(client, 'a1');
    expect(argsOf(queries.accounts, 'update')?.[0]).toEqual({ is_archived: false });
    expect(argsOf(queries.accounts, 'eq')).toEqual(['id', 'a1']);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({ accounts: { data: null, error: { message: 'no' } } });
    await expect(unarchiveAccount(client, 'a1')).rejects.toThrow(/no/);
  });
});

describe('deleteAccount', () => {
  it('id を条件に削除する（system/default の保護は無い）', async () => {
    const { client, queries } = makeSupabaseMock({ accounts: { data: null, error: null } });
    await deleteAccount(client, 'a1');
    expect(queries.accounts.calls.some((c) => c.method === 'delete')).toBe(true);
    expect(argsOf(queries.accounts, 'eq')).toEqual(['id', 'a1']);
  });

  it('error は投げる（FK restrict 等）', async () => {
    const { client } = makeSupabaseMock({ accounts: { data: null, error: { message: 'fk' } } });
    await expect(deleteAccount(client, 'a1')).rejects.toThrow(/fk/);
  });
});

describe('getAccountUsage', () => {
  it('そのアカウントを在り処にした取引の件数を返す', async () => {
    const { client, queries } = makeSupabaseMock({
      transactions: { data: null, count: 4, error: null },
    });
    expect(await getAccountUsage(client, 'a1')).toBe(4);
    expect(argsOf(queries.transactions, 'eq')).toEqual(['account_id', 'a1']);
  });

  it('count が null なら 0', async () => {
    const { client } = makeSupabaseMock({ transactions: { data: null, count: null, error: null } });
    expect(await getAccountUsage(client, 'a1')).toBe(0);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({ transactions: { data: null, error: { message: 'x' } } });
    await expect(getAccountUsage(client, 'a1')).rejects.toThrow(/x/);
  });
});
