import { describe, expect, it } from 'vitest';
import { progressPct, remainingToGoal, savedLabel, isAchieved } from './progress';

describe('progressPct', () => {
  it('貯金額 / 目標額 の百分率', () => {
    expect(progressPct(5000, 10000)).toBe(50);
    expect(progressPct(10000, 10000)).toBe(100);
  });

  // 使いすぎると今月の収支はマイナスになる。リングは 0% で止める（負の長さは描けない）
  it('貯金額がマイナスでも 0% で止める', () => {
    expect(progressPct(-3000, 10000)).toBe(0);
  });

  it('目標超過でも 100% で止める（リングの描画用）', () => {
    expect(progressPct(25000, 10000)).toBe(100);
  });

  it('目標 0 は 0 除算にせず 100%（達成済み扱い）', () => {
    expect(progressPct(0, 0)).toBe(100);
    expect(progressPct(-1, 0)).toBe(0);
  });
});

describe('remainingToGoal', () => {
  it('目標までの残り。達成済みなら 0', () => {
    expect(remainingToGoal(3000, 10000)).toBe(7000);
    expect(remainingToGoal(10000, 10000)).toBe(0);
    expect(remainingToGoal(12000, 10000)).toBe(0);
  });

  // マイナス貯金なら目標額より多く必要
  it('貯金額がマイナスなら残りは目標額を超える', () => {
    expect(remainingToGoal(-2000, 10000)).toBe(12000);
  });
});

describe('isAchieved', () => {
  it('貯金額 >= 目標額 で達成', () => {
    expect(isAchieved(10000, 10000)).toBe(true);
    expect(isAchieved(9999, 10000)).toBe(false);
    expect(isAchieved(-1, 0)).toBe(false);
    expect(isAchieved(0, 0)).toBe(true);
  });
});

describe('savedLabel', () => {
  it('マイナスは「使いすぎ」として符号つきで見せる（0 に丸めない）', () => {
    expect(savedLabel(5000)).toBe('¥5,000');
    expect(savedLabel(-3000)).toBe('-¥3,000');
    expect(savedLabel(0)).toBe('¥0');
  });
});
