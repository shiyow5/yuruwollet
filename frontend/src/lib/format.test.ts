import { describe, expect, it } from 'vitest';
import { formatYen, formatSignedYen, parseAmount, relativeDate } from './format';

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

describe('parseAmount', () => {
  it('¥ と カンマ を除去して数値化', () => {
    expect(parseAmount('¥1,234')).toBe(1234);
    expect(parseAmount('￥ 12,000')).toBe(12000);
  });
  it('小数も扱える', () => {
    expect(parseAmount('12.50')).toBe(12.5);
  });
  it('無効な入力は NaN', () => {
    expect(parseAmount('abc')).toBeNaN();
    expect(parseAmount('')).toBeNaN();
    expect(parseAmount('1,2.3.4')).toBeNaN();
  });
});

describe('relativeDate', () => {
  const now = new Date('2026-07-13T12:00:00+09:00');

  it('同日は「今日, HH:MM」', () => {
    expect(relativeDate('2026-07-13T05:30:00+09:00', now)).toMatch(/^今日, \d{2}:\d{2}$/);
  });
  it('前日は「昨日, HH:MM」', () => {
    expect(relativeDate('2026-07-12T22:15:00+09:00', now)).toMatch(/^昨日, \d{2}:\d{2}$/);
  });
  it('7日未満は「N日前」', () => {
    expect(relativeDate('2026-07-10T12:00:00+09:00', now)).toBe('3日前');
  });
  it('7日以上前は「M月D日」', () => {
    expect(relativeDate('2026-07-03T12:00:00+09:00', now)).toBe('7月3日');
  });
  it('now 省略でも文字列を返す', () => {
    expect(typeof relativeDate(new Date())).toBe('string');
  });
});
