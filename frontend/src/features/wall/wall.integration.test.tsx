import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { BalanceWall } from './BalanceWall';
import type { Checkpoint } from '../../lib/wall/types';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const state = vi.hoisted(() => ({ checkpoint: null as Checkpoint | null }));

function cp(over: Partial<Checkpoint>): Checkpoint {
  return {
    id: 'cp1',
    household_id: 'main',
    member_id: 'yururi',
    checkpoint_month: '2026-07-01',
    actual: null,
    computed: null,
    diff: null,
    status: 'skipped',
    created_at: '2026-07-24T03:00:00Z',
    updated_at: '2026-07-24T03:00:00Z',
    ...over,
  };
}

vi.mock('../../lib/data/checkpoints', () => ({
  getCurrentCheckpoint: vi.fn(async () => state.checkpoint),
  skipCheckpoint: vi.fn(async () => {
    // JST 2026-07-24 12:00 にスキップ（= 当日）
    state.checkpoint = {
      id: 'cp1',
      household_id: 'main',
      member_id: 'yururi',
      checkpoint_month: '2026-07-01',
      actual: null,
      computed: null,
      diff: null,
      status: 'skipped',
      created_at: '2026-07-24T03:00:00Z',
      updated_at: '2026-07-24T03:00:00Z',
    };
  }),
  confirmCheckpoint: vi.fn(async (_c: unknown, actual: number) => {
    state.checkpoint = {
      id: 'cp1',
      household_id: 'main',
      member_id: 'yururi',
      checkpoint_month: '2026-07-01',
      actual,
      computed: 45000,
      diff: actual - 45000,
      status: 'confirmed',
      created_at: '2026-07-24T03:00:00Z',
      updated_at: '2026-07-24T03:00:00Z',
    };
    return state.checkpoint;
  }),
}));

vi.mock('../../lib/data/aggregates', () => ({
  getMemberBalances: vi.fn(async () => [
    { household_id: 'main', member_id: 'yururi', display_name: 'ゆるり', balance: 45000 },
  ]),
  listProfiles: vi.fn(async () => []),
  getMonthlySummary: vi.fn(async () => null),
  getCategoryBreakdown: vi.fn(async () => []),
}));

import { skipCheckpoint, confirmCheckpoint } from '../../lib/data/checkpoints';

const authedSession: SessionState = {
  status: 'authenticated',
  session: {
    supabaseJwt: 'jwt',
    expiresAt: 9999999999,
    member: { id: 'yururi', displayName: 'ゆるり' },
    householdId: 'main',
  },
};

const ON_24 = new Date('2026-07-24T12:00:00+09:00');
const ON_23 = new Date('2026-07-23T12:00:00+09:00');

function renderWall(now: Date = ON_24) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={authedSession}>
        <BalanceWall now={now} />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe('BalanceWall 統合', () => {
  beforeEach(() => {
    state.checkpoint = null;
    vi.clearAllMocks();
  });

  it('24日未満は壁を出さない', async () => {
    renderWall(ON_23);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('24日で未確認なら全画面ロックの壁を出す', async () => {
    renderWall();
    expect(await screen.findByText('明日は給料日！')).toBeInTheDocument();
    expect(screen.getByText('今月のお財布の残高を数えて入力してね！')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '今月の残高確認' })).toBeInTheDocument();
  });

  it('confirmed 済みなら壁を出さない', async () => {
    state.checkpoint = cp({ status: 'confirmed' });
    renderWall();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('差額ありで決定 → 確認ダイアログ → はい で RPC 確定し壁が閉じる', async () => {
    renderWall();
    fireEvent.change(await screen.findByPlaceholderText('0'), { target: { value: '50,000' } });
    fireEvent.click(screen.getByRole('button', { name: '決定' }));

    // 差額 50000 - 45000 = 5000
    expect(
      await screen.findByText(
        'アプリの計算と【¥5,000】ズレています。このまま実際の残高に合わせますか？',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/収入として調整します/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'はい' }));
    await waitFor(() => expect(confirmCheckpoint).toHaveBeenCalledTimes(1));
    expect(
      (confirmCheckpoint as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1],
    ).toBe(50000);
    // confirmed になり壁が閉じる
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('実際の方が少ない場合は支出として調整すると案内する', async () => {
    renderWall();
    fireEvent.change(await screen.findByPlaceholderText('0'), { target: { value: '40000' } });
    fireEvent.click(screen.getByRole('button', { name: '決定' }));
    expect(await screen.findByText(/【¥5,000】ズレています/)).toBeInTheDocument();
    expect(screen.getByText(/支出として調整します/)).toBeInTheDocument();
  });

  it('差額 0 なら確認ダイアログ無しでそのまま確定', async () => {
    renderWall();
    fireEvent.change(await screen.findByPlaceholderText('0'), { target: { value: '45000' } });
    fireEvent.click(screen.getByRole('button', { name: '決定' }));
    await waitFor(() => expect(confirmCheckpoint).toHaveBeenCalledTimes(1));
    // 確認ダイアログは出ない
    expect(screen.queryByText(/ズレています/)).toBeNull();
  });

  it('確認ダイアログで「いいえ」なら入力に戻る（確定しない）', async () => {
    renderWall();
    fireEvent.change(await screen.findByPlaceholderText('0'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: '決定' }));
    await screen.findByText(/ズレています/);
    fireEvent.click(screen.getByRole('button', { name: 'いいえ' }));
    expect(await screen.findByText('明日は給料日！')).toBeInTheDocument();
    expect(confirmCheckpoint).not.toHaveBeenCalled();
  });

  it('「後で数える」でスキップを保存し当日は閉じる', async () => {
    renderWall();
    fireEvent.click(await screen.findByRole('button', { name: '後で数える' }));
    await waitFor(() => expect(skipCheckpoint).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('未入力で決定すると検証エラー', async () => {
    renderWall();
    fireEvent.click(await screen.findByRole('button', { name: '決定' }));
    expect(await screen.findByText('残高を入力してください')).toBeInTheDocument();
    expect(confirmCheckpoint).not.toHaveBeenCalled();
  });

  it('確定に失敗したらエラーを表示する', async () => {
    (
      confirmCheckpoint as unknown as { mockImplementationOnce: (f: () => Promise<never>) => void }
    ).mockImplementationOnce(async () => {
      throw new Error('rpc failed');
    });
    renderWall();
    fireEvent.change(await screen.findByPlaceholderText('0'), { target: { value: '45000' } });
    fireEvent.click(screen.getByRole('button', { name: '決定' }));
    expect(await screen.findByText(/残高の確定に失敗しました/)).toBeInTheDocument();
  });
});
