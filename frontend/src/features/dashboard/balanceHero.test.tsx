import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { BalanceHero } from './BalanceHero';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const getMemberBalances = vi.fn();
vi.mock('../../lib/data/aggregates', () => ({
  getMemberBalances: (...args: unknown[]) => getMemberBalances(...args),
}));

function renderHero() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BalanceHero memberId="yururi" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BalanceHero', () => {
  it('取得成功時は残高を表示', async () => {
    getMemberBalances.mockResolvedValueOnce([
      { household_id: 'main', member_id: 'yururi', display_name: 'ゆるり', balance: 342500 },
    ]);
    renderHero();
    expect(await screen.findByText('¥342,500')).toBeInTheDocument();
  });

  it('取得失敗時は ¥0 を出さずエラーを表示', async () => {
    getMemberBalances.mockRejectedValueOnce(new Error('network'));
    renderHero();
    expect(await screen.findByText('残高を取得できませんでした')).toBeInTheDocument();
    expect(screen.queryByText('¥0')).toBeNull();
  });
});
