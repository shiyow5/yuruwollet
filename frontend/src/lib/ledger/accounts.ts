import type { Account } from './types';

export interface AccountView {
  name: string;
  icon: string;
}

/** account_id を表示名+アイコンに解決する。null/未存在は「未設定」（#98）。 */
export function resolveAccount(accounts: Account[], id: string | null): AccountView {
  if (!id) return { name: '未設定', icon: 'help' };
  const a = accounts.find((x) => x.id === id);
  if (!a) return { name: '未設定', icon: 'help' };
  return { name: a.name, icon: a.icon ?? 'account_balance_wallet' };
}

/**
 * 取引フォームで選べるアカウント（非archived）を返す。
 * カテゴリと違い収入/支出で分けない（在り処は種別を問わない）。
 */
export function selectableAccounts(accounts: Account[]): Account[] {
  return accounts.filter((a) => !a.is_archived);
}
