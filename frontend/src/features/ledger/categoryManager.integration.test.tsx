import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../lib/queryClient';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { CategoryManager } from './CategoryManager';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

// 削除ダイアログが見せる使用数（テストごとに切り替える）
const state = vi.hoisted(() => ({ usage: 0 }));

function catRow(over: Record<string, unknown>) {
  return {
    id: 'c',
    household_id: 'main',
    kind: 'expense',
    name: 'X',
    icon: 'label',
    sort_order: 0,
    is_system: false,
    is_default: false,
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

vi.mock('../../lib/data/categories', () => ({
  listCategories: vi.fn(async () => [
    // デフォルト（seed）: アーカイブのみ・削除不可
    catRow({ id: 'c-exp', kind: 'expense', name: '食費', icon: 'restaurant', is_default: true }),
    catRow({ id: 'c-inc', kind: 'income', name: '給与', icon: 'payments', is_default: true }),
    // ユーザー追加: 削除できる
    catRow({ id: 'c-kar', kind: 'expense', name: 'カラオケ', icon: 'mic', is_default: false }),
    // アーカイブ済（ユーザー追加）
    catRow({
      id: 'c-old',
      kind: 'expense',
      name: '旧カテゴリ',
      is_default: false,
      is_archived: true,
    }),
  ]),
  createCategory: vi.fn(async () => ({ id: 'new', name: '交際費' })),
  archiveCategory: vi.fn(async () => {}),
  unarchiveCategory: vi.fn(async () => {}),
  deleteCategory: vi.fn(async () => {}),
  getCategoryUsage: vi.fn(async () => state.usage),
}));

import {
  createCategory,
  archiveCategory,
  unarchiveCategory,
  deleteCategory,
} from '../../lib/data/categories';

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
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={authedSession}>
        <CategoryManager />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe('CategoryManager 統合', () => {
  beforeEach(() => {
    state.usage = 0;
    vi.clearAllMocks();
  });

  it('既存カテゴリを種別ごとに表示する', async () => {
    renderManager();
    expect(await screen.findByText('食費')).toBeInTheDocument();
    expect(screen.getByText('給与')).toBeInTheDocument();
  });

  it('カテゴリを追加すると createCategory が呼ばれ入力がクリアされる', async () => {
    renderManager();
    const nameInput = await screen.findByPlaceholderText('食費 / 給与 など');
    fireEvent.change(nameInput, { target: { value: '交際費' } });
    fireEvent.click(screen.getByRole('button', { name: 'カテゴリを追加' }));

    await waitFor(() => expect(createCategory).toHaveBeenCalledTimes(1));
    const [, draft, ctx] = (createCategory as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0];
    expect(draft).toEqual({ kind: 'expense', name: '交際費', icon: 'label' });
    expect(ctx).toEqual({ householdId: 'main' });
    await waitFor(() => expect(nameInput).toHaveValue(''));
  });

  it('空名では検証エラーを出し追加しない', async () => {
    renderManager();
    await screen.findByText('食費');
    fireEvent.click(screen.getByRole('button', { name: 'カテゴリを追加' }));
    expect(await screen.findByText('カテゴリ名を入力してください')).toBeInTheDocument();
    expect(createCategory).not.toHaveBeenCalled();
  });

  it('アーカイブボタンで archiveCategory が該当 id で呼ばれる', async () => {
    renderManager();
    fireEvent.click(await screen.findByRole('button', { name: '食費 をアーカイブ' }));
    await waitFor(() => expect(archiveCategory).toHaveBeenCalledTimes(1));
    expect((archiveCategory as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1]).toBe(
      'c-exp',
    );
  });

  it('アーカイブ失敗時はエラーを表示する', async () => {
    (
      archiveCategory as unknown as { mockRejectedValueOnce: (e: Error) => void }
    ).mockRejectedValueOnce(new Error('network'));
    renderManager();
    fireEvent.click(await screen.findByRole('button', { name: '食費 をアーカイブ' }));
    expect(await screen.findByText(/アーカイブに失敗しました/)).toBeInTheDocument();
  });

  it('アーカイブ済カテゴリが復元セクションに出て、復元で unarchiveCategory が呼ばれる', async () => {
    renderManager();
    // アーカイブ済セクションに旧カテゴリが見える
    expect(await screen.findByText('アーカイブ済')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '旧カテゴリ を復元' }));
    await waitFor(() => expect(unarchiveCategory).toHaveBeenCalledTimes(1));
    expect(
      (unarchiveCategory as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1],
    ).toBe('c-old');
  });

  // ---- #75 削除 ----

  // デフォルト（seed）はアーカイブのみ。ユーザー追加は削除できる。
  it('デフォルトカテゴリはアーカイブ、ユーザー追加は削除のボタンが出る', async () => {
    renderManager();
    // 食費（デフォルト）はアーカイブ、削除ボタンは無い
    expect(await screen.findByRole('button', { name: '食費 をアーカイブ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '食費 を削除' })).toBeNull();
    // カラオケ（ユーザー追加）は削除、アーカイブボタンは無い
    expect(screen.getByRole('button', { name: 'カラオケ を削除' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'カラオケ をアーカイブ' })).toBeNull();
  });

  it('未使用のカテゴリは、確認して削除できる', async () => {
    state.usage = 0;
    renderManager();
    fireEvent.click(await screen.findByRole('button', { name: 'カラオケ を削除' }));

    const dialog = await screen.findByRole('dialog', { name: 'カテゴリを削除' });
    expect(await within(dialog).findByText(/まだどの記録にも使われていません/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '削除する' }));

    await waitFor(() => expect(deleteCategory).toHaveBeenCalledTimes(1));
    expect((deleteCategory as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1]).toBe(
      'c-kar',
    );
  });

  // 使われているカテゴリは FK restrict で消せない。消す前に伝え、アーカイブへ誘導する。
  it('使用中のカテゴリは削除できず、アーカイブに誘導される', async () => {
    state.usage = 5;
    renderManager();
    fireEvent.click(await screen.findByRole('button', { name: 'カラオケ を削除' }));

    const dialog = await screen.findByRole('dialog', { name: 'カテゴリを削除' });
    expect(await within(dialog).findByText(/5 件/)).toBeInTheDocument();
    // 削除ボタンは出ず、アーカイブボタンが出る
    expect(within(dialog).queryByRole('button', { name: '削除する' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'アーカイブする' }));

    await waitFor(() => expect(archiveCategory).toHaveBeenCalledTimes(1));
    expect(deleteCategory).not.toHaveBeenCalled();
    expect((archiveCategory as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1]).toBe(
      'c-kar',
    );
  });
});
