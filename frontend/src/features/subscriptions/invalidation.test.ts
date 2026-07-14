import { describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { useDeleteSubscription } from './hooks';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../lib/data/subscriptions', () => ({
  listSubscriptions: vi.fn(async () => []),
  createSubscription: vi.fn(async () => ({})),
  updateSubscription: vi.fn(async () => ({})),
  deleteSubscription: vi.fn(async () => 0),
  getSubscriptionPayments: vi.fn(async () => ({ count: 0, total: 0 })),
  settleMySubscriptions: vi.fn(async () => 0),
  getSubscriptionMonthlyTotal: vi.fn(async () => 0),
  getLatestFxRate: vi.fn(async () => null),
}));

const session: SessionState = {
  status: 'authenticated',
  session: {
    supabaseJwt: 'jwt',
    expiresAt: 9999999999,
    member: { id: 'yururi', displayName: 'ゆるり' },
    householdId: 'main',
  },
};

/**
 * **サブスクの削除は台帳を書き換える。**
 *
 * - 「支払いも消す」を選べば、当然 transactions から行が消える。
 * - 選ばなくても、FK の `on delete set null` で `subscription_id` が外れ、
 *   その行は「サブスクの支払い」から「ただの支出」に変わる
 *   （バッジの表示が変わり、編集・削除できるようになる。TransactionItem の actionable）。
 *
 * どちらの場合も台帳のキャッシュを落とさないと、**ホームも家計簿も古いまま**になる。
 * 実際にこれが抜けていて、本番で「サブスクを消したのにホームと家計簿に反映されない」
 * という報告が出た（#71）。作成・更新は settleThenRefresh 経由で落としていたが、
 * **削除だけ invalidateSubs しか呼んでいなかった**。
 */
describe('サブスクの削除は台帳の派生クエリも invalidate する', () => {
  it('削除すると残高・月次・カテゴリ別・取引一覧を落とす', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(qc, 'invalidateQueries');

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(
        QueryClientProvider,
        { client: qc },
        createElement(SessionContext.Provider, { value: session }, children),
      );

    const { result } = renderHook(() => useDeleteSubscription(), { wrapper });

    act(() => {
      result.current.mutate({ id: 'sub-1', deletePayments: false });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));

    // サブスク側（元から落としていた）
    expect(keys.some((k) => k?.includes('subscriptions'))).toBe(true);
    // 台帳側（落とせていなかった）
    expect(keys.some((k) => k?.includes('memberBalances'))).toBe(true);
    expect(keys.some((k) => k?.includes('transactions'))).toBe(true);
    expect(keys.some((k) => k?.includes('monthlySummary'))).toBe(true);
    expect(keys.some((k) => k?.includes('categoryBreakdown'))).toBe(true);
  });
});
