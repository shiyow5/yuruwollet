import { describe, expect, it } from 'vitest';
import { getNow, isClockOverrideAllowed } from './clock';
import { jstToday } from './format';

describe('getNow', () => {
  it('override 許可時は ?now=YYYY-MM-DD で JST 日付を偽装できる', () => {
    expect(jstToday(getNow('?now=2026-07-24', true))).toBe('2026-07-24');
    expect(jstToday(getNow('?foo=1&now=2026-12-31', true))).toBe('2026-12-31');
  });

  it('override 不許可（本番）なら ?now= を無視して実時刻', () => {
    const real = getNow('?now=2026-07-24', false);
    expect(Math.abs(real.getTime() - Date.now())).toBeLessThan(5000);
  });

  it('不正な override は無視して実時刻', () => {
    const real = getNow('?now=notadate', true);
    expect(Math.abs(real.getTime() - Date.now())).toBeLessThan(5000);
  });

  it('override 無しは実時刻', () => {
    const real = getNow('', true);
    expect(Math.abs(real.getTime() - Date.now())).toBeLessThan(5000);
  });
});

describe('isClockOverrideAllowed', () => {
  it('テスト/開発環境では許可される（本番ビルドでは false）', () => {
    expect(isClockOverrideAllowed()).toBe(true);
  });
});
