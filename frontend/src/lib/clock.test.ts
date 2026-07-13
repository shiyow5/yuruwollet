import { describe, expect, it } from 'vitest';
import { getNow } from './clock';
import { jstToday } from './format';

describe('getNow', () => {
  it('?now=YYYY-MM-DD で JST 日付を偽装できる（テスト seam）', () => {
    expect(jstToday(getNow('?now=2026-07-24'))).toBe('2026-07-24');
    expect(jstToday(getNow('?foo=1&now=2026-12-31'))).toBe('2026-12-31');
  });

  it('不正な override は無視して実時刻', () => {
    const real = getNow('?now=notadate');
    expect(Math.abs(real.getTime() - Date.now())).toBeLessThan(5000);
  });

  it('override 無しは実時刻', () => {
    const real = getNow('');
    expect(Math.abs(real.getTime() - Date.now())).toBeLessThan(5000);
  });
});
