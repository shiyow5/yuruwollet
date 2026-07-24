import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionContext } from '../../lib/auth/session-context';
import type { SessionState } from '../../lib/auth/useSession';
import { WishlistBoard } from './WishlistBoard';
import type { WishlistItem } from '../../lib/wishlist/types';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

function item(over: Partial<WishlistItem> = {}): WishlistItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    household_id: 'main',
    registrant_id: 'yururi',
    genre: 'want',
    title: 'コーヒーメーカー',
    url: null,
    memo: '',
    status: 'planned',
    archived: false,
    created_at: '2026-07-13T01:00:00Z',
    updated_at: '2026-07-13T01:00:00Z',
    ...over,
  };
}

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  listFails: false,
  createFails: false,
  completeFails: false,
  /** realtime の購読ハンドル（テストからイベントを流す） */
  realtime: null as {
    onChange: () => void;
    onStatus: (s: string) => void;
  } | null,
  stopped: 0,
}));

vi.mock('../../lib/realtime', () => ({
  REALTIME_AUTH_REFRESH_MS: 600000,
  subscribeToTable: vi.fn(
    (_c: unknown, opts: { onChange: () => void; onStatus: (s: string) => void }) => {
      state.realtime = opts;
      opts.onStatus('connected');
      return () => {
        state.stopped += 1;
      };
    },
  ),
}));

vi.mock('../../lib/data/wishlist', () => ({
  listWishlist: vi.fn(async (_c: unknown, archived: boolean) => {
    if (state.listFails) throw new Error('list failed');
    return (state.rows as WishlistItem[]).filter((r) => r.archived === archived);
  }),
  createWishlistItem: vi.fn(async (_c: unknown, input: Record<string, unknown>) => {
    if (state.createFails) throw new Error('create failed');
    const row = item({
      id: `new-${(state.rows as WishlistItem[]).length}`,
      genre: input.genre as WishlistItem['genre'],
      title: input.title as string,
      url: (input.url ?? null) as string | null,
      memo: input.memo as string,
    });
    state.rows = [row, ...(state.rows as WishlistItem[])];
    return row;
  }),
  completeWishlistItem: vi.fn(async (_c: unknown, id: string) => {
    if (state.completeFails) throw new Error('complete failed');
    state.rows = (state.rows as WishlistItem[]).map((r) =>
      r.id === id ? { ...r, status: 'done' as const, archived: true } : r,
    );
  }),
  restoreWishlistItem: vi.fn(async (_c: unknown, id: string) => {
    state.rows = (state.rows as WishlistItem[]).map((r) =>
      r.id === id ? { ...r, status: 'planned' as const, archived: false } : r,
    );
  }),
  deleteWishlistItem: vi.fn(async (_c: unknown, id: string) => {
    state.rows = (state.rows as WishlistItem[]).filter((r) => r.id !== id);
  }),
}));

vi.mock('../../lib/data/aggregates', () => ({
  listProfiles: vi.fn(async () => [
    { member_id: 'yururi', display_name: 'ゆるり', household_id: 'main' },
    { member_id: 'shiyowo', display_name: 'しよを', household_id: 'main' },
  ]),
  getMemberBalances: vi.fn(async () => []),
  getMonthlySummary: vi.fn(async () => null),
  getCategoryBreakdown: vi.fn(async () => []),
}));

const authedSession: SessionState = {
  status: 'authenticated',
  session: {
    supabaseJwt: 'jwt',
    expiresAt: 9999999999,
    member: { id: 'yururi', displayName: 'ゆるり' },
    householdId: 'main',
  },
};

