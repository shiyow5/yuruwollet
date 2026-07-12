import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('falsy を除いて結合する', () => {
    expect(cn('a', false, 'b', null, undefined, 'c')).toBe('a b c');
  });
  it('空なら空文字', () => {
    expect(cn()).toBe('');
  });
  it('条件付きクラス', () => {
    const active = true;
    expect(cn('base', active && 'active')).toBe('base active');
  });
});
