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
  getSubscriptionPayments,
  settleMySubscriptions,
} from '../../lib/data/subscriptions';
import { invalidateLedger } from '../ledger/hooks';
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

/**
 * 到来済みの支払いを台帳に記録する（DB 側の精算 RPC）。
 *
 * サブスクを **更新日が今日/過去** の状態で登録・編集したとき、これを呼ばないと
 * 次の cron（JST 00:00）まで台帳・残高・グラフに出ない。「登録したのに効いていない」
 * ように見えるので、その場で反映する。
 *
 * 更新日が未来なら何も起きない（まだ課金されていないので、それが正しい）。
 * 何度呼んでも増えない（DB の unique 制約が二重計上を弾く）。
 *
 * **精算が失敗しても、サブスクの登録自体は成功している。** ここで例外を投げて
 * 「登録できませんでした」と見せるのは嘘になるので、失敗しても握りつぶす
 * （その場合は次の cron が拾う）。
 */
async function settleThenRefresh(qc: QueryClient, memberId?: string): Promise<void> {
  try {
    const recorded = await settleMySubscriptions(supabase);
    if (recorded > 0) {
      invalidateLedger(qc, memberId);
    }
  } catch {
    // 次の cron が拾う。登録自体は成功しているので、ここでは何も見せない。
  }
}

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
  // サブスク内訳グラフもこのデータから作られる。落とさないとグラフだけ古いままになる。
  void qc.invalidateQueries({
    queryKey: memberId ? ['subscriptionSlices', memberId] : ['subscriptionSlices'],
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
    onSuccess: () => settleThenRefresh(qc, ctx?.memberId),
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
    // 更新日を過去/今日に変えた場合も、その場で台帳に反映する
    onSuccess: () => settleThenRefresh(qc, ctx?.memberId),
    onSettled: () => invalidateSubs(qc, ctx?.memberId),
  });
}

/** そのサブスクが台帳に作った支払いの件数と合計（削除ダイアログで見せる）。 */
export function useSubscriptionPayments(subscriptionId: string | null) {
  return useQuery({
    queryKey: ['subscriptionPayments', subscriptionId],
    queryFn: () => getSubscriptionPayments(supabase, subscriptionId as string),
    enabled: subscriptionId !== null,
  });
}

export function useDeleteSubscription() {
  const qc = useQueryClient();
  const ctx = useWriteContext();
  return useMutation({
    mutationFn: ({ id, deletePayments }: { id: string; deletePayments: boolean }) =>
      deleteSubscription(supabase, id, deletePayments),
    onSettled: () => {
      invalidateSubs(qc, ctx?.memberId);
      // **削除は台帳を書き換える。ここを落とさないとホームも家計簿も古いまま。**
      //
      // - 「支払いも消す」なら transactions から行が消える
      // - 消さなくても、FK の on delete set null で subscription_id が外れ、
      //   その行は「サブスクの支払い」→「ただの支出」に変わる
      //   （バッジが変わり、編集・削除できるようになる）
      //
      // 作成・更新は settleThenRefresh 経由で落としていたのに、**削除だけ抜けていた**。
      // 本番で「サブスクを消したのにホームと家計簿に反映されない」と報告された（#71）。
      invalidateLedger(qc, ctx?.memberId);
      void qc.invalidateQueries({ queryKey: ['subscriptionPayments'] });
    },
  });
}
