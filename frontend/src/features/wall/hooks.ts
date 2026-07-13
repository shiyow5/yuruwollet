import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { queryKeys } from '../../lib/queryKeys';
import { useWriteContext } from '../shared/session';
import {
  getCurrentCheckpoint,
  skipCheckpoint,
  confirmCheckpoint,
  type ConfirmInput,
} from '../../lib/data/checkpoints';
import { getServerToday } from '../../lib/data/serverClock';

/**
 * サーバの JST 日付。壁を出すかどうかはこれで判定する（端末時計は信用しない）。
 * タブを開いたまま日付をまたいでも壁が出るよう、定期的に取り直す。
 * enabled=false のときは `?now=` による偽装が効いている（開発/E2E）。
 */
export function useServerToday(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.serverToday(),
    queryFn: () => getServerToday(supabase),
    enabled,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });
}

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

/**
 * 「決定」= RPC で残高調整 + confirmed 化。
 * 拒否されたときも残高/checkpoint を invalidate する（サーバ側が動いている＝手元が古い、ということなので）。
 */
export function useConfirmCheckpoint() {
  const qc = useQueryClient();
  const ctx = useWriteContext();
  return useMutation({
    mutationFn: (input: ConfirmInput) => confirmCheckpoint(supabase, input),
    onSettled: () => invalidateAfterConfirm(qc, ctx?.memberId),
  });
}
