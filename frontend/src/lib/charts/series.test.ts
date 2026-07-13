import { describe, expect, it } from 'vitest';
import {
  recentMonths,
  buildTrend,
  buildSavingsSeries,
  buildCategorySlices,
  buildSubscriptionSlices,
  sliceColor,
  MAX_SLICES,
} from './series';

const NOW = new Date('2026-07-13T12:00:00+09:00');

describe('recentMonths', () => {
  it('直近 N ヶ月を古い順に返す（当月を含む）', () => {
    expect(recentMonths(3, NOW)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01']);
  });

  it('年をまたぐ', () => {
    expect(recentMonths(3, new Date('2026-01-15T12:00:00+09:00'))).toEqual([
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
    ]);
  });
});

describe('buildTrend', () => {
  // 取引が 1 件も無い月は view に行が存在しない。
  // 穴を詰めると軸が歪む（4月の次が7月になる）ので 0 で埋める。
  it('データが無い月を 0 で埋める', () => {
    const rows = [{ month: '2026-07-01', income: 200000, expense: 120000, net: 80000 }];
    const trend = buildTrend(rows, 3, NOW);

    expect(trend.map((p) => p.month)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01']);
    expect(trend[0]).toMatchObject({ income: 0, expense: 0, net: 0 });
    expect(trend[2]).toMatchObject({ income: 200000, expense: 120000, net: 80000 });
  });

  it('範囲外の古い月は捨てる', () => {
    const rows = [
      { month: '2020-01-01', income: 1, expense: 0, net: 1 },
      { month: '2026-07-01', income: 5, expense: 0, net: 5 },
    ];
    const trend = buildTrend(rows, 3, NOW);
    expect(trend).toHaveLength(3);
    expect(trend.every((p) => p.month >= '2026-05-01')).toBe(true);
  });

  it('軸ラベルを付ける', () => {
    const trend = buildTrend([], 2, NOW);
    expect(trend.map((p) => p.label)).toEqual(['6月', '7月']);
  });
});

describe('buildSavingsSeries', () => {
  it('目標のある月だけを古い順に並べる（目標が無い月は点にしない）', () => {
    const rows = [
      { period_month: '2026-06-01', target_amount: 30000, saved: 32000 },
      { period_month: '2026-07-01', target_amount: 30000, saved: 12000 },
    ];
    const series = buildSavingsSeries(rows);
    expect(series).toEqual([
      { month: '2026-06-01', label: '6月', target: 30000, saved: 32000 },
      { month: '2026-07-01', label: '7月', target: 30000, saved: 12000 },
    ]);
  });

  // 使いすぎた月はマイナス。0 に丸めない
  it('マイナスの貯金額をそのまま保つ', () => {
    const series = buildSavingsSeries([
      { period_month: '2026-07-01', target_amount: 30000, saved: -5000 },
    ]);
    expect(series[0].saved).toBe(-5000);
  });
});

describe('buildCategorySlices', () => {
  const rows = [
    { category_name: '食費', type: 'expense' as const, total: 40000 },
    { category_name: '趣味', type: 'expense' as const, total: 20000 },
    { category_name: 'バイト代', type: 'income' as const, total: 90000 },
  ];

  it('支出だけを大きい順にスライスにする（収入は混ぜない）', () => {
    const slices = buildCategorySlices(rows);
    expect(slices.map((s) => s.name)).toEqual(['食費', '趣味']);
    expect(slices.map((s) => s.value)).toEqual([40000, 20000]);
  });

  it('カテゴリ名が無い（削除済み）行も落とさず「その他」にする', () => {
    const slices = buildCategorySlices([
      { category_name: null, type: 'expense' as const, total: 1000 },
    ]);
    expect(slices[0].name).toBe('その他');
  });

  it('スライスが多すぎたら上位を残して残りを「その他」にまとめる', () => {
    const many = Array.from({ length: MAX_SLICES + 3 }, (_, i) => ({
      category_name: `c${i}`,
      type: 'expense' as const,
      total: 100 - i,
    }));
    const slices = buildCategorySlices(many);

    expect(slices).toHaveLength(MAX_SLICES);
    expect(slices.map((s) => s.name)).toContain('その他');
    // 合計は保たれる（丸めて捨てない）
    const total = many.reduce((s, r) => s + r.total, 0);
    expect(slices.reduce((s, x) => s + x.value, 0)).toBe(total);
    // 大きい順に並ぶ（「その他」も値に応じた位置に入る）
    const values = slices.map((s) => s.value);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  it('0 円のカテゴリは描かない', () => {
    expect(buildCategorySlices([{ category_name: 'x', type: 'expense', total: 0 }])).toEqual([]);
  });

  // 「その他」という名前のカテゴリが実在すると、カテゴリ未設定ぶんと名前が衝突する。
  // 畳み込みが起きない件数でも重複しうる。
  it('同名のスライスは畳み込みが無くても 1 つに合算する', () => {
    const slices = buildCategorySlices([
      { category_name: 'その他', type: 'expense', total: 3000 }, // 実在するカテゴリ
      { category_name: null, type: 'expense', total: 2000 }, // カテゴリ未設定
      { category_name: '食費', type: 'expense', total: 5000 },
    ]);

    expect(slices.filter((s) => s.name === 'その他')).toHaveLength(1);
    expect(slices.find((s) => s.name === 'その他')!.value).toBe(5000);
  });

  // 同額のまま入力順に任せると、再取得のたびに色と凡例の位置が入れ替わる
  it('同額なら名前順に並べる（再取得で色が入れ替わらない）', () => {
    const rows = [
      { category_name: 'b', type: 'expense' as const, total: 1000 },
      { category_name: 'a', type: 'expense' as const, total: 1000 },
    ];
    const first = buildCategorySlices(rows);
    const second = buildCategorySlices([...rows].reverse());

    expect(first.map((s) => s.name)).toEqual(['a', 'b']);
    expect(second).toEqual(first); // 入力順が変わっても同じ色・同じ順序
  });

  it('カテゴリ未設定の「その他」と、畳んだ「その他」を 1 つに合算する', () => {
    const rows = [
      { category_name: null, type: 'expense' as const, total: 5000 }, // → その他
      ...Array.from({ length: MAX_SLICES + 2 }, (_, i) => ({
        category_name: `c${i}`,
        type: 'expense' as const,
        total: 1000 - i,
      })),
    ];
    const slices = buildCategorySlices(rows);

    expect(slices.filter((s) => s.name === 'その他')).toHaveLength(1);
    expect(new Set(slices.map((s) => s.name)).size).toBe(slices.length);
    // 合計は保たれる
    const total = rows.reduce((s, r) => s + r.total, 0);
    expect(slices.reduce((s, x) => s + x.value, 0)).toBe(total);
  });
});

describe('buildSubscriptionSlices', () => {
  it('月換算額の大きい順', () => {
    const slices = buildSubscriptionSlices([
      { name: 'Netflix', monthly: 1490 },
      { name: 'Spotify', monthly: 980 },
    ]);
    expect(slices.map((s) => s.name)).toEqual(['Netflix', 'Spotify']);
  });

  it('0 円は描かない', () => {
    expect(buildSubscriptionSlices([{ name: 'Free', monthly: 0 }])).toEqual([]);
  });
});

describe('sliceColor', () => {
  // 再レンダーで色が入れ替わると別物に見える
  it('同じ index には常に同じ色（決定的）', () => {
    expect(sliceColor(0)).toBe(sliceColor(0));
    expect(sliceColor(0)).not.toBe(sliceColor(1));
  });

  it('パレットを超えても巡回して必ず色を返す', () => {
    expect(sliceColor(999)).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
