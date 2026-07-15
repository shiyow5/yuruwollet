import { describe, expect, it } from 'vitest';
import { isDeletable, resolveCategory, selectableCategories, userCategories } from './categories';
import type { Category } from './types';

function cat(over: Partial<Category>): Category {
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

const cats: Category[] = [
  cat({ id: 'c1', kind: 'expense', name: '食費', icon: 'restaurant' }),
  cat({ id: 'c2', kind: 'expense', name: '住宅', icon: null }),
  cat({ id: 'c3', kind: 'income', name: '給与', icon: 'payments' }),
  cat({ id: 'c4', kind: 'expense', name: '古い', is_archived: true }),
  cat({ id: 'sys', kind: 'system', name: '残高調整', is_system: true }),
];

describe('resolveCategory', () => {
  it('id から name/icon を解決', () => {
    expect(resolveCategory(cats, 'c1')).toEqual({ name: '食費', icon: 'restaurant' });
  });
  it('icon が null なら label フォールバック', () => {
    expect(resolveCategory(cats, 'c2')).toEqual({ name: '住宅', icon: 'label' });
  });
  it('null は未分類', () => {
    expect(resolveCategory(cats, null)).toEqual({ name: '未分類', icon: 'help' });
  });
  it('存在しない id も未分類', () => {
    expect(resolveCategory(cats, 'zzz')).toEqual({ name: '未分類', icon: 'help' });
  });
});

describe('selectableCategories', () => {
  it('種別一致・非system・非archived のみ', () => {
    expect(selectableCategories(cats, 'expense').map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(selectableCategories(cats, 'income').map((c) => c.id)).toEqual(['c3']);
  });
});

describe('userCategories', () => {
  it('非system のみ（archived 含む）', () => {
    expect(userCategories(cats).map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
  });
});

describe('isDeletable', () => {
  // 削除できるのは「システムでもデフォルトでもない」= ユーザーが後から足したもの。
  // （実際に消せるかは取引で使われているか＝FK にもよるが、それは DB 側の関門。
  //   ここは「そもそも削除ボタンを出してよいカテゴリか」の判定。）
  it('ユーザー追加カテゴリは削除できる', () => {
    expect(isDeletable(cat({ is_system: false, is_default: false }))).toBe(true);
  });
  it('デフォルトカテゴリ（seed）は削除できない', () => {
    expect(isDeletable(cat({ is_default: true }))).toBe(false);
  });
  it('システムカテゴリ（残高調整）は削除できない', () => {
    expect(isDeletable(cat({ is_system: true }))).toBe(false);
  });
});
