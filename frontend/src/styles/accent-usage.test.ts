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

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const SRC = resolve(process.cwd(), 'src');

describe('accent の使われ方（#90）', () => {
  it('text-custom-accent を使っているファイルが無い（文字には accent-text を使う）', () => {
    const offenders = walk(SRC)
      .filter((f) => readFileSync(f, 'utf8').includes('text-custom-accent'))
      .map((f) => f.slice(SRC.length + 1));

    expect(
      offenders,
      `ブランド色を文字色に使っている: ${offenders.join(', ')}\n` +
        '文字・アイコンは text-accent-text を使うこと（塗りの bg-custom-accent はそのままでよい）',
    ).toEqual([]);
  });

  it('塗りとしての custom-accent は今も使われている（分離が行き過ぎていない）', () => {
    const fills = walk(SRC).filter((f) => /bg-custom-accent/.test(readFileSync(f, 'utf8')));
    expect(fills.length).toBeGreaterThan(0);
  });
});
