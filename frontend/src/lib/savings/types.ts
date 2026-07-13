import type { Database } from '../database.types';

export type SavingsGoal = Database['public']['Tables']['savings_goals']['Row'];

/** v_savings_progress の 1 行（目標が設定されている member×月 のみ存在する）。 */
export interface SavingsProgress {
  household_id: string;
  member_id: string;
  period_month: string;
  target_amount: number;
  /** その人の今月の（収入 − 支出）。残高調整は含まない。**マイナスにもなりうる**。 */
  saved: number;
  achieved: boolean;
}
