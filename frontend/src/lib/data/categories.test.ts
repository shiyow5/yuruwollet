import { describe, expect, it } from 'vitest';
import {
  listCategories,
  createCategory,
  archiveCategory,
  unarchiveCategory,
  deleteCategory,
  getCategoryUsage,
} from './categories';
import { makeSupabaseMock, argsOf } from '../../test/supabaseMock';
import type { Category, CategoryDraft } from '../ledger/types';

function cat(over: Partial<Category> = {}): Category {
  return {
    id: 'c1',
    household_id: 'main',
    kind: 'expense',
    name: '食費',
    icon: 'restaurant',
    sort_order: 0,
    is_system: false,
    is_default: false,
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('listCategories', () => {
  it('archived も含め kind→sort_order→name 順で取得（履歴解決のため）', async () => {
    const rows = [
      cat(),
      cat({ id: 'c2', name: '住宅' }),
      cat({ id: 'c3', name: '旧', is_archived: true }),
    ];
    const { client, queries } = makeSupabaseMock({ categories: { data: rows, error: null } });
    const result = await listCategories(client);
    expect(result).toEqual(rows);
    // is_archived フィルタは付けない（archived も返す）
    expect(queries.categories.calls.some((c) => c.method === 'eq')).toBe(false);
    expect(queries.categories.calls.filter((c) => c.method === 'order')).toHaveLength(3);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({ categories: { data: null, error: { message: 'x' } } });
    await expect(listCategories(client)).rejects.toThrow(/x/);
  });
});

describe('createCategory', () => {
  const draft: CategoryDraft = { kind: 'expense', name: '交際費', icon: 'local_cafe' };

  it('is_system=false 固定で insert', async () => {
    const created = cat({ name: '交際費', icon: 'local_cafe' });
    const { client, queries } = makeSupabaseMock({ categories: { data: created, error: null } });
    const result = await createCategory(client, draft, { householdId: 'main' });
    expect(result).toEqual(created);
    expect(argsOf(queries.categories, 'insert')?.[0]).toEqual({
      household_id: 'main',
      kind: 'expense',
      name: '交際費',
      icon: 'local_cafe',
      is_system: false,
    });
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({ categories: { data: null, error: { message: 'dup' } } });
    await expect(createCategory(client, draft, { householdId: 'main' })).rejects.toThrow(/dup/);
  });
});

describe('archiveCategory', () => {
  it('is_archived=true に更新（system 除外条件付き）', async () => {
    const { client, queries } = makeSupabaseMock({ categories: { data: null, error: null } });
    await archiveCategory(client, 'c1');
    expect(argsOf(queries.categories, 'update')?.[0]).toEqual({ is_archived: true });
    const eqCalls = queries.categories.calls.filter((c) => c.method === 'eq');
    expect(eqCalls.map((c) => c.args)).toEqual([
      ['id', 'c1'],
      ['is_system', false],
    ]);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({ categories: { data: null, error: { message: 'no' } } });
    await expect(archiveCategory(client, 'c1')).rejects.toThrow(/no/);
  });
});

describe('unarchiveCategory', () => {
  it('is_archived=false に更新（system 除外条件付き）', async () => {
    const { client, queries } = makeSupabaseMock({ categories: { data: null, error: null } });
    await unarchiveCategory(client, 'c1');
    expect(argsOf(queries.categories, 'update')?.[0]).toEqual({ is_archived: false });
    const eqCalls = queries.categories.calls.filter((c) => c.method === 'eq');
    expect(eqCalls.map((c) => c.args)).toEqual([
      ['id', 'c1'],
      ['is_system', false],
    ]);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({ categories: { data: null, error: { message: 'no' } } });
    await expect(unarchiveCategory(client, 'c1')).rejects.toThrow(/no/);
  });
});

describe('deleteCategory', () => {
  it('id・非system・非default を条件に削除する', async () => {
    const { client, queries } = makeSupabaseMock({ categories: { data: null, error: null } });
    await deleteCategory(client, 'c1');
    expect(queries.categories.calls.some((c) => c.method === 'delete')).toBe(true);
    // UI の判定（isDeletable）と DB の関門を揃える: system/default は消せない
    const eqCalls = queries.categories.calls.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqCalls).toEqual([
      ['id', 'c1'],
      ['is_system', false],
      ['is_default', false],
    ]);
  });

  it('error は投げる（FK restrict 等）', async () => {
    const { client } = makeSupabaseMock({ categories: { data: null, error: { message: 'fk' } } });
    await expect(deleteCategory(client, 'c1')).rejects.toThrow(/fk/);
  });
});

describe('getCategoryUsage', () => {
  it('そのカテゴリを使う取引の件数を返す', async () => {
    const { client, queries } = makeSupabaseMock({
      transactions: { data: null, count: 3, error: null },
    });
    expect(await getCategoryUsage(client, 'c1')).toBe(3);
    expect(argsOf(queries.transactions, 'eq')).toEqual(['category_id', 'c1']);
  });

  it('count が null なら 0', async () => {
    const { client } = makeSupabaseMock({ transactions: { data: null, count: null, error: null } });
    expect(await getCategoryUsage(client, 'c1')).toBe(0);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({ transactions: { data: null, error: { message: 'x' } } });
    await expect(getCategoryUsage(client, 'c1')).rejects.toThrow(/x/);
  });
});
