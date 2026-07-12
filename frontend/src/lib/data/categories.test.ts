import { describe, expect, it } from 'vitest';
import { listCategories, createCategory, archiveCategory } from './categories';
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
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('listCategories', () => {
  it('非archived のみ取得（is_archived=false でフィルタ）', async () => {
    const rows = [cat(), cat({ id: 'c2', name: '住宅' })];
    const { client, queries } = makeSupabaseMock({ categories: { data: rows, error: null } });
    const result = await listCategories(client);
    expect(result).toEqual(rows);
    expect(argsOf(queries.categories, 'eq')).toEqual(['is_archived', false]);
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
