import { describe, expect, it } from 'vitest';
import { buildExpenseComparison } from './comparison';
import type { MonthlySummary } from './types';

function summary(expense: number | null): MonthlySummary {
  return {
    household_id: 'main',
    member_id: 'yururi',
    month: '2026-07-01',
    income: 0,
    expense,
    net: 0,
  };
}

describe('buildExpenseComparison', () => {
  // 先月の行が無いのは「取得は成功したが記録が 0 件」。だがアプリを使い始める前の月で
  // あることが大半で、¥0 のバーを描くと「先月は 1 円も使わなかった」と読めてしまう。
  // データ不在を実データとして見せないため、比較そのものを取り下げる。
  it('先月の行が無いときは null（0 円として比較しない）', () => {
    expect(buildExpenseComparison(summary(107500), null)).toBeNull();
  });

  it('今月・先月とも行が無いときは null', () => {
    expect(buildExpenseComparison(null, null)).toBeNull();
  });

  it('多い方のバーが 100%、少ない方は相対幅になる', () => {
    const got = buildExpenseComparison(summary(107500), summary(124000));
    expect(got).toEqual({
      thisMonth: { expense: 107500, widthPct: 87 },
      lastMonth: { expense: 124000, widthPct: 100 },
    });
  });

  // 今月だけ行が無いのは「今月はまだ記録が無い」＝ 0 円が事実。比較としても意味がある
  // （先月のバーが 100%）。先月なし（null）との非対称は意図的。
  it('今月の行が無く先月がある場合、今月は 0 円・幅 0%、先月は 100%', () => {
    const got = buildExpenseComparison(null, summary(124000));
    expect(got).toEqual({
      thisMonth: { expense: 0, widthPct: 0 },
      lastMonth: { expense: 124000, widthPct: 100 },
    });
  });

  it('両方 0 円でも 0 除算しない（幅は 0%）', () => {
    const got = buildExpenseComparison(summary(0), summary(0));
    expect(got).toEqual({
      thisMonth: { expense: 0, widthPct: 0 },
      lastMonth: { expense: 0, widthPct: 0 },
    });
  });

  // v_monthly_summary の生成型では expense が nullable
  it('expense が null でも 0 として扱う', () => {
    const got = buildExpenseComparison(summary(null), summary(50000));
    expect(got).toEqual({
      thisMonth: { expense: 0, widthPct: 0 },
      lastMonth: { expense: 50000, widthPct: 100 },
    });
  });
});
