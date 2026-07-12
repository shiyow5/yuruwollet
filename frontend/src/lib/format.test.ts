import { describe, expect, it } from 'vitest';
import { formatYen, formatSignedYen } from './format';

describe('formatYen', () => {
  it('千区切り付きで整形する', () => {
    expect(formatYen(342500)).toBe('¥342,500');
  });

  it('小数は四捨五入する', () => {
    expect(formatYen(1200.4)).toBe('¥1,200');
    expect(formatYen(1200.5)).toBe('¥1,201');
  });

  it('0 を扱える', () => {
    expect(formatYen(0)).toBe('¥0');
  });
});

describe('formatSignedYen', () => {
  it('支出はマイナス符号', () => {
    expect(formatSignedYen(4500, 'expense')).toBe('- ¥4,500');
  });

  it('収入はプラス符号', () => {
    expect(formatSignedYen(280000, 'income')).toBe('+ ¥280,000');
  });

  it('負値を渡しても絶対値で扱う', () => {
    expect(formatSignedYen(-4500, 'expense')).toBe('- ¥4,500');
  });
});
