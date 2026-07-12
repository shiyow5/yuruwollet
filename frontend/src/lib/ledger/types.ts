import type { Tables, Enums } from '../database.types';

/** DB 由来のドメイン型（生成型の別名。UI/データ層で共有）。 */
export type Transaction = Tables<'transactions'>;
export type Category = Tables<'categories'>;
export type Profile = Tables<'profiles'>;
export type MemberBalance = Tables<'v_member_balances'>;
export type MonthlySummary = Tables<'v_monthly_summary'>;
export type CategoryBreakdownRow = Tables<'v_category_breakdown'>;

export type TxnType = Enums<'txn_type'>;
export type CategoryKind = Enums<'category_kind'>;

/** フォーム検証後の取引ドラフト（DB へ書き込む正規化済みの値）。 */
export interface TransactionDraft {
  type: TxnType;
  amount: number;
  categoryId: string | null;
  occurredOn: string;
  memo: string;
}

/** フォーム検証後のカテゴリドラフト。 */
export interface CategoryDraft {
  kind: TxnType;
  name: string;
  icon: string;
}
