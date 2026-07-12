import { describe, expect, it } from 'vitest';
import {
  formatYen,
  formatSignedYen,
  parseAmount,
  relativeDate,
  jstToday,
  jstMonthStart,
  monthStartOf,
  addMonths,
  formatMonthLabel,
} from './format';

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

describe('jstToday', () => {
  it('JST の暦日を YYYY-MM-DD で返す', () => {
    // 2026-07-13T23:30Z は JST では翌日 07-14 の 08:30
    expect(jstToday(new Date('2026-07-13T23:30:00Z'))).toBe('2026-07-14');
  });
  it('UTC 深夜でも JST 日付になる', () => {
    // 2026-07-13T14:59Z は JST 07-13 の 23:59（まだ同日）
    expect(jstToday(new Date('2026-07-13T14:59:00Z'))).toBe('2026-07-13');
  });
});

describe('monthStartOf', () => {
  it('日付から当月初日を返す', () => {
    expect(monthStartOf('2026-07-13')).toBe('2026-07-01');
  });
});

describe('jstMonthStart', () => {
  it('JST 当月の初日を返す', () => {
    expect(jstMonthStart(new Date('2026-07-13T12:00:00+09:00'))).toBe('2026-07-01');
  });
});

describe('addMonths', () => {
  it('翌月へ繰り上がる', () => {
    expect(addMonths('2026-07-01', 1)).toBe('2026-08-01');
  });
  it('年をまたいで繰り上がる', () => {
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
  });
  it('前月へ繰り下がる（年またぎ）', () => {
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
  });
  it('複数月ずらせる', () => {
    expect(addMonths('2026-07-01', 6)).toBe('2027-01-01');
  });
});

describe('formatMonthLabel', () => {
  it('YYYY年M月 に整形（ゼロ埋めなし）', () => {
    expect(formatMonthLabel('2026-07-01')).toBe('2026年7月');
    expect(formatMonthLabel('2026-12-01')).toBe('2026年12月');
  });
});
