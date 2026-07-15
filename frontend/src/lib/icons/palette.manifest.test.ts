import { describe, expect, it } from 'vitest';
import { SUBSET_ICONS } from './palette';
import manifest from './palette.manifest.json';
import codepoints from './palette.codepoints.json';

/**
 * サブセット済みフォント（material-symbols-subset.woff2）と、その生成物
 * （manifest / codepoints）が palette.json と一致していることを保証する。
 *
 * palette.json を変えたのに `make subset-icons` を忘れると、フォントに glyph が無い
 * アイコンをコードポイント無しで描こうとして静かに壊れる。ここで落として気付かせる。
 */
describe('サブセット生成物の同期（#9）', () => {
  it('manifest が palette の SUBSET_ICONS と一致する（再生成忘れの検出）', () => {
    expect(manifest, 'palette.json を変えたら `make subset-icons` を実行してください').toEqual([
      ...SUBSET_ICONS,
    ]);
  });

  it('codepoints は SUBSET_ICONS の全アイコンを 16 進で持つ', () => {
    const keys = Object.keys(codepoints as Record<string, string>).sort();
    expect(keys).toEqual([...SUBSET_ICONS]);
    for (const [name, cp] of Object.entries(codepoints as Record<string, string>)) {
      expect(cp, `${name} のコードポイントが 16 進でない`).toMatch(/^[0-9a-f]{4,6}$/);
    }
  });
});
