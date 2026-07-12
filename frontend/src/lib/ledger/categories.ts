import type { Category, TxnType } from './types';

export interface CategoryView {
  name: string;
  icon: string;
}

/** category_id を表示名+アイコンに解決する。null/未存在は「未分類」。 */
export function resolveCategory(categories: Category[], id: string | null): CategoryView {
  if (!id) return { name: '未分類', icon: 'help' };
  const c = categories.find((x) => x.id === id);
  if (!c) return { name: '未分類', icon: 'help' };
  return { name: c.name, icon: c.icon ?? 'label' };
}

/** 取引フォームで選べるカテゴリ（種別一致・非system・非archived）を返す。 */
export function selectableCategories(categories: Category[], kind: TxnType): Category[] {
  return categories.filter((c) => c.kind === kind && !c.is_system && !c.is_archived);
}

/** 管理対象のユーザーカテゴリ（非system）を返す。 */
export function userCategories(categories: Category[]): Category[] {
  return categories.filter((c) => !c.is_system);
}
