import { describe, expect, it } from 'vitest';
import { validateTargetAmount, validateOpeningBalance } from './schema';

describe('validateTargetAmount', () => {
  it('0円以上の整数を受理する', () => {
    expect(validateTargetAmount('30000')).toEqual({ ok: true, value: 30000 });
    expect(validateTargetAmount('0')).toEqual({ ok: true, value: 0 });
  });

  it('¥ やカンマを落とす', () => {
    expect(validateTargetAmount('¥30,000')).toEqual({ ok: true, value: 30000 });
  });

  it('空・非数字・マイナス・小数を拒否する', () => {
    expect(validateTargetAmount('').ok).toBe(false);
    expect(validateTargetAmount('  ').ok).toBe(false);
    expect(validateTargetAmount('abc').ok).toBe(false);
    expect(validateTargetAmount('-1').ok).toBe(false);
    expect(validateTargetAmount('100.5').ok).toBe(false);
  });

  // Postgres の integer 上限を超えると DB 側で落ちるので手前で弾く
  it('integer の上限を超える値を拒否する', () => {
    expect(validateTargetAmount('2147483647').ok).toBe(true);
    expect(validateTargetAmount('2147483648').ok).toBe(false);
  });

  it('エラー文言に項目名が入る', () => {
    const r = validateTargetAmount('-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('目標額');
  });
});

describe('validateOpeningBalance', () => {
  it('0円以上の整数を受理する', () => {
    expect(validateOpeningBalance('50000')).toEqual({ ok: true, value: 50000 });
    expect(validateOpeningBalance('0')).toEqual({ ok: true, value: 0 });
  });

  it('マイナスは拒否し、項目名を出す', () => {
    const r = validateOpeningBalance('-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('初期残高');
  });
});
