import { describe, expect, it } from 'vitest';
import {
  GENRES,
  genreLabel,
  genreIcon,
  tabLabel,
  statusLabel,
  statusTone,
  completeLabel,
} from './labels';

describe('wishlist ラベル', () => {
  it('ジャンルは ほしい物 / 行きたい場所 の 2 種', () => {
    expect(GENRES).toEqual(['want', 'place']);
    expect(genreLabel('want')).toBe('ほしい物');
    expect(genreLabel('place')).toBe('行きたい場所');
    expect(genreIcon('want')).not.toBe(genreIcon('place'));
  });

  it('アーカイブタブは「思い出」', () => {
    expect(tabLabel('archive')).toBe('思い出');
    expect(tabLabel('want')).toBe('ほしい物');
  });

  // 「買う」と「行く」でステータスの見え方が変わる
  it('ステータス文言はジャンルで変わる', () => {
    expect(statusLabel('want', 'planned')).toBe('未購入');
    expect(statusLabel('want', 'done')).toBe('購入済み');
    expect(statusLabel('place', 'planned')).toBe('未訪問');
    expect(statusLabel('place', 'done')).toBe('訪問済み');
  });

  it('達成済みは success トーン', () => {
    expect(statusTone('done')).toBe('success');
    expect(statusTone('planned')).toBe('neutral');
  });

  it('達成ボタンの文言もジャンルで変わる', () => {
    expect(completeLabel('want')).toBe('買った！');
    expect(completeLabel('place')).toBe('行った！');
  });
});
