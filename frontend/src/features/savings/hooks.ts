import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { queryKeys } from '../../lib/queryKeys';
import { useWriteContext } from '../shared/session';
import {
  getSavingsProgress,
  saveSavingsGoal,
  deleteSavingsGoal,
  updateOpeningBalance,
} from '../../lib/data/savings';

export function useSavingsProgress(memberId: string, month: string) {
  return useQuery({
    queryKey: queryKeys.savingsProgress(memberId, month),
    queryFn: () => getSavingsProgress(supabase, memberId, month),
    enabled: memberId !== '',
  });
}

function invalidateSavings(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['savingsProgress'] });
}

export function useSaveSavingsGoal(month: string) {
  const qc = useQueryClient();
  const ctx = useWriteContext();
  return useMutation({
    mutationFn: (targetAmount: number) => {
      if (!ctx) throw new Error('セッションが確立していません');
      return saveSavingsGoal(supabase, {
        householdId: ctx.householdId,
        memberId: ctx.memberId,
        month,
        targetAmount,
      });
    },
    onSettled: () => invalidateSavings(qc),
  });
}

export function useDeleteSavingsGoal(month: string) {
  const qc = useQueryClient();
  const ctx = useWriteContext();
  return useMutation({
    mutationFn: () => {
      if (!ctx) throw new Error('セッションが確立していません');
      return deleteSavingsGoal(supabase, ctx.memberId, month);
    },
    onSettled: () => invalidateSavings(qc),
  });
}

/**
 * 初期残高。残高（= 初期残高 + Σ収支）が動くので、残高系のキャッシュもまとめて無効化する。
 * 貯金の進捗は取引ベースなので影響しないが、プロフィール自体は変わる。
 */
export function useUpdateOpeningBalance() {
  const qc = useQueryClient();
  const ctx = useWriteContext();
  return useMutation({
    mutationFn: (openingBalance: number) => {
      if (!ctx) throw new Error('セッションが確立していません');
      return updateOpeningBalance(supabase, ctx.memberId, openingBalance);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.profiles() });
      void qc.invalidateQueries({ queryKey: queryKeys.memberBalances() });
    },
  });
}
