import { describe, expect, it } from 'vitest';
import { isSafeUrl, parseWishlistForm } from './schema';

const base = { genre: 'want', title: '新しいコーヒーメーカー', url: '', memo: '' };

describe('isSafeUrl', () => {
  it('http(s) だけ許可する', () => {
    expect(isSafeUrl('https://example.com/item')).toBe(true);
    expect(isSafeUrl('http://example.com')).toBe(true);
  });

  // 共有リストなので、危険な URL を登録できると **相手を攻撃できてしまう**
  it('javascript: / data: / file: は拒否する', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
  });

  it('URL として壊れているものは拒否する', () => {
    expect(isSafeUrl('example.com')).toBe(false);
    expect(isSafeUrl('   ')).toBe(false);
  });
});

describe('parseWishlistForm', () => {
  it('最小構成を受理する（URL/メモは任意）', () => {
    const r = parseWishlistForm(base);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.value).toEqual({
        genre: 'want',
        title: '新しいコーヒーメーカー',
        url: '',
        memo: '',
      });
  });

  it('前後の空白を落とす', () => {
    const r = parseWishlistForm({ ...base, title: '  カフェ  ', memo: '  行きたい  ' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.title).toBe('カフェ');
      expect(r.value.memo).toBe('行きたい');
    }
  });

  it('タイトル必須', () => {
    const r = parseWishlistForm({ ...base, title: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.title).toMatch(/タイトル/);
  });

  it('安全でない URL は拒否する', () => {
    const r = parseWishlistForm({ ...base, url: 'javascript:alert(1)' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.url).toMatch(/http/);
  });

  it('安全な URL は受理する', () => {
    const r = parseWishlistForm({ ...base, url: 'https://example.com/x' });
    expect(r.ok).toBe(true);
  });

  it('不正なジャンルは拒否する', () => {
    const r = parseWishlistForm({ ...base, genre: 'evil' });
    expect(r.ok).toBe(false);
  });

  it('長すぎるタイトル/メモは拒否する', () => {
    expect(parseWishlistForm({ ...base, title: 'あ'.repeat(101) }).ok).toBe(false);
    expect(parseWishlistForm({ ...base, memo: 'あ'.repeat(501) }).ok).toBe(false);
  });
});
