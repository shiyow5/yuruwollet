import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../lib/queryClient';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { AccountManager } from './AccountManager';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

// 削除ダイアログが見せる使用数（テストごとに切り替える）
const state = vi.hoisted(() => ({ usage: 0 }));

function accRow(over: Record<string, unknown>) {
  return {
    id: 'a',
    household_id: 'main',
    name: 'X',
    icon: 'account_balance_wallet',
    sort_order: 0,
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

vi.mock('../../lib/data/accounts', () => ({
  listAccounts: vi.fn(async () => [
    accRow({ id: 'a-cash', name: '現金', icon: 'payments', sort_order: 10 }),
    accRow({ id: 'a-card', name: '楽天カード', icon: 'credit_card', sort_order: 20 }),
    // アーカイブ済
    accRow({ id: 'a-old', name: '旧口座', is_archived: true, sort_order: 30 }),
  ]),
  createAccount: vi.fn(async () => ({ id: 'new', name: 'PayPay' })),
  archiveAccount: vi.fn(async () => {}),
  unarchiveAccount: vi.fn(async () => {}),
  deleteAccount: vi.fn(async () => {}),
  getAccountUsage: vi.fn(async () => state.usage),
}));

import {
  createAccount,
  archiveAccount,
  unarchiveAccount,
  deleteAccount,
  getAccountUsage,
} from '../../lib/data/accounts';

const authedSession: SessionState = {
  status: 'authenticated',
  session: {
    supabaseJwt: 'jwt',
    expiresAt: 9999999999,
    member: { id: 'yururi', displayName: 'ゆるり' },
    householdId: 'main',
  },
};

function renderManager() {
  const qc = createQueryClient();
  qc.setDefaultOptions({ queries: { retry: false } });
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={authedSession}>
        <AccountManager />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe('AccountManager 統合（#98）', () => {
  beforeEach(() => {
    state.usage = 0;
    vi.clearAllMocks();
  });

  it('既存アカウントを表示する', async () => {
    renderManager();
    expect(await screen.findByText('現金')).toBeInTheDocument();
    expect(screen.getByText('楽天カード')).toBeInTheDocument();
  });

  it('アカウントを追加すると createAccount が呼ばれ入力がクリアされる', async () => {
    renderManager();
    const nameInput = await screen.findByPlaceholderText('現金 / ○○銀行 / △△カード など');
    fireEvent.change(nameInput, { target: { value: 'PayPay' } });
    fireEvent.click(screen.getByRole('button', { name: 'アカウントを追加' }));

    await waitFor(() => expect(createAccount).toHaveBeenCalledTimes(1));
    const [, draft, ctx] = (createAccount as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0];
    // icon 既定は account_balance_wallet（アカウントパレット先頭）
    expect(draft).toEqual({ name: 'PayPay', icon: 'account_balance_wallet' });
    expect(ctx).toEqual({ householdId: 'main' });
    await waitFor(() => expect(nameInput).toHaveValue(''));
  });

  it('空名では検証エラーを出し追加しない', async () => {
    renderManager();
    await screen.findByText('現金');
    fireEvent.click(screen.getByRole('button', { name: 'アカウントを追加' }));
    expect(await screen.findByText('アカウント名を入力してください')).toBeInTheDocument();
    expect(createAccount).not.toHaveBeenCalled();
  });

  // カテゴリと違い、全アカウント（テンプレ含む）に削除ボタンが出る（default 保護なし）。
  it('全アカウントに削除ボタンが出る', async () => {
    renderManager();
    expect(await screen.findByRole('button', { name: '現金 を削除' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '楽天カード を削除' })).toBeInTheDocument();
  });

  it('アーカイブ済アカウントが復元セクションに出て、復元で unarchiveAccount が呼ばれる', async () => {
    renderManager();
    expect(await screen.findByText('アーカイブ済')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '旧口座 を復元' }));
    await waitFor(() => expect(unarchiveAccount).toHaveBeenCalledTimes(1));
    expect((unarchiveAccount as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1]).toBe(
      'a-old',
    );
  });

  it('未使用のアカウントは、確認して削除できる', async () => {
    state.usage = 0;
    renderManager();
    fireEvent.click(await screen.findByRole('button', { name: '楽天カード を削除' }));

    const dialog = await screen.findByRole('dialog', { name: 'アカウントを削除' });
    expect(await within(dialog).findByText(/まだどの記録にも使われていません/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '削除する' }));

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledTimes(1));
    expect((deleteAccount as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1]).toBe(
      'a-card',
    );
  });

  // 取り消せない操作なので、使用状況が取れないときは「削除可」に倒さない（安全側）。
  it('使用状況を取得できないときは削除ボタンを出さず、エラーを表示する', async () => {
    (
      getAccountUsage as unknown as { mockRejectedValueOnce: (e: Error) => void }
    ).mockRejectedValueOnce(new Error('network'));
    renderManager();
    fireEvent.click(await screen.findByRole('button', { name: '楽天カード を削除' }));

    const dialog = await screen.findByRole('dialog', { name: 'アカウントを削除' });
    expect(await within(dialog).findByText(/使用状況を確認できませんでした/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '削除する' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'アーカイブする' })).toBeNull();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  // 使われているアカウントは FK restrict で消せない。消す前に伝え、アーカイブへ誘導する。
  it('使用中のアカウントは削除できず、アーカイブに誘導される', async () => {
    state.usage = 5;
    renderManager();
    fireEvent.click(await screen.findByRole('button', { name: '楽天カード を削除' }));

    const dialog = await screen.findByRole('dialog', { name: 'アカウントを削除' });
    expect(await within(dialog).findByText(/5 件/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '削除する' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'アーカイブする' }));

    await waitFor(() => expect(archiveAccount).toHaveBeenCalledTimes(1));
    expect(deleteAccount).not.toHaveBeenCalled();
    expect((archiveAccount as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1]).toBe(
      'a-card',
    );
  });
});
