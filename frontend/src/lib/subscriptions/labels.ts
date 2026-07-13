import type { SubStatus, SubCurrency, SubCycle } from './types';

export const STATUS_LABELS: Record<SubStatus, string> = {
  active: '利用中',
  trial: '無料体験中',
  considering_cancel: '解約検討中',
};

export const CURRENCY_LABELS: Record<SubCurrency, string> = {
  JPY: '円 (JPY)',
  USD: 'ドル (USD)',
};

export const CYCLE_LABELS: Record<SubCycle, string> = {
  monthly: '毎月',
  yearly: '毎年',
};
