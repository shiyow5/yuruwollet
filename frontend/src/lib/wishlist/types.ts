import type { Database } from '../database.types';

export type WishlistItem = Database['public']['Tables']['wishlist_items']['Row'];
export type WishGenre = Database['public']['Enums']['wish_genre'];
export type WishStatus = Database['public']['Enums']['wish_status'];

/** 画面のタブ。アーカイブは「思い出」= ジャンル横断。 */
export type WishTab = WishGenre | 'archive';
