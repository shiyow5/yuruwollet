import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { BalanceWall } from './BalanceWall';
import type { Checkpoint } from '../../lib/wall/types';
import { ConfirmCheckpointError } from '../../lib/wall/errors';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const state = vi.hoisted(() => ({
  checkpoint: null as Checkpoint | null,
  balance: 45000,
  balanceFails: false,
  balanceHold: null as Promise<void> | null,
  confirmHold: null as Promise<void> | null,
}));

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
  confirmCheckpoint: vi.fn(async (_c: unknown, input: { actual: number }) => {
    if (state.confirmHold) await state.confirmHold;
    state.checkpoint = {
      id: 'cp1',
      household_id: 'main',
      member_id: 'yururi',
      checkpoint_month: '2026-07-01',
      actual: input.actual,
      computed: 45000,
      diff: input.actual - 45000,
      status: 'confirmed',
      created_at: '2026-07-24T03:00:00Z',
      updated_at: '2026-07-24T03:00:00Z',
    };
    return state.checkpoint;
  }),
}));

vi.mock('../../lib/data/aggregates', () => ({
  getMemberBalances: vi.fn(async () => {
    if (state.balanceHold) await state.balanceHold;
    if (state.balanceFails) throw new Error('balance fetch failed');
    return [
      { household_id: 'main', member_id: 'yururi', display_name: 'ゆるり', balance: state.balance },
    ];
  }),
  listProfiles: vi.fn(async () => []),
  getMonthlySummary: vi.fn(async () => null),
  getCategoryBreakdown: vi.fn(async () => []),
}));

import {
  skipCheckpoint,
  confirmCheckpoint,
  getCurrentCheckpoint,
} from '../../lib/data/checkpoints';

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
const NEXT_MONTH_24 = new Date('2026-08-24T12:00:00+09:00');

function renderWall(now: Date = ON_24) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (n: Date) => (
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={authedSession}>
        <BalanceWall now={n} />
      </SessionContext.Provider>
    </QueryClientProvider>
  );
  const utils = render(ui(now));
  return { ...utils, rerenderWith: (n: Date) => utils.rerender(ui(n)) };
}

describe('BalanceWall 統合', () => {
  beforeEach(() => {
    state.checkpoint = null;
    state.balance = 45000;
    state.balanceFails = false;
    state.balanceHold = null;
    state.confirmHold = null;
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
    expect(confirmCheckpoint).toHaveBeenCalledWith(expect.anything(), {
      actual: 50000,
      expectedComputed: 45000,
    });
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

  it('checkpoint の取得に失敗したらロックしない（確認済みの人を締め出さない）', async () => {
    (
      getCurrentCheckpoint as unknown as {
        mockImplementationOnce: (f: () => Promise<never>) => void;
      }
    ).mockImplementationOnce(async () => {
      throw new Error('network');
    });
    renderWall();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('キャッシュが古くても最新残高で差額判定する（確認なしの調整を防ぐ）', async () => {
    renderWall();
    await screen.findByText('明日は給料日！'); // 初回は 45000 をキャッシュ
    // 別端末で取引が入り、実際の計算残高は 50000 になった
    state.balance = 50000;

    // 古いキャッシュ(45000)と同額を入力 → 素朴実装なら「差額0」で即確定してしまう
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '45000' } });
    fireEvent.click(screen.getByRole('button', { name: '決定' }));

    // 最新(50000)で再判定され、差額 -5000 の確認ダイアログが出る
    expect(await screen.findByText(/【¥5,000】ズレています/)).toBeInTheDocument();
    expect(screen.getByText(/支出として調整します/)).toBeInTheDocument();
    expect(confirmCheckpoint).not.toHaveBeenCalled();
  });

  it('壁が閉じて翌月に再表示されたとき、前回の確認画面が残らない', async () => {
    const { rerenderWith } = renderWall(ON_24);
    fireEvent.change(await screen.findByPlaceholderText('0'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: '決定' }));
    await screen.findByText(/ズレています/); // 確認ステップ

    // 翌月へ（checkpoint は未作成のまま）→ 壁は一度閉じて開き直る
    rerenderWith(NEXT_MONTH_24);

    // 入力ステップから再開（古い確認画面・古い金額が残っていない）
    expect(await screen.findByText('明日は給料日！')).toBeInTheDocument();
    expect(screen.queryByText(/ズレています/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'はい' })).toBeNull();
  });

  it('残高の再取得に失敗したら（古いキャッシュが残っていても）確定せずエラー', async () => {
    renderWall();
    await screen.findByText('明日は給料日！'); // 45000 をキャッシュ
    state.balanceFails = true; // 以降の refetch は失敗（data には古い 45000 が残る）

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '45000' } });
    fireEvent.click(screen.getByRole('button', { name: '決定' }));

    // 決定時のフィールドエラー（残高取得失敗のバナーとは別に出る）
    expect(await screen.findByText(/時間をおいて再度お試しください/)).toBeInTheDocument();
    expect(confirmCheckpoint).not.toHaveBeenCalled();
  });

  it('決定の残高確認中は「後で数える」を押せない（確定と競合させない）', async () => {
    renderWall();
    await screen.findByText('明日は給料日！');
    let release!: () => void;
    state.balanceHold = new Promise<void>((resolve) => {
      release = resolve;
    });

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: '決定' }));

    await waitFor(() => expect(screen.getByRole('button', { name: '後で数える' })).toBeDisabled());
    release();
    await screen.findByText(/ズレています/);
    expect(skipCheckpoint).not.toHaveBeenCalled();
  });

  it('確定中は「いいえ」で取り消せない（RPC は止まらない）', async () => {
    renderWall();
    fireEvent.change(await screen.findByPlaceholderText('0'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: '決定' }));
    await screen.findByText(/ズレています/);

    let release!: () => void;
    state.confirmHold = new Promise<void>((resolve) => {
      release = resolve;
    });
    fireEvent.click(screen.getByRole('button', { name: 'はい' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'いいえ' })).toBeDisabled());
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
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

  // サーバは「ユーザーが承認した計算残高」と現在値が一致するときだけ確定する（CAS）。
  // 一致しなければ確定せず拒否するので、承認していないズレが黙って調整されることはない。
  it('ユーザーが画面で見た計算残高を確定 RPC に渡す', async () => {
    renderWall();
    fireEvent.change(await screen.findByPlaceholderText('0'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: '決定' }));
    fireEvent.click(await screen.findByRole('button', { name: 'はい' }));

    await waitFor(() =>
      expect(confirmCheckpoint).toHaveBeenCalledWith(expect.anything(), {
        actual: 50000,
        expectedComputed: 45000,
      }),
    );
  });

  it('確定直前に残高が動いていたら（stale）入力に戻して数え直させる', async () => {
    (
      confirmCheckpoint as unknown as { mockImplementationOnce: (f: () => Promise<never>) => void }
    ).mockImplementationOnce(async () => {
      throw new ConfirmCheckpointError('stale', '残高が変わりました。もう一度確認してください。');
    });
    renderWall();
    fireEvent.change(await screen.findByPlaceholderText('0'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: '決定' }));
    fireEvent.click(await screen.findByRole('button', { name: 'はい' }));

    expect(await screen.findByText(/残高が変わりました/)).toBeInTheDocument();
    // 確認画面ではなく入力画面に戻っている（= 最新残高で数え直せる）
    expect(screen.getByRole('button', { name: '決定' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'はい' })).toBeNull();
    // 壁は開いたまま（勝手に確定していない）
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
