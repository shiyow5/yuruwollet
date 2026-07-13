import { describe, expect, it } from 'vitest';
import { avatarToneClass, initialOf, isDisplayableAvatarUrl } from './avatar';

describe('initialOf', () => {
  it('表示名の頭文字を返す', () => {
    expect(initialOf('ゆるり')).toBe('ゆ');
    expect(initialOf('しよを')).toBe('し');
  });

  it('空文字なら空を返す', () => {
    expect(initialOf('')).toBe('');
    expect(initialOf('   ')).toBe('');
  });

  // slice(0,1) だとサロゲートペア（絵文字など）を半分に割って文字化けする
  it('サロゲートペアを壊さない', () => {
    expect(initialOf('👩‍🦰さん')).toBe('👩');
  });
});

describe('avatarToneClass', () => {
  it('メンバーごとに色を返す', () => {
    expect(avatarToneClass('yururi')).toContain('bg-member-yururi');
    expect(avatarToneClass('shiyowo')).toContain('bg-member-shiyowo');
    expect(avatarToneClass('yururi')).not.toBe(avatarToneClass('shiyowo'));
  });

  it('未知のメンバーは既定色（色が無くて落ちない）', () => {
    expect(avatarToneClass('nobody')).toBeTruthy();
    expect(avatarToneClass('nobody')).not.toContain('bg-member-');
  });
});

describe('isDisplayableAvatarUrl', () => {
  // Access の picture クレームは best-effort。**無いのが通常経路**。
  it('https の URL だけを表示可能と判定する', () => {
    expect(isDisplayableAvatarUrl('https://lh3.googleusercontent.com/a/x')).toBe(true);
  });

  it('lh4/lh5/lh6 も通す（Google は複数ホストを使う）', () => {
    expect(isDisplayableAvatarUrl('https://lh5.googleusercontent.com/a/y')).toBe(true);
  });

  // <img src> に javascript: や data: を流さない（CSP がまだ無いので特に）。
  // ホストも固定する: スキームだけ見ると任意のホストから画像を読みに行ける。
  it('https でない / Google 以外のホストは捨てる', () => {
    for (const bad of [
      'http://lh3.googleusercontent.com/a/x',
      'https://evil.example.com/a.png',
      'https://googleusercontent.com.evil.example.com/a.png',
      'data:image/png;base64,AAAA',
      'javascript:alert(1)',
      '//example.com/a.png',
      '',
      '   ',
    ]) {
      expect(isDisplayableAvatarUrl(bad), bad).toBe(false);
    }
  });

  it('文字列でなければ捨てる', () => {
    expect(isDisplayableAvatarUrl(undefined)).toBe(false);
    expect(isDisplayableAvatarUrl(null)).toBe(false);
    expect(isDisplayableAvatarUrl(123)).toBe(false);
    expect(isDisplayableAvatarUrl({})).toBe(false);
  });
});
