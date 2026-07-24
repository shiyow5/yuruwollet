import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../lib/queryClient';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { ConfirmCheckpointError } from '../../lib/wall/errors';
import { RecountCard } from './RecountCard';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const state = vi.hoisted(() => ({ balance: 45000 }));

vi.mock('../../lib/data/aggregates', () => ({
  getMemberBalances: vi.fn(async () => [
    { household_id: 'main', member_id: 'yururi', balance: state.balance },
    { household_id: 'main', member_id: 'shiyowo', balance: 20000 },
  ]),
}));

vi.mock('../../lib/data/checkpoints', () => ({
  adjustBalanceNow: vi.fn(
    async (_c: unknown, input: { actual: number; expectedComputed: number }) => {
      return input.actual - input.expectedComputed;
    },
  ),
}));

import { adjustBalanceNow } from '../../lib/data/checkpoints';

const authedSession: SessionState = {
  status: 'authenticated',
  session: {
    supabaseJwt: 'jwt',
    expiresAt: 9999999999,
    member: { id: 'yururi', displayName: 'ゆるり' },
    householdId: 'main',
  },
};

function renderCard() {
  const qc = createQueryClient();
  qc.setDefaultOptions({ queries: { retry: false } });
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={authedSession}>
        <RecountCard selfId="yururi" />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe('RecountCard（任意タイミングの残高数え直し, #99）', () => {
  beforeEach(() => {
    state.balance = 45000;
    vi.clearAllMocks();
  });

  it('自分のアプリ計算残高を表示する', async () => {
    renderCard();
    expect(await screen.findByText('¥45,000')).toBeInTheDocument();
  });

  it('ズレがあると確認ステップを挟み、はいで adjust_balance_now を承認値で呼ぶ', async () => {
    renderCard();
    await screen.findByText('¥45,000');
    fireEvent.click(screen.getByRole('button', { name: '残高を数え直す' }));

    const dialog = await screen.findByRole('dialog', { name: '残高の数え直し' });
    fireEvent.change(within(dialog).getByLabelText('実際の残高'), { target: { value: '50000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '決定' }));

    // 確認ステップ: 5,000 のズレと、アプリの計算/実際の残高
    expect(await within(dialog).findByText(/5,000.*ズレています/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'はい' }));

    await waitFor(() => expect(adjustBalanceNow).toHaveBeenCalledTimes(1));
    // ユーザーが画面で見た computed(45000) をそのまま CAS 用に渡す
    expect(adjustBalanceNow).toHaveBeenCalledWith(expect.anything(), {
      actual: 50000,
      expectedComputed: 45000,
    });
    expect(await within(dialog).findByText('残高を合わせました')).toBeInTheDocument();
  });

  it('ズレが無ければ確認も RPC も無しで完了する', async () => {
    renderCard();
    await screen.findByText('¥45,000');
    fireEvent.click(screen.getByRole('button', { name: '残高を数え直す' }));

    const dialog = await screen.findByRole('dialog', { name: '残高の数え直し' });
    fireEvent.change(within(dialog).getByLabelText('実際の残高'), { target: { value: '45000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '決定' }));

    expect(await within(dialog).findByText('ズレはありませんでした')).toBeInTheDocument();
    expect(adjustBalanceNow).not.toHaveBeenCalled();
  });

  it('0円未満は検証エラーで RPC を呼ばない', async () => {
    renderCard();
    await screen.findByText('¥45,000');
    fireEvent.click(screen.getByRole('button', { name: '残高を数え直す' }));

    const dialog = await screen.findByRole('dialog', { name: '残高の数え直し' });
    fireEvent.change(within(dialog).getByLabelText('実際の残高'), { target: { value: '-1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '決定' }));

    expect(await within(dialog).findByText(/0円以上/)).toBeInTheDocument();
    expect(adjustBalanceNow).not.toHaveBeenCalled();
  });

  it('承認後に残高が動いていたら（stale）入力に戻す', async () => {
    (
      adjustBalanceNow as unknown as { mockRejectedValueOnce: (e: unknown) => void }
    ).mockRejectedValueOnce(new ConfirmCheckpointError('stale', '残高が変わりました'));
    renderCard();
    await screen.findByText('¥45,000');
    fireEvent.click(screen.getByRole('button', { name: '残高を数え直す' }));

    const dialog = await screen.findByRole('dialog', { name: '残高の数え直し' });
    fireEvent.change(within(dialog).getByLabelText('実際の残高'), { target: { value: '50000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '決定' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'はい' }));

    // stale → 入力ステップに戻る（実際の残高フィールドが再び見える）
    await waitFor(() => expect(within(dialog).getByLabelText('実際の残高')).toBeInTheDocument());
    expect(within(dialog).getByText(/残高が変わりました/)).toBeInTheDocument();
  });
});
