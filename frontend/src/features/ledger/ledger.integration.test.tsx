import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { createQueryClient } from '../../lib/queryClient';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { addMonths, jstMonthStart } from '../../lib/format';
import { LedgerPage } from '../../app/pages/LedgerPage';
import type { Transaction } from '../../lib/ledger/types';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

// 共有インメモリ store（vi.hoisted で mock 工場と test 双方から参照）
const state = vi.hoisted(() => ({ rows: [] as Transaction[], counter: 0 }));

vi.mock('../../lib/data/transactions', () => ({
  listTransactions: vi.fn(async (_c: unknown, params: { memberId: string; limit?: number }) => {
    const rows = state.rows.filter((t) => t.owner_member_id === params.memberId);
    return params.limit != null ? rows.slice(0, params.limit) : rows;
  }),
  createTransaction: vi.fn(
    async (
      _c: unknown,
      draft: {
        type: 'income' | 'expense';
        amount: number;
        categoryId: string | null;
        occurredOn: string;
        memo: string;
      },
      ctx: { householdId: string; ownerMemberId: string },
    ) => {
      const created: Transaction = {
        id: `srv-${state.counter++}`,
        household_id: ctx.householdId,
        owner_member_id: ctx.ownerMemberId,
        type: draft.type,
        amount: draft.amount,
        category_id: draft.categoryId,
        memo: draft.memo,
        occurred_on: draft.occurredOn,
        is_system_generated: false,
        subscription_id: null,
        created_at: '2026-07-13T05:30:00Z',
        updated_at: '2026-07-13T05:30:00Z',
      };
      state.rows = [created, ...state.rows];
      return created;
    },
  ),
  updateTransaction: vi.fn(
    async (
      _c: unknown,
      id: string,
      draft: {
        type: 'income' | 'expense';
        amount: number;
        categoryId: string | null;
        occurredOn: string;
        memo: string;
      },
    ) => {
      state.rows = state.rows.map((r) =>
        r.id === id
          ? {
              ...r,
              type: draft.type,
              amount: draft.amount,
              category_id: draft.categoryId,
              memo: draft.memo,
              occurred_on: draft.occurredOn,
            }
          : r,
      );
      return state.rows.find((r) => r.id === id)!;
    },
  ),
  deleteTransaction: vi.fn(async (_c: unknown, id: string) => {
    state.rows = state.rows.filter((r) => r.id !== id);
  }),
}));

const CATEGORY_ID = '11111111-1111-1111-1111-111111111111';

const ARCHIVED_CATEGORY_ID = '22222222-2222-2222-2222-222222222222';

vi.mock('../../lib/data/categories', () => ({
  listCategories: vi.fn(async () => [
    {
      id: '11111111-1111-1111-1111-111111111111',
      household_id: 'main',
      kind: 'expense',
      name: '食費',
      icon: 'restaurant',
      sort_order: 0,
      is_system: false,
      is_archived: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      household_id: 'main',
      kind: 'expense',
      name: '旧カテゴリ',
      icon: 'label',
      sort_order: 1,
      is_system: false,
      is_archived: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ]),
  createCategory: vi.fn(),
  archiveCategory: vi.fn(),
  unarchiveCategory: vi.fn(),
}));

vi.mock('../../lib/data/aggregates', () => ({
  listProfiles: vi.fn(async () => [
    {
      household_id: 'main',
      member_id: 'yururi',
      display_name: 'ゆるり',
      email: null,
      opening_balance: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      household_id: 'main',
      member_id: 'shiyowo',
      display_name: 'しよを',
      email: null,
      opening_balance: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ]),
  getMemberBalances: vi.fn(async () => []),
  getMonthlySummary: vi.fn(async () => null),
  getCategoryBreakdown: vi.fn(async () => []),
}));

import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  listTransactions,
} from '../../lib/data/transactions';

function row(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 'seed-1',
    household_id: 'main',
    owner_member_id: 'yururi',
    type: 'expense',
    amount: 4500,
    category_id: CATEGORY_ID,
    memo: 'スーパー',
    occurred_on: '2026-07-10',
    is_system_generated: false,
    subscription_id: null,
    created_at: '2026-07-10T05:30:00Z',
    updated_at: '2026-07-10T05:30:00Z',
    ...over,
  };
}

