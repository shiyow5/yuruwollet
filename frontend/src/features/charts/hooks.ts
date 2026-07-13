import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { queryKeys } from '../../lib/queryKeys';
import {
  listMonthlySummaries,
  listSavingsHistory,
  listSubscriptionSlices,
} from '../../lib/data/charts';
import { getCategoryBreakdown } from '../../lib/data/aggregates';

export function useMonthlyTrend(memberId: string, fromMonth: string) {
  return useQuery({
    queryKey: queryKeys.monthlyTrend(memberId, fromMonth),
    queryFn: () => listMonthlySummaries(supabase, memberId, fromMonth),
    enabled: memberId !== '',
  });
}

export function useSavingsHistory(memberId: string, fromMonth: string) {
  return useQuery({
    queryKey: queryKeys.savingsHistory(memberId, fromMonth),
    queryFn: () => listSavingsHistory(supabase, memberId, fromMonth),
    enabled: memberId !== '',
  });
}

export function useSubscriptionSlices(memberId: string) {
  return useQuery({
    queryKey: queryKeys.subscriptionSlices(memberId),
    queryFn: () => listSubscriptionSlices(supabase, memberId),
    enabled: memberId !== '',
  });
}

/** 当月のカテゴリ別内訳（ダッシュボードと同じクエリキーを共有する）。 */
export function useCategoryBreakdown(memberId: string, month: string) {
  return useQuery({
    queryKey: queryKeys.categoryBreakdown(memberId, month),
    queryFn: () => getCategoryBreakdown(supabase, memberId, month),
    enabled: memberId !== '',
  });
}
