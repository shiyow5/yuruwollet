/**
 * TanStack Query のキー集約。文字列直書きを避け、無効化(invalidate)の対象を
 * 型安全に揃える。すべて純関数で副作用なし。
 */
export const queryKeys = {
  /** 2 メンバーの profile (household スコープで両者取得) */
  profiles: () => ['profiles'] as const,
  /** member 別の現在残高 (v_member_balances) */
  memberBalances: () => ['memberBalances'] as const,
  /** household 共有のカテゴリ一覧 (非archived) */
  categories: () => ['categories'] as const,
  /** そのカテゴリが取引で何件使われているか（削除ダイアログ用） */
  categoryUsage: (categoryId: string | null) => ['categoryUsage', categoryId] as const,
  /** household 共有のアカウント（在り処）一覧（#98） */
  accounts: () => ['accounts'] as const,
  /** そのアカウントが取引で何件使われているか（削除ダイアログ用）（#98） */
  accountUsage: (accountId: string | null) => ['accountUsage', accountId] as const,
  /** member×月 の取引一覧（家計簿ページ） */
  transactions: (memberId: string, month?: string) =>
    ['transactions', memberId, month ?? 'all'] as const,
  /** member の直近 N 件（ダッシュボード履歴）。transactions と同じ接頭辞で一括 invalidate 可能 */
  recentTransactions: (memberId: string, limit: number) =>
    ['transactions', memberId, 'recent', limit] as const,
  /** member×月 の収入/支出サマリ (v_monthly_summary) */
  monthlySummary: (memberId: string, month: string) => ['monthlySummary', memberId, month] as const,
  /** member×月 のカテゴリ別内訳 (v_category_breakdown) */
  categoryBreakdown: (memberId: string, month: string) =>
    ['categoryBreakdown', memberId, month] as const,
  /** member のサブスク一覧 */
  subscriptions: (memberId: string) => ['subscriptions', memberId] as const,
  /** member のサブスク月換算合計 (v_subscription_monthly_total) */
  subscriptionMonthlyTotal: (memberId: string) => ['subscriptionMonthlyTotal', memberId] as const,
  /** USD/JPY 最新為替 (fx_rates) */
  fxRate: () => ['fxRate'] as const,
  /** member×月 の残高確認 checkpoint (24日の壁) */
  checkpoint: (memberId: string, month: string) => ['checkpoint', memberId, month] as const,
  /** サーバが見ている JST の今日 (壁の表示ゲートの判定に使う) */
  serverToday: () => ['serverToday'] as const,
  /** 二人で共有するウィッシュリスト (archived=true が思い出アーカイブ) */
  wishlist: (archived: boolean) => ['wishlist', archived] as const,
  /** member×月 の目標貯金と進捗 (v_savings_progress) */
  savingsProgress: (memberId: string, month: string) =>
    ['savingsProgress', memberId, month] as const,
  /** グラフ用: 直近月の収支推移 / 貯金履歴 / サブスク内訳 */
  monthlyTrend: (memberId: string, fromMonth: string) =>
    ['monthlyTrend', memberId, fromMonth] as const,
  savingsHistory: (memberId: string, fromMonth: string) =>
    ['savingsHistory', memberId, fromMonth] as const,
  subscriptionSlices: (memberId: string) => ['subscriptionSlices', memberId] as const,
} as const;
