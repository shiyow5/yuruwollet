import { describe, expect, it } from 'vitest';
import {
  WALL_DAY,
  jstDayOfMonth,
  shouldShowWall,
  msUntilNextJstDay,
  computeDiff,
  diffMessage,
  diffDirectionLabel,
} from './schedule';
import type { Checkpoint } from './types';

function cp(over: Partial<Checkpoint>): Checkpoint {
  return {
    id: 'cp1',
    household_id: 'main',
    member_id: 'yururi',
    checkpoint_month: '2026-07-01',
    actual: null,
    computed: null,
    diff: null,
    status: 'skipped',
    created_at: '2026-07-24T01:00:00Z',
    updated_at: '2026-07-24T01:00:00Z',
    ...over,
  };
}

describe('jstDayOfMonth', () => {
  it('JST の日を返す', () => {
    expect(jstDayOfMonth(new Date('2026-07-24T12:00:00+09:00'))).toBe(24);
    // UTC 2026-07-23T23:00 は JST 2026-07-24 08:00
    expect(jstDayOfMonth(new Date('2026-07-23T23:00:00Z'))).toBe(24);
  });
});

describe('shouldShowWall', () => {
  const on24 = new Date('2026-07-24T12:00:00+09:00');
  const on23 = new Date('2026-07-23T12:00:00+09:00');
  const on26 = new Date('2026-07-26T12:00:00+09:00');

  it('WALL_DAY は 24', () => {
    expect(WALL_DAY).toBe(24);
  });

  it('24日未満は表示しない', () => {
    expect(shouldShowWall(on23, null)).toBe(false);
  });

  it('24日以降で checkpoint が無ければ表示', () => {
    expect(shouldShowWall(on24, null)).toBe(true);
    expect(shouldShowWall(on26, null)).toBe(true);
  });

  it('confirmed 済みなら表示しない', () => {
    expect(shouldShowWall(on24, cp({ status: 'confirmed' }))).toBe(false);
    expect(shouldShowWall(on26, cp({ status: 'confirmed' }))).toBe(false);
  });

  it('今日スキップ済みなら当日は表示しない', () => {
    // JST 7/24 にスキップ、今も 7/24
    const skippedToday = cp({ status: 'skipped', updated_at: '2026-07-24T01:00:00Z' }); // JST 7/24 10:00
    expect(shouldShowWall(on24, skippedToday)).toBe(false);
  });

  it('前日以前のスキップなら再表示（25日以降も催促）', () => {
    const skippedOn24 = cp({ status: 'skipped', updated_at: '2026-07-24T01:00:00Z' });
    expect(shouldShowWall(on26, skippedOn24)).toBe(true);
  });
});

describe('msUntilNextJstDay', () => {
  it('JST 翌日 00:00 までのミリ秒を返す', () => {
    // JST 7/23 23:00 → 翌 00:00 まで 1 時間
    const at2300 = new Date('2026-07-23T23:00:00+09:00');
    expect(msUntilNextJstDay(at2300)).toBe(60 * 60 * 1000);
  });

  it('JST 正午なら 12 時間', () => {
    const noon = new Date('2026-07-23T12:00:00+09:00');
    expect(msUntilNextJstDay(noon)).toBe(12 * 60 * 60 * 1000);
  });

  it('最低 1 秒は返す（0 や負にならない）', () => {
    const justBefore = new Date('2026-07-23T23:59:59.999+09:00');
    expect(msUntilNextJstDay(justBefore)).toBeGreaterThanOrEqual(1000);
  });
});

describe('computeDiff / diffMessage / diffDirectionLabel', () => {
  it('差額は 実際 − 計算', () => {
    expect(computeDiff(50000, 45000)).toBe(5000);
    expect(computeDiff(40000, 45000)).toBe(-5000);
    expect(computeDiff(45000, 45000)).toBe(0);
  });

  it('確認文言は絶対値で仕様どおり', () => {
    expect(diffMessage(5000)).toBe(
      'アプリの計算と【¥5,000】ズレています。このまま実際の残高に合わせますか？',
    );
    expect(diffMessage(-5000)).toBe(
      'アプリの計算と【¥5,000】ズレています。このまま実際の残高に合わせますか？',
    );
  });

  it('調整の向きを説明する', () => {
    expect(diffDirectionLabel(5000)).toContain('収入');
    expect(diffDirectionLabel(-5000)).toContain('支出');
    expect(diffDirectionLabel(0)).toContain('ズレはありません');
  });
});
