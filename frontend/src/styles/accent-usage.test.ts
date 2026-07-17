import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * ブランド色を文字に使わせない（#90）。
 *
 * `--color-custom-accent`(#769cbf) は白の上で 2.885:1 しかなく、AA(4.5:1) はもちろん
 * 非テキストの 3:1 にも届かない。**塗り専用**（ボタン背景・選択状態・淡い下地・グラフ）とし、
 * 文字とアイコンは `accent-text` を使う。
 *
 * トークンを足しただけでは意味がないので、**使われ方**をここで守る。
 * theme-contrast.test.ts が「色が足りているか」を、こちらが「正しい方を使っているか」を見る。
 */

/** src 配下の実装ファイル。**.css も含める**（@apply で書かれたら .tsx だけ見ても拾えない）。 */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(tsx?|css)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const SRC = resolve(process.cwd(), 'src');

/**
 * ブランド色を文字色にする書き方。
 * **`text-primary` を忘れていて、WishlistItemCard のリンクが素通りしていた**
 * （`--color-primary` は custom-accent と同じ値の別名）。別名を足したらここにも足す。
 */
const FORBIDDEN = ['text-custom-accent', 'text-primary'];

describe('accent の使われ方（#90）', () => {
  it('ブランド色を文字色に使っているファイルが無い（文字には accent-text を使う）', () => {
    const offenders = walk(SRC)
      .filter((f) => {
        const src = readFileSync(f, 'utf8');
        return FORBIDDEN.some((cls) => new RegExp(`${cls}(?![\\w-])`).test(src));
      })
      .map((f) => f.slice(SRC.length + 1));

    expect(
      offenders,
      `ブランド色を文字色に使っている: ${offenders.join(', ')}\n` +
        '文字・アイコンは text-accent-text を使うこと（塗りの bg-custom-accent はそのままでよい）',
    ).toEqual([]);
  });

  it('index.css も検査対象に含まれている（@apply で書かれても拾う）', () => {
    // walk が .css を落としていたら、この検査自体が意味を失う。
    const scanned = walk(SRC).map((f) => f.slice(SRC.length + 1));
    expect(scanned).toContain('styles/index.css');
  });
});
