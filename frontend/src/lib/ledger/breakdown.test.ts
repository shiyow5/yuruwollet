import { describe, expect, it } from 'vitest';
import { toCategoryBars, totalByType } from './breakdown';
import type { CategoryBreakdownRow } from './types';

function row(over: Partial<CategoryBreakdownRow>): CategoryBreakdownRow {
  return {
    household_id: 'main',
    member_id: 'yururi',
    month: '2026-07-01',
    category_id: 'c1',
    category_name: '食費',
    category_icon: 'restaurant',
    type: 'expense',
    total: 1000,
    ...over,
  };
}

describe('toCategoryBars', () => {
  it('支出のみを総額降順で返す', () => {
    const bars = toCategoryBars([
      row({ category_id: 'a', category_name: '食費', total: 42000 }),
      row({ category_id: 'b', category_name: '住宅', total: 85000 }),
      row({ category_id: 'c', category_name: '収入', type: 'income', total: 999 }),
    ]);
    expect(bars.map((b) => b.name)).toEqual(['住宅', '食費']);
  });

  it('widthPct は最大値基準の相対値', () => {
    const bars = toCategoryBars([
      row({ category_id: 'a', total: 100 }),
      row({ category_id: 'b', total: 50 }),
      row({ category_id: 'c', total: 25 }),
    ]);
    expect(bars[0].widthPct).toBe(100);
    expect(bars[1].widthPct).toBe(50);
    expect(bars[2].widthPct).toBe(25);
  });

  it('0 件なら空配列', () => {
    expect(toCategoryBars([])).toEqual([]);
  });

  it('total 0/null は除外', () => {
    const bars = toCategoryBars([
      row({ category_id: 'a', total: 0 }),
      row({ category_id: 'b', total: null }),
      row({ category_id: 'c', total: 500 }),
    ]);
    expect(bars).toHaveLength(1);
    expect(bars[0].categoryId).toBe('c');
    expect(bars[0].widthPct).toBe(100);
  });

  it('未分類（name/icon null）はフォールバック表示', () => {
    const bars = toCategoryBars([
      row({ category_id: null, category_name: null, category_icon: null, total: 300 }),
    ]);
    expect(bars[0].name).toBe('未分類');
    expect(bars[0].icon).toBe('help');
    expect(bars[0].categoryId).toBeNull();
  });

  it('type=income でも動く', () => {
    const bars = toCategoryBars(
      [
        row({ category_id: 'x', category_name: '給与', type: 'income', total: 280000 }),
        row({ category_id: 'y', total: 4000 }),
      ],
      'income',
    );
    expect(bars).toHaveLength(1);
    expect(bars[0].name).toBe('給与');
  });
});

describe('totalByType', () => {
  it('type 別の合計', () => {
    const rows = [
      row({ total: 1000 }),
      row({ total: 500 }),
      row({ type: 'income', total: 9999 }),
    ];
    expect(totalByType(rows, 'expense')).toBe(1500);
    expect(totalByType(rows, 'income')).toBe(9999);
  });
  it('null total は 0 扱い', () => {
    expect(totalByType([row({ total: null })], 'expense')).toBe(0);
  });
});
