import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { queryKeys } from '../../lib/queryKeys';
import { useWriteContext } from '../shared/session';
import {
  listTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '../../lib/data/transactions';
import {
  listCategories,
  createCategory,
  archiveCategory,
  unarchiveCategory,
  deleteCategory,
  getCategoryUsage,
} from '../../lib/data/categories';
import {
  listAccounts,
  createAccount,
  archiveAccount,
  unarchiveAccount,
  deleteAccount,
  getAccountUsage,
} from '../../lib/data/accounts';
import { getMonthlySummary, getCategoryBreakdown } from '../../lib/data/aggregates';
import {
  makeOptimisticTransaction,
  optimisticId,
  prependTransaction,
  keyAcceptsTransaction,
} from '../../lib/ledger/optimistic';
import type {
  Transaction,
  TransactionDraft,
  CategoryDraft,
  AccountDraft,
} from '../../lib/ledger/types';

/**
 * 台帳系（残高・月次・カテゴリ内訳・取引一覧）を無効化する。
 * per-member 設計上、自分の書込は相手のデータを変えないため、memberId が判れば
 * その人のキーに限定して相手キャッシュの無駄な再取得を避ける。
 * memberBalances は両者を 1 クエリで返すため常に全体を無効化する。
 */
export function invalidateLedger(qc: QueryClient, memberId?: string): void {
  void qc.invalidateQueries({
    queryKey: memberId ? ['transactions', memberId] : ['transactions'],
  });
  void qc.invalidateQueries({ queryKey: queryKeys.memberBalances() });
  void qc.invalidateQueries({
    queryKey: memberId ? ['monthlySummary', memberId] : ['monthlySummary'],
  });
  void qc.invalidateQueries({
    queryKey: memberId ? ['categoryBreakdown', memberId] : ['categoryBreakdown'],
  });
  // 目標貯金の進捗（v_savings_progress.saved）は取引から算出される。
  // ここで落とさないと、取引を足した直後にマイページへ戻っても古い貯金額・達成状態が出る。
  void qc.invalidateQueries({
    queryKey: memberId ? ['savingsProgress', memberId] : ['savingsProgress'],
  });
  // グラフ（収支推移・貯金履歴）も取引から作られる。落とさないとグラフだけ古いままになる。
  void qc.invalidateQueries({
    queryKey: memberId ? ['monthlyTrend', memberId] : ['monthlyTrend'],
  });
  void qc.invalidateQueries({
    queryKey: memberId ? ['savingsHistory', memberId] : ['savingsHistory'],
  });
}

// ---- Queries ----
// useMemberBalances は features/shared/members へ移動（ダッシュボード・24日の壁で共用）

export function useCategories() {
  return useQuery({ queryKey: queryKeys.categories(), queryFn: () => listCategories(supabase) });
}

export function useAccounts() {
  return useQuery({ queryKey: queryKeys.accounts(), queryFn: () => listAccounts(supabase) });
}

export function useMonthlySummary(memberId: string, month: string) {
  return useQuery({
    queryKey: queryKeys.monthlySummary(memberId, month),
    queryFn: () => getMonthlySummary(supabase, memberId, month),
    enabled: memberId !== '',
  });
}

export function useCategoryBreakdown(memberId: string, month: string) {
  return useQuery({
    queryKey: queryKeys.categoryBreakdown(memberId, month),
    queryFn: () => getCategoryBreakdown(supabase, memberId, month),
    enabled: memberId !== '',
  });
}

export function useMonthTransactions(memberId: string, month: string) {
  return useQuery({
    queryKey: queryKeys.transactions(memberId, month),
    queryFn: () => listTransactions(supabase, { memberId, month }),
    enabled: memberId !== '',
  });
}

export function useRecentTransactions(memberId: string, limit = 5) {
  return useQuery({
    queryKey: queryKeys.recentTransactions(memberId, limit),
    queryFn: () => listTransactions(supabase, { memberId, limit }),
    enabled: memberId !== '',
  });
}

// ---- Mutations ----

type TxnSnapshot = [readonly unknown[], Transaction[] | undefined][];

/**
 * 取引追加（自分の owner_member_id 固定）。
 * 自分の取引一覧キャッシュを楽観的に先頭挿入し、失敗時はロールバック。
 * 集計（残高/月次/内訳）は onSettled で invalidate して再取得する。
 */
export function useCreateTransaction() {
  const qc = useQueryClient();
  const ctx = useWriteContext();
  return useMutation({
    mutationFn: (draft: TransactionDraft) => {
      if (!ctx) throw new Error('セッションが確立していません');
      return createTransaction(supabase, draft, {
        householdId: ctx.householdId,
        ownerMemberId: ctx.memberId,
      });
    },
    onMutate: async (draft: TransactionDraft): Promise<{ snapshot: TxnSnapshot }> => {
      if (!ctx) return { snapshot: [] };
      const prefix = ['transactions', ctx.memberId];
      await qc.cancelQueries({ queryKey: prefix });
      const snapshot = qc.getQueriesData<Transaction[]>({ queryKey: prefix });
      const optimistic = makeOptimisticTransaction(draft, {
        id: optimisticId(crypto.randomUUID()),
        householdId: ctx.householdId,
        ownerMemberId: ctx.memberId,
        createdAt: new Date().toISOString(),
      });
      // occurred_on が属す月の一覧・all・recent にのみ挿入（別月への混入を防ぐ）
      snapshot.forEach(([key]) => {
        if (keyAcceptsTransaction(key, draft.occurredOn)) {
          qc.setQueryData<Transaction[]>(key, (old) => prependTransaction(old, optimistic));
        }
      });
      return { snapshot };
    },
    onError: (_err, _draft, context) => {
      context?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => invalidateLedger(qc, ctx?.memberId),
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  const ctx = useWriteContext();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: TransactionDraft }) =>
      updateTransaction(supabase, id, draft),
    onSettled: () => invalidateLedger(qc, ctx?.memberId),
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  const ctx = useWriteContext();
  return useMutation({
    mutationFn: (id: string) => deleteTransaction(supabase, id),
    onSettled: () => invalidateLedger(qc, ctx?.memberId),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  const ctx = useWriteContext();
  return useMutation({
    mutationFn: (draft: CategoryDraft) => {
      if (!ctx) throw new Error('セッションが確立していません');
      return createCategory(supabase, draft, { householdId: ctx.householdId });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.categories() });
    },
  });
}

export function useArchiveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveCategory(supabase, id),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.categories() });
    },
  });
}

