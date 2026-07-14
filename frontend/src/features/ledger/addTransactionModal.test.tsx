import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { AddTransactionModal } from './AddTransactionModal';

const state = vi.hoisted(() => ({ fail: false }));

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

vi.mock('../../lib/data/categories', () => ({
  listCategories: vi.fn(async () => [
    {
      id: 'cafe',
      household_id: 'main',
      kind: 'expense',
      name: '交際費',
      icon: 'local_cafe',
      sort_order: 0,
      is_system: false,
      is_archived: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ]),
  createCategory: vi.fn(),
  archiveCategory: vi.fn(),
  unarchiveCategory: vi.fn(),
}));

vi.mock('../../lib/data/transactions', () => ({
  listTransactions: vi.fn(async () => []),
  createTransaction: vi.fn(async () => {
    if (state.fail) throw new Error('rls denied');
    return { id: 'srv-1' };
  }),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}));

const authed: SessionState = {
  status: 'authenticated',
  session: {
    supabaseJwt: 'jwt',
    expiresAt: 9999999999,
    member: { id: 'yururi', displayName: 'ゆるり' },
    householdId: 'main',
  },
};

/** 開閉を親が持つ最小構成（HomePage / LedgerPage と同じ形）。開き直しを再現するために要る。 */
function Controlled() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        開く
      </button>
      <AddTransactionModal open={open} onClose={() => setOpen(false)} defaultDate="2026-07-14" />
    </>
  );
}

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={authed}>
        <Controlled />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

async function openAndFail() {
  fireEvent.click(screen.getByRole('button', { name: '開く' }));
  const dialog = await screen.findByRole('dialog', { name: '収支を追加' });
  fireEvent.change(within(dialog).getByPlaceholderText('0'), { target: { value: '3,000' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '追加' }));
  expect(await within(dialog).findByText(/保存に失敗しました/)).toBeInTheDocument();
  return dialog;
}

describe('AddTransactionModal', () => {
  beforeEach(() => {
    state.fail = false;
  });

  it('失敗したらモーダルは開いたままエラーを出す', async () => {
    state.fail = true;
    renderModal();
    await openAndFail();
    // 再試行できるよう開いたまま
    expect(screen.getByRole('dialog', { name: '収支を追加' })).toBeInTheDocument();
  });

  // mutation の状態はモーダルではなくフックの寿命で生きる。閉じるときに reset() しないと、
  // 失敗 → 閉じる → 開き直す で前回のエラーバナーが出たままになる。
  it('閉じて開き直すと前回のエラーが残らない', async () => {
    state.fail = true;
    renderModal();
    const dialog = await openAndFail();

    fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: '開く' }));
    const reopened = await screen.findByRole('dialog', { name: '収支を追加' });
    expect(within(reopened).queryByText(/保存に失敗しました/)).toBeNull();
  });

  it('成功するとモーダルが閉じる', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: '開く' }));
    const dialog = await screen.findByRole('dialog', { name: '収支を追加' });
    fireEvent.change(within(dialog).getByPlaceholderText('0'), { target: { value: '3,000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
