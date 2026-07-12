import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CategoryBreakdownCard } from './CategoryBreakdownCard';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const getCategoryBreakdown = vi.fn();
vi.mock('../../lib/data/aggregates', () => ({
  getCategoryBreakdown: (...a: unknown[]) => getCategoryBreakdown(...a),
}));

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CategoryBreakdownCard memberId="yururi" month="2026-07-01" />
    </QueryClientProvider>,
  );
}

describe('CategoryBreakdownCard', () => {
  it('取得失敗時はエラー表示（0円扱いにしない）', async () => {
    getCategoryBreakdown.mockRejectedValueOnce(new Error('network'));
    renderCard();
    expect(await screen.findByText('カテゴリ別支出を読み込めませんでした')).toBeInTheDocument();
    expect(screen.queryByText('今月の支出はまだありません')).toBeNull();
  });

  it('データ0件は空表示', async () => {
    getCategoryBreakdown.mockResolvedValueOnce([]);
    renderCard();
    expect(await screen.findByText('今月の支出はまだありません')).toBeInTheDocument();
  });
});
