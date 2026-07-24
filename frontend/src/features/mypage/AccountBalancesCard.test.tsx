import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { AccountBalancesCard } from './AccountBalancesCard';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const state = vi.hoisted(() => ({
  balancesFail: false,
  upsertArgs: null as unknown,
}));

vi.mock('../../lib/data/accounts', () => ({
  listAccounts: vi.fn(async () => [
    {
      id: 'cash',
      household_id: 'main',
      name: '現金',
      icon: 'payments',
      sort_order: 10,
      is_archived: false,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'bank',
      household_id: 'main',
      name: '銀行口座',
      icon: 'account_balance',
      sort_order: 20,
      is_archived: false,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'old',
      household_id: 'main',
      name: '旧口座',
      icon: 'payments',
      sort_order: 30,
      is_archived: true,
      created_at: '',
      updated_at: '',
    },
  ]),
}));

vi.mock('../../lib/data/openings', () => ({
  getAccountBalances: vi.fn(async () => {
    if (state.balancesFail) throw new Error('boom');
    return [
      {
        household_id: 'main',
        member_id: 'yururi',
        account_id: 'cash',
        account_name: '現金',
        account_icon: 'payments',
        is_archived: false,
        balance: 35000,
      },
      {
        household_id: 'main',
        member_id: 'yururi',
        account_id: 'bank',
        account_name: '銀行口座',
        account_icon: 'account_balance',
        is_archived: false,
        balance: 120000,
      },
      {
        household_id: 'main',
        member_id: 'shiyowo',
        account_id: 'cash',
        account_name: '現金',
        account_icon: 'payments',
        is_archived: false,
        balance: 5000,
      },
    ];
  }),
  listAccountOpenings: vi.fn(async () => [
    {
      household_id: 'main',
      member_id: 'yururi',
      account_id: 'cash',
      opening_balance: 30000,
      created_at: '',
      updated_at: '',
    },
  ]),
  upsertAccountOpening: vi.fn(async (_c: unknown, input: unknown) => {
    state.upsertArgs = input;
  }),
}));

function session(): SessionState {
  return {
    status: 'authenticated',
    session: {
      supabaseJwt: 'jwt',
      expiresAt: 9999999999,
      member: { id: 'yururi', displayName: 'ゆるり' },
      householdId: 'main',
    },
  };
}

function renderCard(props: { memberId: string; canWrite: boolean }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={session()}>
        <AccountBalancesCard {...props} />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe('AccountBalancesCard（口座別残高, #102）', () => {
  beforeEach(() => {
    state.balancesFail = false;
    state.upsertArgs = null;
    vi.clearAllMocks();
  });

  it('非archived の口座ごとに残高を表示する（archived は出さない）', async () => {
    renderCard({ memberId: 'yururi', canWrite: true });
    expect(await screen.findByText('現金')).toBeInTheDocument();
    expect(screen.getByText('銀行口座')).toBeInTheDocument();
    expect(screen.queryByText('旧口座')).not.toBeInTheDocument();
    expect(await screen.findByText('¥35,000')).toBeInTheDocument();
    expect(screen.getByText('¥120,000')).toBeInTheDocument();
  });

  it('相手タブ（canWrite=false）では編集ボタンを出さない', async () => {
    renderCard({ memberId: 'shiyowo', canWrite: false });
    // shiyowo の現金残高（相手分も見える）
    expect(await screen.findByText('¥5,000')).toBeInTheDocument();
    expect(screen.queryByLabelText('現金の初期残高を変える')).not.toBeInTheDocument();
  });

  it('初期残高を編集して保存すると upsert が呼ばれる', async () => {
    renderCard({ memberId: 'yururi', canWrite: true });
    fireEvent.click(await screen.findByLabelText('現金の初期残高を変える'));
    fireEvent.change(screen.getByLabelText('現金の初期残高'), { target: { value: '45000' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(state.upsertArgs).toEqual({
        householdId: 'main',
        memberId: 'yururi',
        accountId: 'cash',
        openingBalance: 45000,
      }),
    );
  });

  it('不正な初期残高は保存しない', async () => {
    renderCard({ memberId: 'yururi', canWrite: true });
    fireEvent.click(await screen.findByLabelText('現金の初期残高を変える'));
    fireEvent.change(screen.getByLabelText('現金の初期残高'), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText(/初期残高は0円以上/)).toBeInTheDocument();
    expect(state.upsertArgs).toBeNull();
  });

  it('残高の取得に失敗したら — を出す', async () => {
    state.balancesFail = true;
    renderCard({ memberId: 'yururi', canWrite: true });
    // 口座名は accounts 側から出るが、残高は — になる
    expect(await screen.findByText('現金')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThan(0));
  });
});
