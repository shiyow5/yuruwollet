import { describe, expect, it } from 'vitest';
import {
  listWishlist,
  createWishlistItem,
  completeWishlistItem,
  restoreWishlistItem,
  deleteWishlistItem,
} from './wishlist';
import { makeSupabaseMock, argsOf } from '../../test/supabaseMock';
import type { WishlistItem } from '../wishlist/types';

function item(over: Partial<WishlistItem> = {}): WishlistItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    household_id: 'main',
    registrant_id: 'yururi',
    genre: 'want',
    title: 'コーヒーメーカー',
    url: null,
    memo: '',
    status: 'planned',
    archived: false,
    created_at: '2026-07-13T01:00:00Z',
    updated_at: '2026-07-13T01:00:00Z',
    ...over,
  };
}

describe('listWishlist', () => {
  it('archived で絞り、新しい順に取得する', async () => {
    const rows = [item()];
    const { client, queries } = makeSupabaseMock({ wishlist_items: { data: rows, error: null } });
    expect(await listWishlist(client, false)).toEqual(rows);

    expect(argsOf(queries.wishlist_items, 'eq')).toEqual(['archived', false]);
    expect(argsOf(queries.wishlist_items, 'order')).toEqual(['created_at', { ascending: false }]);
  });

  it('アーカイブ側も取得できる', async () => {
    const { client, queries } = makeSupabaseMock({ wishlist_items: { data: [], error: null } });
    expect(await listWishlist(client, true)).toEqual([]);
    expect(argsOf(queries.wishlist_items, 'eq')).toEqual(['archived', true]);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({
      wishlist_items: { data: null, error: { message: 'rls' } },
    });
    await expect(listWishlist(client, false)).rejects.toThrow(/rls/);
  });
});

describe('createWishlistItem', () => {
  const input = {
    householdId: 'main',
    registrantId: 'yururi',
    genre: 'want' as const,
    title: 'コーヒーメーカー',
    url: 'https://example.com',
    memo: 'ほしい',
  };

  it('登録者を自分に固定して挿入する', async () => {
    const row = item();
    const { client, queries } = makeSupabaseMock({ wishlist_items: { data: row, error: null } });
    expect(await createWishlistItem(client, input)).toEqual(row);

    expect(argsOf(queries.wishlist_items, 'insert')?.[0]).toEqual({
      household_id: 'main',
      registrant_id: 'yururi',
      genre: 'want',
      title: 'コーヒーメーカー',
      url: 'https://example.com',
      memo: 'ほしい',
    });
  });

  // 空文字を保存するとリンク描画の判定が壊れる
  it('URL が空なら null で保存する', async () => {
    const { client, queries } = makeSupabaseMock({ wishlist_items: { data: item(), error: null } });
    await createWishlistItem(client, { ...input, url: '' });
    expect((argsOf(queries.wishlist_items, 'insert')?.[0] as { url: unknown }).url).toBeNull();
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({
      wishlist_items: { data: null, error: { message: 'nope' } },
    });
    await expect(createWishlistItem(client, input)).rejects.toThrow(/nope/);
  });
});

describe('completeWishlistItem / restoreWishlistItem', () => {
  // status と archived は必ず一緒に動かす（片方だけだと一覧から消えたのに未達成、等の齟齬が出る）
  it('「済み」は done + アーカイブへ移動を同時に行う', async () => {
    const { client, queries } = makeSupabaseMock({ wishlist_items: { data: null, error: null } });
    await completeWishlistItem(client, 'id1');
    expect(argsOf(queries.wishlist_items, 'update')?.[0]).toEqual({
      status: 'done',
      archived: true,
    });
    expect(argsOf(queries.wishlist_items, 'eq')).toEqual(['id', 'id1']);
  });

  it('「戻す」は planned + 現役リストへ復帰を同時に行う', async () => {
    const { client, queries } = makeSupabaseMock({ wishlist_items: { data: null, error: null } });
    await restoreWishlistItem(client, 'id1');
    expect(argsOf(queries.wishlist_items, 'update')?.[0]).toEqual({
      status: 'planned',
      archived: false,
    });
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({
      wishlist_items: { data: null, error: { message: 'x' } },
    });
    await expect(completeWishlistItem(client, 'id1')).rejects.toThrow(/x/);
    await expect(restoreWishlistItem(client, 'id1')).rejects.toThrow(/x/);
  });
});

describe('deleteWishlistItem', () => {
  it('id で削除する', async () => {
    const { client, queries } = makeSupabaseMock({ wishlist_items: { data: null, error: null } });
    await deleteWishlistItem(client, 'id1');
    expect(queries.wishlist_items.calls.some((c) => c.method === 'delete')).toBe(true);
    expect(argsOf(queries.wishlist_items, 'eq')).toEqual(['id', 'id1']);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({
      wishlist_items: { data: null, error: { message: 'x' } },
    });
    await expect(deleteWishlistItem(client, 'id1')).rejects.toThrow(/x/);
  });
});
