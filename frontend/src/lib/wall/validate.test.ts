import { describe, expect, it } from 'vitest';
import { validateActualBalance } from './validate';

describe('validateActualBalance', () => {
  it('¥/カンマ付きの整数を受理', () => {
    const r = validateActualBalance('¥50,000');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(50000);
  });

  it('0 円は有効（財布が空）', () => {
    const r = validateActualBalance('0');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(0);
  });

  it('未入力/非数値は弾く', () => {
    expect(validateActualBalance('')).toEqual({ ok: false, error: '残高を入力してください' });
    expect(validateActualBalance('abc')).toEqual({ ok: false, error: '残高を入力してください' });
  });

  it('小数は弾く', () => {
    const r = validateActualBalance('100.5');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('整数');
  });

  it('負値は弾く', () => {
    const r = validateActualBalance('-100');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('0円以上');
  });
});