const authedSession: SessionState = {
  status: 'authenticated',
  session: {
    supabaseJwt: 'jwt',
    expiresAt: 9999999999,
    member: { id: 'yururi', displayName: 'ゆるり' },
    householdId: 'main',
  },
};

function renderLedger(session: SessionState = authedSession, route = '/ledger') {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={session}>
        <MemoryRouter initialEntries={[route]}>
          <LedgerPage />
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

// 型補助（mock 実装の上書き用）
const mockCreate = createTransaction as unknown as {
  mockImplementationOnce: (fn: () => Promise<unknown>) => void;
};
const mockDelete = deleteTransaction as unknown as {
  mockImplementationOnce: (fn: () => Promise<unknown>) => void;
};

describe('LedgerPage 統合', () => {
  beforeEach(() => {
    state.rows = [];
    state.counter = 0;
    vi.clearAllMocks();
  });

  it('自分表示では自分/相手タブと追加 FAB が出る', async () => {
    renderLedger();
    expect(await screen.findByRole('tab', { name: 'ゆるり' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'しよを' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '収支を追加' })).toBeInTheDocument();
  });

  it('収支を追加するとフォームが閉じ一覧に反映される', async () => {
    renderLedger();
    fireEvent.click(await screen.findByRole('button', { name: '収支を追加' }));

    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('option', { name: '食費' });
    fireEvent.change(within(dialog).getByPlaceholderText('0'), { target: { value: '3,000' } });
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: CATEGORY_ID } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加' }));

    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1));
    const [, draft, ctx] = (createTransaction as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0];
    expect(draft).toMatchObject({
      type: 'expense',
      amount: 3000,
      categoryId: CATEGORY_ID,
      memo: '',
    });
    expect(ctx).toEqual({ householdId: 'main', ownerMemberId: 'yururi' });

    expect(await screen.findByText('- ¥3,000')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('楽観更新: サーバー応答前でも一覧に「保存中…」で表示される', async () => {
    mockCreate.mockImplementationOnce(() => new Promise(() => {})); // 永遠に未解決
    renderLedger();
    fireEvent.click(await screen.findByRole('button', { name: '収支を追加' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('0'), { target: { value: '2,000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加' }));

    // サーバーは応答していないが楽観行が出る
    const amount = await screen.findByText('- ¥2,000');
    const listRow = amount.closest('li');
    expect(listRow).not.toBeNull();
    // 行のサブタイトルが「保存中…」（楽観 pending 表示）
    expect(within(listRow as HTMLElement).getByText('保存中…')).toBeInTheDocument();
  });

  it('追加が失敗すると楽観行がロールバックされる', async () => {
    state.rows = [row({ id: 'seed-1', memo: '既存', amount: 1000 })];
    mockCreate.mockImplementationOnce(async () => {
      throw new Error('rls denied');
    });
    renderLedger();
    // 既存行が見えている
    expect(await screen.findByText('既存')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '収支を追加' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('0'), { target: { value: '7,777' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加' }));

    // ロールバック後: 楽観行は消え、既存行は残る
    await waitFor(() => expect(screen.queryByText('- ¥7,777')).toBeNull());
    expect(screen.getByText('既存')).toBeInTheDocument();
  });

  it('編集: 既存値がプリフィルされ、更新すると反映される', async () => {
    state.rows = [row({ id: 'seed-1', memo: 'カフェ', amount: 4500 })];
    renderLedger();
    fireEvent.click(await screen.findByRole('button', { name: '編集' }));

    const dialog = await screen.findByRole('dialog');
    const amountInput = within(dialog).getByPlaceholderText('0');
    expect(amountInput).toHaveValue('4500'); // プリフィル
    fireEvent.change(amountInput, { target: { value: '5000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '更新' }));

    await waitFor(() => expect(updateTransaction).toHaveBeenCalledTimes(1));
    const [, id, draft] = (updateTransaction as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0];
    expect(id).toBe('seed-1');
    expect(draft).toMatchObject({ amount: 5000 });
    expect(await screen.findByText('- ¥5,000')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('削除: confirm=true で削除され、一覧から消える', async () => {
    state.rows = [row({ id: 'seed-1', memo: '削除対象' })];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderLedger();
    expect(await screen.findByText('削除対象')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '削除' }));

    await waitFor(() => expect(deleteTransaction).toHaveBeenCalledTimes(1));
    expect(
      (deleteTransaction as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1],
    ).toBe('seed-1');
    await waitFor(() => expect(screen.queryByText('削除対象')).toBeNull());
  });

  it('削除: confirm=false では削除しない', async () => {
    state.rows = [row({ id: 'seed-1', memo: '残す' })];
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderLedger();
    expect(await screen.findByText('残す')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(deleteTransaction).not.toHaveBeenCalled();
    expect(screen.getByText('残す')).toBeInTheDocument();
  });

  it('相手表示: FAB が消え、一覧データも相手のものに差し替わる', async () => {
    state.rows = [row({ id: 'seed-1', memo: 'ゆるりの記録' })];
    renderLedger();
    expect(await screen.findByText('ゆるりの記録')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'しよを' }));
    // 書込導線は消える
    await waitFor(() => expect(screen.queryByRole('button', { name: '収支を追加' })).toBeNull());
    // しよを のデータ（空）に差し替わり、ゆるりの記録は消える
    await waitFor(() => expect(screen.queryByText('ゆるりの記録')).toBeNull());
    expect(listTransactions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ memberId: 'shiyowo' }),
    );
  });

  it('月ナビ: 次の月で翌月の取引を再取得する', async () => {
    renderLedger();
    await screen.findByRole('button', { name: '収支を追加' });
    const calls = (listTransactions as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const firstMonth = (calls[0][1] as { month?: string }).month ?? jstMonthStart();

    fireEvent.click(screen.getByRole('button', { name: '次の月' }));
    await waitFor(() => {
      const months = (
        listTransactions as unknown as { mock: { calls: unknown[][] } }
      ).mock.calls.map((c) => (c[1] as { month?: string }).month);
      expect(months).toContain(addMonths(firstMonth, 1));
    });
  });

  it('残高調整(system)行は編集/削除ボタンを出さない', async () => {
    state.rows = [
      row({ id: 'seed-1', memo: '通常', is_system_generated: false }),
      row({ id: 'sys-1', memo: '残高調整', is_system_generated: true }),
    ];
    renderLedger();
    expect(await screen.findByText('残高調整')).toBeInTheDocument();
    expect(screen.getByText('通常')).toBeInTheDocument();
    // 編集/削除ボタンは通常行の分のみ（system 行には出ない）
    expect(screen.getAllByRole('button', { name: '編集' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '削除' })).toHaveLength(1);
  });

  // cron が作ったサブスクの支払いは is_system_generated=false（実支出なので集計に含める）。
  // 一方、更新日は既に進んでいるので、消されても二度と復活しない。DB 側で削除・更新とも
  // 拒否しているため、ボタンを出すと「押せるのに何も起きない」ことになる。
  it('サブスク由来の支払い行は編集/削除ボタンを出さない', async () => {
    state.rows = [
      row({ id: 'seed-1', memo: '通常', is_system_generated: false }),
      row({ id: 'sub-1', memo: 'Netflix', subscription_id: 'sub-uuid' }),
    ];
    renderLedger();
    expect(await screen.findByText('Netflix')).toBeInTheDocument();
    expect(screen.getByText('通常')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '編集' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '削除' })).toHaveLength(1);
  });

  it('過去/未来月で追加する際、日付が選択中の月の初日に既定される', async () => {
    renderLedger();
    await screen.findByRole('button', { name: '収支を追加' });
    fireEvent.click(screen.getByRole('button', { name: '次の月' }));
    fireEvent.click(screen.getByRole('button', { name: '収支を追加' }));
    const dialog = await screen.findByRole('dialog');
    const nextMonthFirst = addMonths(jstMonthStart(), 1);
    expect(within(dialog).getByDisplayValue(nextMonthFirst)).toBeInTheDocument();
  });

  it('編集: アーカイブ済カテゴリでも選択肢に残り現在値が表示される', async () => {
    state.rows = [row({ id: 'seed-1', memo: '旧支出', category_id: ARCHIVED_CATEGORY_ID })];
    renderLedger();
    fireEvent.click(await screen.findByRole('button', { name: '編集' }));
    const dialog = await screen.findByRole('dialog');
    const combobox = within(dialog).getByRole('combobox');
    // 現在のアーカイブ済カテゴリが選択値として保持され、選択肢にも出る
    expect(combobox).toHaveValue(ARCHIVED_CATEGORY_ID);
    expect(
      within(dialog).getByRole('option', { name: /旧カテゴリ（アーカイブ済）/ }),
    ).toBeInTheDocument();
  });

  it('?member=shiyowo で開くと相手ビューで初期化される', async () => {
    state.rows = [row({ id: 'y1', owner_member_id: 'yururi', memo: 'ゆるり分' })];
    renderLedger(authedSession, '/ledger?member=shiyowo');
    // 相手(しよを)ビューなので FAB は出ず、自分の記録も出ない
    expect(await screen.findByRole('tab', { name: 'しよを' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await waitFor(() => expect(screen.queryByRole('button', { name: '収支を追加' })).toBeNull());
    expect(listTransactions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ memberId: 'shiyowo' }),
    );
  });

  // 追加はホームでも家計簿でもモーダルで完結するようになり、`?add=` は廃止した。
  // 読み取り側を消し忘れると、ホームの導線を消しても古いリンクや履歴から開かれる。
  it('?add=expense で開いても作成モーダルは自動で開かない（add は廃止）', async () => {
    renderLedger(authedSession, '/ledger?member=yururi&add=expense');
    // FAB は出る（自分ビュー）が、モーダルは勝手に開かない
    expect(await screen.findByRole('button', { name: '収支を追加' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('member 空文字パラメータは自分にフォールバックする', async () => {
    renderLedger(authedSession, '/ledger?member=');
    // 自分ビューなので FAB（書込導線）が出る
    expect(await screen.findByRole('button', { name: '収支を追加' })).toBeInTheDocument();
  });

  it('追加が失敗するとフォームにエラーを表示（モーダルは開いたまま）', async () => {
    mockCreate.mockImplementationOnce(async () => {
      throw new Error('rls denied');
    });
    renderLedger();
    fireEvent.click(await screen.findByRole('button', { name: '収支を追加' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('0'), { target: { value: '3,000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加' }));
    expect(await within(dialog).findByText(/保存に失敗しました/)).toBeInTheDocument();
    // モーダルは開いたまま（ユーザーが再試行できる）
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('削除失敗時はエラーバナーを表示する', async () => {
    state.rows = [row({ id: 'seed-1', memo: '消せない' })];
    mockDelete.mockImplementationOnce(async () => {
      throw new Error('network');
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderLedger();
    expect(await screen.findByText('消せない')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(await screen.findByText(/削除に失敗しました/)).toBeInTheDocument();
  });

  // 作成モーダルを開いたまま相手タブへ切り替えると canWrite=false で見た目上は閉じるが、
  // state を落とさないと 'create' のまま残り、自分タブに戻った瞬間に勝手に開き直す。
  it('作成モーダルを開いたままメンバーを切り替えるとモーダルが閉じる', async () => {
    renderLedger();
    fireEvent.click(await screen.findByRole('button', { name: '収支を追加' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'しよを' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // 自分タブへ戻しても勝手に開き直さない
    fireEvent.click(screen.getByRole('tab', { name: 'ゆるり' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '収支を追加' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('金額未入力ではエラーを出し送信しない', async () => {
    renderLedger();
    fireEvent.click(await screen.findByRole('button', { name: '収支を追加' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '追加' }));
    expect(await within(dialog).findByText('金額を入力してください')).toBeInTheDocument();
    expect(createTransaction).not.toHaveBeenCalled();
  });
});
