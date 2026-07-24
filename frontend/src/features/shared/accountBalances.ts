import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { queryKeys } from '../../lib/queryKeys';
import { useWriteContext } from './session';
import {
  getAccountBalances,
  listAccountOpenings,
  upsertAccountOpening,
} from '../../lib/data/openings';

/** メンバー×口座 ごとの現在残高（初期残高 + その口座の収支）。両メンバー分が返る（#102）。 */
export function useAccountBalances() {
  return useQuery({
    queryKey: queryKeys.accountBalances(),
    queryFn: () => getAccountBalances(supabase),
  });
}

/** メンバー×口座 ごとの初期残高（#102）。編集フォームの初期値に使う。 */
export function useAccountOpenings() {
  return useQuery({
    queryKey: queryKeys.accountOpenings(),
    queryFn: () => listAccountOpenings(supabase),
  });
}

/**
 * 口座の初期残高を保存する（#102）。口座残高も総残高も動くので、関連する残高系の
 * キャッシュをまとめて無効化する。RLS が member_id = 自分 を強制する。
 */
export function useUpsertAccountOpening() {
  const qc = useQueryClient();
  const ctx = useWriteContext();
  return useMutation({
    mutationFn: (input: { accountId: string; openingBalance: number }) => {
      if (!ctx) throw new Error('セッションが確立していません');
      return upsertAccountOpening(supabase, {
        householdId: ctx.householdId,
        memberId: ctx.memberId,
        accountId: input.accountId,
        openingBalance: input.openingBalance,
      });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.accountOpenings() });
      void qc.invalidateQueries({ queryKey: queryKeys.accountBalances() });
      void qc.invalidateQueries({ queryKey: queryKeys.memberBalances() });
    },
  });
}
