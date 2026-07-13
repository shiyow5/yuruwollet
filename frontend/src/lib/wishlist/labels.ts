import type { ChipTone } from '../../components/ui';
import type { WishGenre, WishStatus, WishTab } from './types';

export const GENRES: readonly WishGenre[] = ['want', 'place'] as const;

export function genreLabel(genre: WishGenre): string {
  return genre === 'want' ? 'ほしい物' : '行きたい場所';
}

export function genreIcon(genre: WishGenre): string {
  return genre === 'want' ? 'shopping_bag' : 'place';
}

export function tabLabel(tab: WishTab): string {
  return tab === 'archive' ? '思い出' : genreLabel(tab);
}

/** ステータスの見え方はジャンルで変わる（買う / 行く）。 */
export function statusLabel(genre: WishGenre, status: WishStatus): string {
  if (genre === 'want') return status === 'done' ? '購入済み' : '未購入';
  return status === 'done' ? '訪問済み' : '未訪問';
}

export function statusTone(status: WishStatus): ChipTone {
  return status === 'done' ? 'success' : 'neutral';
}

/** 「済み」にしたときのボタン文言。 */
export function completeLabel(genre: WishGenre): string {
  return genre === 'want' ? '買った！' : '行った！';
}
