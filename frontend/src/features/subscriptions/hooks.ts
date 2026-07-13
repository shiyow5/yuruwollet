import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { queryKeys } from '../../lib/queryKeys';
import { useWriteContext } from '../shared/session';
import {
  listSubscriptions,
  getLatestFxRate,
  getSubscriptionMonthlyTotal,
  createSubscription,
  updateSubscription,
  deleteSubscription,
} from '../../lib/data/subscriptions';
import type { SubscriptionDraft } from '../../lib/subscriptions/types';

// ---- Queries ----

export function useSubscriptions(memberId: string) {
  return useQuery({
    queryKey: queryKeys.subscriptions(memberId),
    queryFn: () => listSubscriptions(supabase, memberId),
    enabled: memberId !== '',
  });
}

export function useSubscriptionMonthlyTotal(memberId: string) {
  return useQuery({
    queryKey: queryKeys.subscriptionMonthlyTotal(memberId),
    queryFn: () => getSubscriptionMonthlyTotal(supabase, memberId),
    enabled: memberId !== '',
  });
}

export function useLatestFxRate() {
  return useQuery({ queryKey: queryKeys.fxRate(), queryFn: () => getLatestFxRate(supabase) });
}

// ---- Mutations ----

/** 自分のサブスク系（一覧・月換算合計）を無効化する。 */
function invalidateSubs(qc: QueryClient, memberId?: string): void {
  void qc.invalidateQueries({
    queryKey: memberId ? queryKeys.subscriptions(memberId) : ['subscriptions'],
  });
  void qc.invalidateQueries({
    queryKey: memberId
      ? queryKeys.subscriptionMonthlyTotal(memberId)
      : ['subscriptionMonthlyTotal'],
  });
}

export function useCreateSubscription() {
  const qc = useQueryClient();
  const ctx = useWriteContext();
  const { data: fx = null } = useLatestFxRate();
  return useMutation({
    mutationFn: (draft: SubscriptionDraft) => {
      if (!ctx) throw new Error('セッションが確立していません');
      return createSubscription(supabase, draft, fx, {
        householdId: ctx.householdId,
        ownerMemberId: ctx.memberId,
      });
    },
    onSettled: () => invalidateSubs(qc, ctx?.memberId),
  });
}

export function useUpdateSubscription() {
  const qc = useQueryClient();
  const ctx = useWriteContext();
  const { data: fx = null } = useLatestFxRate();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: SubscriptionDraft }) =>
      updateSubscription(supabase, id, draft, fx),
    onSettled: () => invalidateSubs(qc, ctx?.memberId),
  });
}

export function useDeleteSubscription() {
  const qc = useQueryClient();
  const ctx = useWriteContext();
  return useMutation({
    mutationFn: (id: string) => deleteSubscription(supabase, id),
    onSettled: () => invalidateSubs(qc, ctx?.memberId),
  });
}
