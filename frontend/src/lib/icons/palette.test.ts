import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  UI_ICONS,
  CATEGORY_ICONS,
  CATEGORY_ICON_GROUPS,
  ACCOUNT_ICONS,
  ACCOUNT_ICON_GROUPS,
  SUBSET_ICONS,
  isCategoryIcon,
  isAccountIcon,
  DEFAULT_CATEGORY_ICON,
  DEFAULT_ACCOUNT_ICON,
} from './palette';
import { genreIcon, GENRES } from '../wishlist/labels';

const srcRoot = resolve(__dirname, '../..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    // テストは対象外（テスト用のダミー名 'not_a_real_icon' 等を拾わないため）
    if (/\.test\.[tj]sx?$/.test(entry)) return [];
    return /\.(tsx?|jsx?)$/.test(entry) ? [full] : [];
  });
}

/**
 * ソース中で Material Symbols アイコン名として使っている箇所を **静的に** 集める。
 *
 * 以前はリテラルの `<Icon name="x">` しか見ておらず、`name={actionIcon}` や
 * `<EmptyState icon="x">`、`icon = 'inbox'`（既定値）を見逃していた（#9 のレビュー指摘）。
 * ここでは icon を渡しうる書き方を広めに拾う:
 *   1. <Icon|IconTile ... name="x">
 *   2. （任意の識別子）icon [:=] 'x' / "x"     … icon= / actionIcon= / icon: / 既定値 icon='x'
 *   3. name={...} / icon={...} 式の中の三項・フォールバックの値
 *        … icon={cond ? 'a' : 'b'} / name={c.icon ?? 'label'}（条件側の比較文字列は拾わない）
 * 関数が返すアイコン（genreIcon など）は静的に追えないので、別途 exercise する。
 */
function usedIconNames(): Set<string> {
  const names = new Set<string>();
  const LIT = /['"]([a-z][a-z0-9_]{2,})['"]/;
  for (const file of walk(srcRoot)) {
    const code = readFileSync(file, 'utf8');
    for (const m of code.matchAll(/<Icon(?:Tile)?\b[^>]*?\bname="([a-z0-9_]+)"/gs)) {
      names.add(m[1]);
    }
    for (const m of code.matchAll(
      /\b[a-zA-Z]*[Ii]con\s*[:=]\s*\{?\s*['"]([a-z][a-z0-9_]{2,})['"]/g,
    )) {
      names.add(m[1]);
    }
    // name={...} / icon={...} / *Icon={...} 式の中の三項・?? の「値」位置だけを拾う。
    // 比較の条件側（=== 'archive' 等）は ? / : / ?? の後ろではないので拾わない。
    for (const m of code.matchAll(/\b(?:name|[a-zA-Z]*[Ii]con)\s*=\s*\{([^{}]*)\}/g)) {
      for (const vm of m[1].matchAll(new RegExp(`(?:[?:]|\\?\\?)\\s*${LIT.source}`, 'g'))) {
        names.add(vm[1]);
      }
    }
  }
  return names;
}

// seed（20260712141714_seed_baseline.sql）が入れるカテゴリアイコン。
const SEED_CATEGORY_ICONS = [
  'restaurant',
  'local_cafe',
  'directions_subway',
  'celebration',
  'bolt',
  'more_horiz',
  'work',
  'volunteer_activism',
];

// seed（20260724120000_accounts.sql）が入れるアカウントアイコン。
const SEED_ACCOUNT_ICONS = [
  'payments',
  'account_balance',
  'credit_card',
  'qr_code_2',
  'smartphone',
];

describe('アイコンパレット（#9 サブセットの単一の真実）', () => {
  it('ソースで使う全アイコンがサブセットに含まれる（chrome が文字化けしない）', () => {
    // 静的に拾えるもの（リテラル・icon= 属性・既定値・フォールバック）
    const used = usedIconNames();
    // 関数が返すアイコンは静的に追えないので明示的に回す（genreIcon は 'place' 等を返す）
    for (const g of GENRES) used.add(genreIcon(g));

    expect(used.size).toBeGreaterThan(20);
    const missing = [...used].filter((n) => !SUBSET_ICONS.includes(n));
    expect(missing, `パレット未登録のアイコン: ${missing.join(', ')}`).toEqual([]);
  });

  it('seed のカテゴリアイコンはすべてカテゴリパレットにある（描画・選択できる）', () => {
    const missing = SEED_CATEGORY_ICONS.filter((n) => !CATEGORY_ICONS.includes(n));
    expect(missing, `seed だがパレットに無い: ${missing.join(', ')}`).toEqual([]);
  });

  it('seed のアカウントアイコンはすべてアカウントパレットにある（#98）', () => {
    const missing = SEED_ACCOUNT_ICONS.filter((n) => !ACCOUNT_ICONS.includes(n));
    expect(missing, `seed だがパレットに無い: ${missing.join(', ')}`).toEqual([]);
  });

  it('SUBSET_ICONS は ui ∪ categories ∪ accounts（重複なし・ソート済み）', () => {
    const expected = Array.from(new Set([...UI_ICONS, ...CATEGORY_ICONS, ...ACCOUNT_ICONS])).sort();
    expect(SUBSET_ICONS).toEqual(expected);
    expect(new Set(SUBSET_ICONS).size).toBe(SUBSET_ICONS.length);
  });

  it('各カテゴリグループ内にアイコンの重複が無い', () => {
    for (const g of CATEGORY_ICON_GROUPS) {
      expect(new Set(g.icons).size, `${g.group} に重複`).toBe(g.icons.length);
    }
  });

  it('各アカウントグループ内にアイコンの重複が無い（#98）', () => {
    for (const g of ACCOUNT_ICON_GROUPS) {
      expect(new Set(g.icons).size, `${g.group} に重複`).toBe(g.icons.length);
    }
  });

  it('isCategoryIcon はカテゴリパレットのみ true', () => {
    expect(isCategoryIcon('restaurant')).toBe(true);
    expect(isCategoryIcon(DEFAULT_CATEGORY_ICON)).toBe(true);
    expect(isCategoryIcon('not_a_real_icon')).toBe(false);
    expect(isCategoryIcon('chevron_left')).toBe(false);
  });

  it('isAccountIcon はアカウントパレットのみ true（#98）', () => {
    expect(isAccountIcon('credit_card')).toBe(true);
    expect(isAccountIcon(DEFAULT_ACCOUNT_ICON)).toBe(true);
    expect(isAccountIcon('not_a_real_icon')).toBe(false);
    expect(isAccountIcon('restaurant')).toBe(false);
  });
});
