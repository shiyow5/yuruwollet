import type { Tables, Enums } from '../database.types';

export type Subscription = Tables<'subscriptions'>;
export type FxRate = Tables<'fx_rates'>;
export type SubscriptionMonthlyTotal = Tables<'v_subscription_monthly_total'>;

export type SubCurrency = Enums<'sub_currency'>;
export type SubCycle = Enums<'sub_cycle'>;
export type SubStatus = Enums<'sub_status'>;

/** フォーム検証後のサブスクドラフト（通貨は元通貨、金額は元通貨建て）。 */
export interface SubscriptionDraft {
  name: string;
  currency: SubCurrency;
  originalAmount: number;
  cycle: SubCycle;
  nextRenewalDate: string;
  status: SubStatus;
}