function renderBoard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={authedSession}>
        <WishlistBoard />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe('WishlistBoard 統合', () => {
  beforeEach(() => {
    state.rows = [];
    state.listFails = false;
    state.createFails = false;
    state.completeFails = false;
    state.realtime = null;
    state.stopped = 0;
    vi.clearAllMocks();
  });

  it('ほしい物タブに want のみを出す（place は出ない）', async () => {
    state.rows = [item(), item({ id: 'p1', genre: 'place', title: '海辺のカフェ' })];
    renderBoard();

    expect(await screen.findByText('コーヒーメーカー')).toBeInTheDocument();
    expect(screen.queryByText('海辺のカフェ')).toBeNull();
  });

  it('行きたい場所タブに切り替えると place のみを出す', async () => {
    state.rows = [item(), item({ id: 'p1', genre: 'place', title: '海辺のカフェ' })];
    renderBoard();
    await screen.findByText('コーヒーメーカー');

    fireEvent.click(screen.getByRole('radio', { name: '行きたい場所' }));

    expect(await screen.findByText('海辺のカフェ')).toBeInTheDocument();
    expect(screen.queryByText('コーヒーメーカー')).toBeNull();
  });

  it('登録者を固定名で表示する', async () => {
    state.rows = [item({ registrant_id: 'shiyowo' })];
    renderBoard();
    expect(await screen.findByText('しよを')).toBeInTheDocument();
  });

  it('タイトルをタップすると詳細が出る（#105）', async () => {
    state.rows = [item({ registrant_id: 'shiyowo', memo: '全自動がいい' })];
    renderBoard();
    fireEvent.click(await screen.findByRole('button', { name: 'コーヒーメーカー の詳細' }));

    const dialog = await screen.findByRole('dialog', { name: 'ウィッシュの詳細' });
    expect(within(dialog).getByText('ほしい物')).toBeInTheDocument(); // ジャンル
    expect(within(dialog).getByText('しよを')).toBeInTheDocument(); // 登録者
    expect(within(dialog).getByText('全自動がいい')).toBeInTheDocument(); // メモ
  });

  it('ステータス文言はジャンルで変わる', async () => {
    state.rows = [item(), item({ id: 'p1', genre: 'place', title: 'カフェ' })];
    renderBoard();
    expect(await screen.findByText('未購入')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: '行きたい場所' }));
    expect(await screen.findByText('未訪問')).toBeInTheDocument();
  });

  it('追加できる', async () => {
    renderBoard();
    fireEvent.click(await screen.findByRole('button', { name: 'ウィッシュを追加' }));

    fireEvent.change(await screen.findByLabelText('タイトル'), {
      target: { value: '空気清浄機' },
    });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));

    expect(await screen.findByText('空気清浄機')).toBeInTheDocument();
  });

  // 共有リストなので、危険な URL を登録できると相手を攻撃できてしまう
  it('javascript: の URL は登録させない', async () => {
    renderBoard();
    fireEvent.click(await screen.findByRole('button', { name: 'ウィッシュを追加' }));
    fireEvent.change(await screen.findByLabelText('タイトル'), { target: { value: 'わな' } });
    fireEvent.change(screen.getByLabelText('URL（任意）'), {
      target: { value: 'javascript:alert(1)' },
    });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));

    expect(await screen.findByText(/http\(s\) の URL/)).toBeInTheDocument();
    expect(screen.queryByText('わな')).toBeNull();
  });

  // 検証前のデータや DB 直書きで危険な URL が残っている可能性がある
  it('保存済みの危険な URL はリンクとして描画しない', async () => {
    state.rows = [item({ url: 'javascript:alert(1)', title: 'わな' })];
    renderBoard();
    await screen.findByText('わな');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('安全な URL は新規タブリンクとして描画する', async () => {
    state.rows = [item({ url: 'https://example.com/x' })];
    renderBoard();
    const link = await screen.findByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com/x');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('「買った！」で思い出アーカイブへ移動する（削除しない）', async () => {
    state.rows = [item()];
    renderBoard();
    fireEvent.click(await screen.findByRole('button', { name: '買った！' }));

    // 現役リストから消える
    await waitFor(() => expect(screen.queryByText('コーヒーメーカー')).toBeNull());

    // 思い出タブには残っている（購入済み）
    fireEvent.click(screen.getByRole('radio', { name: '思い出' }));
    const card = (await screen.findByText('コーヒーメーカー')).closest('li')!;
    expect(within(card).getByText('購入済み')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'リストに戻す' })).toBeInTheDocument();
  });

  it('思い出から現役リストへ戻せる', async () => {
    state.rows = [item({ status: 'done', archived: true })];
    renderBoard();
    fireEvent.click(screen.getByRole('radio', { name: '思い出' }));
    fireEvent.click(await screen.findByRole('button', { name: 'リストに戻す' }));

    await waitFor(() => expect(screen.queryByText('コーヒーメーカー')).toBeNull());

    fireEvent.click(screen.getByRole('radio', { name: 'ほしい物' }));
    expect(await screen.findByText('コーヒーメーカー')).toBeInTheDocument();
  });

  it('削除は確認してから消す（家計簿と揃える, #95）', async () => {
    state.rows = [item()];
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderBoard();
    fireEvent.click(await screen.findByRole('button', { name: 'コーヒーメーカー を削除' }));

    expect(confirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('コーヒーメーカー')).toBeNull());
    confirm.mockRestore();
  });

  it('確認をキャンセルしたら消さない（#95）', async () => {
    state.rows = [item()];
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderBoard();
    fireEvent.click(await screen.findByRole('button', { name: 'コーヒーメーカー を削除' }));

    expect(confirm).toHaveBeenCalledTimes(1);
    // 消えない
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText('コーヒーメーカー')).toBeInTheDocument();
    confirm.mockRestore();
  });

  // 相手が別端末で追加した変更が自分の画面に反映される
  it('Realtime の変更通知で一覧を取り直す', async () => {
    renderBoard();
    await screen.findByText('ほしい物はまだありません');

    // 相手が追加した体でサーバ側の行を差し替え、変更イベントを流す
    state.rows = [item({ registrant_id: 'shiyowo', title: '相手が追加した物' })];
    act(() => state.realtime!.onChange());

    expect(await screen.findByText('相手が追加した物')).toBeInTheDocument();
  });

  it('購読が切れたら同期が止まっていることを伝える', async () => {
    renderBoard();
    await screen.findByText('ほしい物はまだありません');
    expect(screen.queryByText(/リアルタイム同期が切れています/)).toBeNull();

    act(() => state.realtime!.onStatus('error'));
    expect(await screen.findByText(/リアルタイム同期が切れています/)).toBeInTheDocument();
  });

  it('アンマウントで購読を解除する', async () => {
    const { unmount } = renderBoard();
    await screen.findByText('ほしい物はまだありません');
    unmount();
    expect(state.stopped).toBe(1);
  });

  it('取得に失敗したらエラーを表示する（空リストに見せない）', async () => {
    state.listFails = true;
    renderBoard();
    expect(await screen.findByText(/ウィッシュリストを取得できませんでした/)).toBeInTheDocument();
    expect(screen.queryByText('ほしい物はまだありません')).toBeNull();
  });

  it('追加に失敗したらエラーを表示する', async () => {
    state.createFails = true;
    renderBoard();
    fireEvent.click(await screen.findByRole('button', { name: 'ウィッシュを追加' }));
    fireEvent.change(await screen.findByLabelText('タイトル'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));

    expect(await screen.findByText(/追加できませんでした/)).toBeInTheDocument();
  });

  it('「済み」に失敗したらエラーを表示する', async () => {
    state.rows = [item()];
    state.completeFails = true;
    renderBoard();
    fireEvent.click(await screen.findByRole('button', { name: '買った！' }));
    expect(await screen.findByText(/complete failed/)).toBeInTheDocument();
  });
});
