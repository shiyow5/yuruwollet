import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { queryKeys } from '../../lib/queryKeys';
import { useWriteContext } from '../shared/session';
import {
  getCurrentCheckpoint,
  skipCheckpoint,
  confirmCheckpoint,
} from '../../lib/data/checkpoints';

/**
 * 当月の残高確認 checkpoint。
 * 別端末で確定した場合にタブ復帰で壁が閉じるよう、フォーカス時に再取得する。
 */
export function useCurrentCheckpoint(memberId: string, month: string) {
  return useQuery({
    queryKey: queryKeys.checkpoint(memberId, month),
    queryFn: () => getCurrentCheckpoint(supabase, memberId, month),
    enabled: memberId !== '',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/** 残高調整で台帳系（残高・取引・月次・内訳）も変わるためまとめて無効化する。 */
function invalidateAfterConfirm(qc: QueryClient, memberId?: string): void {
  void qc.invalidateQueries({ queryKey: ['checkpoint'] });
  void qc.invalidateQueries({ queryKey: queryKeys.memberBalances() });
  void qc.invalidateQueries({
    queryKey: memberId ? ['transactions', memberId] : ['transactions'],
  });
  void qc.invalidateQueries({
    queryKey: memberId ? ['monthlySummary', memberId] : ['monthlySummary'],
  });
  void qc.invalidateQueries({
    queryKey: memberId ? ['categoryBreakdown', memberId] : ['categoryBreakdown'],
  });
}

/** 「後で数える」= skipped を upsert（当日は再表示されない）。 */
export function useSkipCheckpoint() {
  const qc = useQueryClient();
  const ctx = useWriteContext();
  return useMutation({
    mutationFn: (month: string) => {
      if (!ctx) throw new Error('セッションが確立していません');
      return skipCheckpoint(supabase, {
        householdId: ctx.householdId,
        memberId: ctx.memberId,
        month,
      });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['checkpoint'] });
    },
  });
}

/** 「決定」= RPC で残高調整 + confirmed 化。 */
export function useConfirmCheckpoint() {
  const qc = useQueryClient();
  const ctx = useWriteContext();
  return useMutation({
    mutationFn: (actual: number) => confirmCheckpoint(supabase, actual),
    onSettled: () => invalidateAfterConfirm(qc, ctx?.memberId),
  });
}