export function useUnarchiveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unarchiveCategory(supabase, id),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.categories() });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(supabase, id),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.categories() });
    },
  });
}

/**
 * そのカテゴリを使う取引の件数（削除ダイアログで見せる）。
 *
 * **staleTime: 0。ダイアログを開くたびに取り直す。** 取り消せない操作の直前に、
 * 古い「0 件」を見せて「消して大丈夫」と誤認させないため（#71 の削除ダイアログと同じ方針）。
 */
export function useCategoryUsage(categoryId: string | null) {
  return useQuery({
    queryKey: queryKeys.categoryUsage(categoryId),
    queryFn: () => getCategoryUsage(supabase, categoryId as string),
    enabled: categoryId !== null,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

// ---- アカウント（在り処, #98）: カテゴリと同型 ----

export function useCreateAccount() {
  const qc = useQueryClient();
  const ctx = useWriteContext();
  return useMutation({
    mutationFn: (draft: AccountDraft) => {
      if (!ctx) throw new Error('セッションが確立していません');
      return createAccount(supabase, draft, { householdId: ctx.householdId });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts() });
    },
  });
}

export function useArchiveAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveAccount(supabase, id),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts() });
    },
  });
}

export function useUnarchiveAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unarchiveAccount(supabase, id),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts() });
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAccount(supabase, id),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts() });
    },
  });
}

/**
 * そのアカウントを在り処にした取引の件数（削除ダイアログで見せる, #98）。
 * カテゴリ使用数と同じ方針（staleTime: 0 で毎回取り直す）。
 */
export function useAccountUsage(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.accountUsage(accountId),
    queryFn: () => getAccountUsage(supabase, accountId as string),
    enabled: accountId !== null,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
