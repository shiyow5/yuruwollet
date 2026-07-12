import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../lib/queryClient';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { CategoryManager } from './CategoryManager';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

vi.mock('../../lib/data/categories', () => ({
  listCategories: vi.fn(async () => [
    {
      id: 'c-exp',
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
      id: 'c-inc',
      household_id: 'main',
      kind: 'income',
      name: '給与',
      icon: 'payments',
      sort_order: 0,
      is_system: false,
      is_archived: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'c-old',
      household_id: 'main',
      kind: 'expense',
      name: '旧カテゴリ',
      icon: 'label',
      sort_order: 2,
      is_system: false,
      is_archived: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ]),
  createCategory: vi.fn(async () => ({ id: 'new', name: '交際費' })),
  archiveCategory: vi.fn(async () => {}),
  unarchiveCategory: vi.fn(async () => {}),
}));

import { createCategory, archiveCategory, unarchiveCategory } from '../../lib/data/categories';

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
  beforeEach(() => vi.clearAllMocks());

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
});
