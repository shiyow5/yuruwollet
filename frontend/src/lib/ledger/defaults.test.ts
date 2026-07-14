import { describe, expect, it } from 'vitest';
import { defaultOccurredOn } from './defaults';

// 2026-07-14 12:00 JST（= 03:00 UTC）。JST の「今日」は 14 日。
const now = new Date('2026-07-14T03:00:00Z');

describe('defaultOccurredOn', () => {
  it('当月を見ているときは今日を返す', () => {
    expect(defaultOccurredOn('2026-07-01', now)).toBe('2026-07-14');
  });

  // 過去の月を見ながら追加したとき、当月の日付で書き込むと
  // 「追加したのに一覧から消えた」ように見える（別の月に入るため）。
  it('過去の月を見ているときはその月の初日を返す', () => {
    expect(defaultOccurredOn('2026-06-01', now)).toBe('2026-06-01');
  });

  it('未来の月を見ているときはその月の初日を返す', () => {
    expect(defaultOccurredOn('2026-08-01', now)).toBe('2026-08-01');
  });
});
