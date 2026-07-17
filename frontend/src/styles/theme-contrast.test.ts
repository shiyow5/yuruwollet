import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 二次テキスト・アイコンのコントラストが WCAG を満たすことを、**実際の @theme トークン値**で検算する（#13）。
 *
 * custom-text(#25271f) を不透明度で薄めた二次テキストは、13px の通常テキストで AA(4.5:1) を満たすには
 * 全背景で 70% が下限（60% は最も明るくない背景で 3.9〜4.1 しか無く不足）。アイコン等の非テキストは
 * 1.4.11 の 3:1 でよく、アイコンボタンは 60%(約4.0) で満たす。ここを緩めると小さな二次テキストが
 * 読めなくなるので、トークンを変えたらこのテストで気付けるようにする。
 */

// WCAG 相対輝度とコントラスト比。
function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
function contrast(fg: [number, number, number], bg: [number, number, number]): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
/** 前景色を alpha で背景に合成した実効色。opacity ベースの text-custom-text/NN を再現する。 */
function composite(
  fg: [number, number, number],
  alpha: number,
  bg: [number, number, number],
): [number, number, number] {
  return [0, 1, 2].map((i) => Math.round(alpha * fg[i] + (1 - alpha) * bg[i])) as [
    number,
    number,
    number,
  ];
}

// 実際の @theme トークン値を index.css から読む（値を変えたら検算が追随する）。
// vitest は frontend/ を cwd に走るので、そこからの相対で解決する。
const css = readFileSync(resolve(process.cwd(), 'src/styles/index.css'), 'utf8');
function token(name: string): string {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`--color-${name} が index.css に見つからない`);
  return m[1];
}

const TEXT = hexToRgb(token('custom-text'));
// 二次テキストが載る背景（白 + サーフェス各段）。最も明るくない段が最悪ケース。
const BACKGROUNDS = [
  'custom-bg',
  'surface-container-low',
  'surface-container',
  'surface-container-high',
  'surface-container-highest',
].map((n) => ({ name: n, rgb: hexToRgb(token(n)) }));

const AA_NORMAL = 4.5; // 1.4.3 通常テキスト
const AA_NONTEXT = 3.0; // 1.4.11 アイコン等の非テキスト

describe('二次テキストのコントラスト（#13）', () => {
  it('二次テキスト /70 は全背景で AA(4.5:1) を満たす', () => {
    for (const bg of BACKGROUNDS) {
      const ratio = contrast(composite(TEXT, 0.7, bg.rgb), bg.rgb);
      expect(ratio, `custom-text/70 over ${bg.name}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('/60 は AA(4.5:1) に届かない（/70 を下限にする理由）', () => {
    // 最も明るくない背景（highest）で 4.5 未満であることを固定し、安易な緩和を防ぐ。
    const worst = BACKGROUNDS[BACKGROUNDS.length - 1];
    const ratio = contrast(composite(TEXT, 0.6, worst.rgb), worst.rgb);
    expect(ratio).toBeLessThan(AA_NORMAL);
  });

  it('アイコンボタン /60 は非テキストの 3:1 を満たす', () => {
    for (const bg of BACKGROUNDS) {
      const ratio = contrast(composite(TEXT, 0.6, bg.rgb), bg.rgb);
      expect(ratio, `icon /60 over ${bg.name}`).toBeGreaterThanOrEqual(AA_NONTEXT);
    }
  });
});
